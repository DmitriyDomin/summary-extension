// Library search: hybrid keyword (BM25) + semantic (embeddings) search over saved videos and
// page summaries. Everything is computed in the browser against the IndexedDB library store.
// Keyword search always works. Semantic search is added when the user has an OpenAI or Google
// API key; vectors are tiny (512/768 floats per ~900-character chunk) so brute-force cosine
// similarity over thousands of chunks takes milliseconds and no vector database is needed.
(function (root) {
  'use strict';

  const CHUNK_CHARS = 900;
  const CHUNK_OVERLAP = 150;
  const MAX_TRANSCRIPT_CHARS = 120000;
  const MAX_CHAT_CHARS = 30000;
  const RRF_K = 60;
  const BM25_K1 = 1.4;
  const BM25_B = 0.75;
  const SEMANTIC_MIN_SCORE = 0.25;
  const CANDIDATES = 60;
  const EMBED_RETRY_MS = 60 * 60 * 1000;

  const MODELS = {
    openai: { name: 'text-embedding-3-small', dims: 512, batch: 64 },
    google: { name: 'gemini-embedding-001', dims: 768, batch: 50 },
  };

  const modelTag = (provider) => `${provider}:${MODELS[provider].name}:${MODELS[provider].dims}`;

  // Text helpers ---------------------------------------------------------------------------
  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1);
  }

  function chunkText(text, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    if (clean.length <= size) return [clean];
    const out = [];
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + size, clean.length);
      if (end < clean.length) {
        const space = clean.lastIndexOf(' ', end);
        if (space > start + size * 0.5) end = space;
      }
      out.push(clean.slice(start, end).trim());
      if (end >= clean.length) break;
      start = Math.max(end - overlap, start + 1);
      const nextSpace = clean.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace < end) start = nextSpace + 1;
    }
    return out;
  }

  // Groups timestamped caption segments into chunks and remembers where each one starts.
  function chunkSegments(segments, size = CHUNK_CHARS) {
    const out = [];
    let text = '';
    let start = null;
    for (const seg of segments) {
      const piece = String(seg && seg.text ? seg.text : '').trim();
      if (!piece) continue;
      if (text && text.length + piece.length + 1 > size) {
        out.push({ text, start });
        text = '';
        start = null;
      }
      if (start === null) start = typeof seg.startTime === 'number' ? seg.startTime : null;
      text = text ? `${text} ${piece}` : piece;
    }
    if (text) out.push({ text, start });
    return out;
  }

  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  // Splits a saved video or page summary into searchable chunks.
  function buildChunks(doc) {
    const base = { kind: doc.kind, ref: doc.ref, title: doc.title || '', url: doc.url || '' };
    const chunks = [];

    const summaryText = [doc.summary, doc.bulletPoints, doc.questions].filter(Boolean).join('\n\n');
    chunkText(summaryText).forEach((text) => chunks.push({ ...base, section: 'summary', text }));

    if (doc.kind === 'video') {
      const segments = Array.isArray(doc.timestampedTranscript) ? doc.timestampedTranscript : [];
      if (segments.length) {
        let total = 0;
        for (const piece of chunkSegments(segments)) {
          if (total >= MAX_TRANSCRIPT_CHARS) break;
          total += piece.text.length;
          chunks.push({ ...base, section: 'transcript', text: piece.text, start: piece.start });
        }
      } else if (doc.transcript) {
        chunkText(String(doc.transcript).slice(0, MAX_TRANSCRIPT_CHARS)).forEach((text) =>
          chunks.push({ ...base, section: 'transcript', text })
        );
      }

      const chat = (Array.isArray(doc.chatHistory) ? doc.chatHistory : [])
        .filter((m) => m && m.type !== 'summary' && m.response)
        .map((m) => `Q: ${m.message || ''}\nA: ${m.response}`)
        .join('\n\n')
        .slice(0, MAX_CHAT_CHARS);
      chunkText(chat).forEach((text) => chunks.push({ ...base, section: 'chat', text }));
    }
    return chunks;
  }

  // Ranking helpers ------------------------------------------------------------------------
  function normalizeVector(values) {
    const v = Float32Array.from(values);
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    const norm = Math.sqrt(sum) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
  }

  function dot(a, b) {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  // Returns indices of matching entries, best first.
  function bm25Rank(queryTokens, index, limit = CANDIDATES) {
    const { entries, df, avgLen } = index;
    const n = entries.length;
    const terms = [...new Set(queryTokens)];
    const scored = [];
    for (let i = 0; i < n; i++) {
      const { tf, len } = entries[i];
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (!f) continue;
        const d = df.get(term) || 0;
        const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
        score += (idf * f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + (BM25_B * len) / (avgLen || 1)));
      }
      if (score > 0) scored.push([i, score]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, limit).map(([i]) => i);
  }

  function buildBm25Index(chunks) {
    const entries = chunks.map((c) => {
      const tokens = tokenize(`${c.title} ${c.text}`);
      const tf = new Map();
      tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      return { tf, len: tokens.length };
    });
    const df = new Map();
    entries.forEach(({ tf }) => tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const avgLen = entries.reduce((s, e) => s + e.len, 0) / (entries.length || 1);
    return { entries, df, avgLen };
  }

  function reciprocalRankFusion(rankings, k = RRF_K) {
    const scores = new Map();
    rankings.forEach((ranking) =>
      ranking.forEach((idx, rank) => scores.set(idx, (scores.get(idx) || 0) + 1 / (k + rank + 1)))
    );
    return [...scores.entries()].sort((a, b) => b[1] - a[1]);
  }

  function makeSnippet(text, queryTokens, maxLen = 260) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    const lower = clean.toLowerCase();
    let pos = -1;
    for (const token of queryTokens) {
      const i = lower.indexOf(token);
      if (i !== -1 && (pos === -1 || i < pos)) pos = i;
    }
    const start = Math.max(0, (pos === -1 ? 0 : pos) - 60);
    const end = Math.min(clean.length, start + maxLen);
    return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
  }

  // Search engine --------------------------------------------------------------------------
  class LibrarySearch {
    constructor({ store, fetchFn, getConfig } = {}) {
      this.store = store;
      this.fetchFn = fetchFn || ((...args) => root.fetch(...args));
      this.getConfig = getConfig || defaultGetConfig;
      this.cache = null;
      this.indexing = null;
      this.status = { indexing: false, done: 0, total: 0, error: null };
      this.listeners = new Set();
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    _setStatus(patch) {
      this.status = { ...this.status, ...patch };
      this.listeners.forEach((fn) => {
        try {
          fn(this.status);
        } catch (_) {
          /* listener errors must not break indexing */
        }
      });
    }

    invalidate() {
      this.cache = null;
    }

    async _embed(texts, config, taskType) {
      const model = MODELS[config.provider];
      const vectors = [];
      for (let i = 0; i < texts.length; i += model.batch) {
        const batch = texts.slice(i, i + model.batch);
        const result = await this._embedBatch(batch, config, taskType);
        result.forEach((v) => vectors.push(normalizeVector(v)));
      }
      return vectors;
    }

    async _embedBatch(batch, config, taskType) {
      const model = MODELS[config.provider];
      let url;
      let init;
      if (config.provider === 'openai') {
        url = 'https://api.openai.com/v1/embeddings';
        init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
          body: JSON.stringify({ model: model.name, input: batch, dimensions: model.dims }),
        };
      } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:batchEmbedContents`;
        init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.key },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: `models/${model.name}`,
              content: { parts: [{ text }] },
              taskType,
              outputDimensionality: model.dims,
            })),
          }),
        };
      }

      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
        const response = await this.fetchFn(url, init);
        if (response.ok) {
          const data = await response.json();
          if (config.provider === 'openai') {
            return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
          }
          return data.embeddings.map((e) => e.values);
        }
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = (body.error && body.error.message) || message;
        } catch (_) {
          /* keep the HTTP status */
        }
        lastError = new Error(`Embedding request failed: ${message}`);
        if (response.status !== 429 && response.status < 500) break;
      }
      throw lastError;
    }

    // (Re)builds the index for one document. Keyword data is always written; vectors are added
    // when an embedding provider is configured and reachable.
    async indexDocument(doc, fingerprint) {
      const chunks = buildChunks(doc);
      const config = await this.getConfig();
      let model = null;
      let embedError = null;

      if (config && chunks.length) {
        try {
          const texts = chunks.map((c) => `${c.title}\n${c.text}`.slice(0, 2000));
          const vectors = await this._embed(texts, config, 'RETRIEVAL_DOCUMENT');
          chunks.forEach((c, i) => {
            c.vector = vectors[i];
          });
          model = modelTag(config.provider);
        } catch (error) {
          embedError = error.message;
        }
      }

      await this.store.replaceChunks(doc.docId, chunks, {
        fingerprint,
        model,
        embedError,
        contentHash: hashString(chunks.map((c) => c.text).join('|')),
      });
      this.invalidate();
      return { chunks: chunks.length, embedded: !!model, embedError };
    }

    async indexVideo(videoId) {
      const video = await this.store.getVideo(videoId);
      if (!video) return null;
      return this.indexDocument(videoToDoc(video), videoFingerprint(video));
    }

    async indexSummary(id) {
      const summaries = await this.store.listSummaries();
      const summary = summaries.find((s) => s.id === id);
      if (!summary) return null;
      return this.indexDocument(summaryToDoc(summary), summaryFingerprint(summary));
    }

    // Brings the index in sync with the library. Cheap when nothing changed.
    indexAll() {
      if (this.indexing) return this.indexing;
      this.indexing = this._indexAll().finally(() => {
        this.indexing = null;
      });
      return this.indexing;
    }

    async _indexAll() {
      const config = await this.getConfig();
      const wantedModel = config ? modelTag(config.provider) : null;
      const states = new Map((await this.store.getIndexState()).map((s) => [s.docId, s]));

      const stale = (docId, fingerprint) => {
        const state = states.get(docId);
        if (!state || state.fingerprint !== fingerprint) return true;
        if (!wantedModel || state.model === wantedModel) return false;
        // A failed embedding attempt is not retried on every visit (bad key, quota, offline).
        const recentFailure = state.embedError && Date.now() - state.updatedAt < EMBED_RETRY_MS;
        return !recentFailure;
      };

      const jobs = [];
      for (const video of await this.store.listVideos()) {
        const fp = videoFingerprint(video);
        if (stale(this.store.docIdForVideo(video.videoId), fp)) jobs.push(() => this.indexVideo(video.videoId));
      }
      for (const summary of await this.store.listSummaries()) {
        const fp = summaryFingerprint(summary);
        if (stale(this.store.docIdForSummary(summary.id), fp)) jobs.push(() => this.indexSummary(summary.id));
      }

      this._setStatus({ indexing: jobs.length > 0, done: 0, total: jobs.length, error: null });
      let firstError = null;
      for (let i = 0; i < jobs.length; i++) {
        try {
          const result = await jobs[i]();
          if (result && result.embedError && !firstError) firstError = result.embedError;
        } catch (error) {
          if (!firstError) firstError = error.message;
        }
        this._setStatus({ done: i + 1 });
      }
      this._setStatus({ indexing: false, error: firstError });
      return { indexed: jobs.length, error: firstError };
    }

    async _load() {
      if (this.cache) return this.cache;
      const chunks = await this.store.getAllChunks();
      this.cache = { chunks, bm25: buildBm25Index(chunks) };
      return this.cache;
    }

    async search(query, { limit = 8 } = {}) {
      const tokens = tokenize(query);
      if (!tokens.length) return { results: [], mode: 'empty', warning: null };

      const { chunks, bm25 } = await this._load();
      if (!chunks.length) return { results: [], mode: 'keyword', warning: null };

      const rankings = [bm25Rank(tokens, bm25)];
      let mode = 'keyword';
      let warning = null;

      const config = await this.getConfig();
      if (config) {
        const wanted = modelTag(config.provider);
        const embeddedIdx = [];
        chunks.forEach((c, i) => {
          if (c.vector && c.vector.length) embeddedIdx.push(i);
        });
        const wantedStates = new Set((await this.store.getIndexState()).filter((s) => s.model === wanted).map((s) => s.docId));
        const usable = embeddedIdx.filter((i) => wantedStates.has(chunks[i].docId));
        if (usable.length) {
          try {
            const [qv] = await this._embed([query], config, 'RETRIEVAL_QUERY');
            const scored = usable
              .map((i) => [i, dot(qv, chunks[i].vector)])
              .filter(([, s]) => s >= SEMANTIC_MIN_SCORE)
              .sort((a, b) => b[1] - a[1])
              .slice(0, CANDIDATES);
            rankings.push(scored.map(([i]) => i));
            mode = 'hybrid';
          } catch (error) {
            warning = `Semantic search unavailable: ${error.message}`;
          }
        }
      }

      const fused = reciprocalRankFusion(rankings);
      const seen = new Set();
      const results = [];
      for (const [idx, score] of fused) {
        const chunk = chunks[idx];
        if (seen.has(chunk.docId)) continue;
        seen.add(chunk.docId);
        results.push(toResult(chunk, tokens, score));
        if (results.length >= limit) break;
      }
      return { results, mode, warning };
    }
  }

  function toResult(chunk, tokens, score) {
    let link = chunk.url || '';
    const isYouTube = /(^|\.)(youtube\.com|youtu\.be)\//.test((chunk.url || '').replace(/^https?:\/\//, ''));
    if (chunk.kind === 'video' && chunk.ref && isYouTube) {
      link = `https://www.youtube.com/watch?v=${chunk.ref}${typeof chunk.start === 'number' ? `&t=${Math.floor(chunk.start)}s` : ''}`;
    }
    return {
      docId: chunk.docId,
      kind: chunk.kind,
      platform: /udemy\.com\//.test(chunk.url || '') ? 'udemy' : chunk.kind === 'video' ? 'youtube' : 'web',
      ref: chunk.ref,
      title: chunk.title,
      section: chunk.section,
      start: typeof chunk.start === 'number' ? chunk.start : null,
      link,
      snippet: makeSnippet(chunk.text, tokens),
      score,
    };
  }

  function videoToDoc(video) {
    return {
      docId: `video:${video.videoId}`,
      kind: 'video',
      ref: video.videoId,
      title: video.title,
      url: video.url,
      summary: video.summary,
      bulletPoints: video.bulletPoints,
      questions: video.questions,
      transcript: video.transcript,
      timestampedTranscript: video.timestampedTranscript,
      chatHistory: video.chatHistory,
    };
  }

  function summaryToDoc(summary) {
    const tags = Array.isArray(summary.tags) ? summary.tags : [];
    return {
      docId: `summary:${summary.id}`,
      kind: 'summary',
      ref: summary.id,
      title: summary.title || tags.join(' · ') || 'Saved summary',
      url: summary.url || '',
      summary: summary.summary,
    };
  }

  // Fingerprints are computed from light records so syncing does not read every transcript.
  const videoFingerprint = (v) =>
    [v.savedAt, v.lastUpdated, v.transcriptLength != null ? v.transcriptLength : (v.transcript || '').length, (v.summary || '').length].join('|');
  const summaryFingerprint = (s) => [s.timestamp, (s.summary || '').length, (s.tags || []).join(',')].join('|');

  async function defaultGetConfig() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    const { apiKey, googleApiKey, aiProvider } = await chrome.storage.local.get(['apiKey', 'googleApiKey', 'aiProvider']);
    const keys = { openai: apiKey, google: googleApiKey };
    const order = aiProvider === 'google' ? ['google', 'openai'] : ['openai', 'google'];
    const provider = order.find((p) => keys[p]);
    return provider ? { provider, key: keys[provider] } : null;
  }

  const api = {
    LibrarySearch,
    tokenize,
    chunkText,
    chunkSegments,
    buildChunks,
    buildBm25Index,
    bm25Rank,
    reciprocalRankFusion,
    normalizeVector,
    dot,
    makeSnippet,
    hashString,
    MODELS,
  };

  root.LibrarySearchLib = api;
  if (root.libraryStore) root.librarySearch = new LibrarySearch({ store: root.libraryStore });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
