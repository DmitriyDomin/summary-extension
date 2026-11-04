require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const store = require('../library-store.js');
const lib = require('../library-search.js');
const { LibrarySearch } = lib;

async function resetDb() {
  await store._close();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('summary-library');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
}
beforeEach(resetDb);

// Deterministic fake embedding model: one dimension per concept so that related words land close.
const CONCEPTS = [
  ['cook', 'recipe', 'pasta', 'kitchen', 'bake', 'dinner'],
  ['react', 'component', 'hook', 'frontend', 'javascript'],
  ['invest', 'stock', 'finance', 'money', 'portfolio'],
];
function fakeVector(text) {
  const tokens = lib.tokenize(text);
  const v = CONCEPTS.map((words) => tokens.filter((t) => words.some((w) => t.startsWith(w))).length);
  v.push(0.01);
  return v;
}
function fakeFetch(log = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    log.push({ url, body });
    if (url.includes('openai.com')) {
      return { ok: true, json: async () => ({ data: body.input.map((t, index) => ({ index, embedding: fakeVector(t) })) }) };
    }
    return { ok: true, json: async () => ({ embeddings: body.requests.map((r) => ({ values: fakeVector(r.content.parts[0].text) })) }) };
  };
}

const video = (id, title, summary, transcript, extra = {}) => ({
  videoId: id,
  title,
  url: `https://www.youtube.com/watch?v=${id}`,
  summary,
  transcript,
  timestampedTranscript: [],
  chatHistory: [],
  savedAt: '2025-01-01T00:00:00.000Z',
  ...extra,
});

test('tokenize lowercases, strips diacritics and keeps non-Latin scripts', () => {
  assert.deepStrictEqual(lib.tokenize('Café, DÉJÀ-vu! 42'), ['cafe', 'deja', 'vu', '42']);
  assert.deepStrictEqual(lib.tokenize('Привіт світе'), ['привіт', 'світе']);
  assert.deepStrictEqual(lib.tokenize('a b'), []);
});

test('chunkText splits long text on word boundaries with overlap and terminates', () => {
  const text = Array.from({ length: 800 }, (_, i) => `word${i}`).join(' ');
  const chunks = lib.chunkText(text, 900, 150);
  assert.ok(chunks.length > 4);
  chunks.forEach((c) => assert.ok(c.length <= 900));
  assert.ok(chunks[0].endsWith('word' + (chunks[0].split(' ').length - 1)), 'no split mid-word');
  const overlap = chunks[0].split(' ').slice(-3).join(' ');
  assert.ok(chunks[1].includes(overlap.split(' ')[0]));
  assert.deepStrictEqual(lib.chunkText('   '), []);
  assert.deepStrictEqual(lib.chunkText('short'), ['short']);
});

test('chunkSegments keeps the start time of each chunk', () => {
  const segments = Array.from({ length: 100 }, (_, i) => ({ text: `segment number ${i} of the video`, startTime: i * 5 }));
  const chunks = lib.chunkSegments(segments, 300);
  assert.ok(chunks.length > 3);
  assert.strictEqual(chunks[0].start, 0);
  assert.ok(chunks[1].start > 0);
});

test('rank fusion rewards items that appear in both rankings', () => {
  const fused = lib.reciprocalRankFusion([[1, 2, 3], [3, 4, 1]]);
  assert.deepStrictEqual(fused.map(([i]) => i).slice(0, 2), [1, 3]);
});

test('keyword search works with no API key and returns the best video first', async () => {
  await store.putVideo(video('a', 'Pasta night', 'How to cook fresh pasta at home', 'boil water add salt and flour for the dough'));
  await store.putVideo(video('b', 'React hooks', 'Understanding hooks in React components', 'useState and useEffect explained'));
  const search = new LibrarySearch({ store, getConfig: async () => null });
  await search.indexAll();

  const { results, mode } = await search.search('pasta dough');
  assert.strictEqual(mode, 'keyword');
  assert.strictEqual(results[0].ref, 'a');
  assert.ok(!results.some((r) => r.ref === 'b'));
  assert.strictEqual(results[0].link, 'https://www.youtube.com/watch?v=a');
});

test('hybrid search finds a related video that shares no words with the query', async () => {
  await store.putVideo(video('a', 'Pasta night', 'A recipe for dinner', 'we cook in the kitchen'));
  await store.putVideo(video('b', 'React hooks', 'Frontend component patterns', 'javascript hook basics'));
  const log = [];
  const search = new LibrarySearch({
    store,
    fetchFn: fakeFetch(log),
    getConfig: async () => ({ provider: 'openai', key: 'test-key' }),
  });
  await search.indexAll();

  // "bake" never appears in the text, so only the embeddings connect it to the cooking video.
  const { results, mode } = await search.search('bake');
  assert.strictEqual(mode, 'hybrid');
  assert.strictEqual(results[0].ref, 'a');
  assert.ok(log.every((c) => c.url.includes('openai.com')));
  assert.ok(log.some((c) => c.body.dimensions === 512));
});

test('google provider sends the key in a header and the right task types', async () => {
  await store.putVideo(video('a', 'Money', 'Investing basics', 'stock portfolio'));
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return fakeFetch()(url, init);
  };
  const search = new LibrarySearch({ store, fetchFn, getConfig: async () => ({ provider: 'google', key: 'g-key' }) });
  await search.indexAll();
  await search.search('finance');
  assert.ok(seen.every((c) => !c.url.includes('g-key')), 'key must not be in the URL');
  assert.ok(seen.every((c) => c.headers['x-goog-api-key'] === 'g-key'));
  assert.strictEqual(seen[0].body.requests[0].taskType, 'RETRIEVAL_DOCUMENT');
  assert.strictEqual(seen[seen.length - 1].body.requests[0].taskType, 'RETRIEVAL_QUERY');
});

test('embedding failures fall back to keyword search and are reported', async () => {
  await store.putVideo(video('a', 'Pasta night', 'Cook pasta', 'pasta pasta'));
  const failing = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) });
  const search = new LibrarySearch({ store, fetchFn: failing, getConfig: async () => ({ provider: 'openai', key: 'x' }) });
  const outcome = await search.indexAll();
  assert.match(outcome.error, /bad key/);
  const { results, mode } = await search.search('pasta');
  assert.strictEqual(mode, 'keyword');
  assert.strictEqual(results[0].ref, 'a');
});

test('indexAll skips unchanged documents and re-embeds when the provider changes', async () => {
  await store.putVideo(video('a', 'Pasta night', 'Cook pasta', 'pasta pasta'));
  const log = [];
  let config = null;
  const search = new LibrarySearch({ store, fetchFn: fakeFetch(log), getConfig: async () => config });

  assert.strictEqual((await search.indexAll()).indexed, 1);
  assert.strictEqual((await search.indexAll()).indexed, 0);

  config = { provider: 'openai', key: 'k' };
  assert.strictEqual((await search.indexAll()).indexed, 1, 'adds vectors once a key exists');
  const callsAfterFirstEmbed = log.length;
  assert.strictEqual((await search.indexAll()).indexed, 0);
  assert.strictEqual(log.length, callsAfterFirstEmbed);

  config = { provider: 'google', key: 'k' };
  assert.strictEqual((await search.indexAll()).indexed, 1, 're-embeds with the new model');

  await store.putVideo(video('a', 'Pasta night', 'Cook pasta better', 'pasta pasta', { lastUpdated: 'later' }));
  assert.strictEqual((await search.indexAll()).indexed, 1, 're-indexes changed content');
});

test('page summaries and video chat history are searchable', async () => {
  const id = await store.addSummary({ summary: 'Quarterly invoice reconciliation checklist', tags: ['accounting'], timestamp: 't' });
  await store.putVideo(
    video('a', 'Intro', 'General intro', 'hello', {
      chatHistory: [
        { type: 'summary', response: 'General intro' },
        { type: 'chat', message: 'what about kubernetes?', response: 'Kubernetes schedules containers' },
      ],
    })
  );
  const search = new LibrarySearch({ store, getConfig: async () => null });
  await search.indexAll();

  const invoice = await search.search('invoice');
  assert.strictEqual(invoice.results[0].kind, 'summary');
  assert.strictEqual(invoice.results[0].ref, id);

  const k8s = await search.search('kubernetes');
  assert.strictEqual(k8s.results[0].ref, 'a');
  assert.strictEqual(k8s.results[0].section, 'chat');
});

test('video results deep-link to the timestamp of the matching transcript chunk', async () => {
  const segments = Array.from({ length: 60 }, (_, i) => ({
    text: i === 45 ? 'the quokka is a small marsupial' : `filler sentence number ${i} with nothing special`,
    startTime: i * 10,
  }));
  await store.putVideo(video('a', 'Animals', '', segments.map((s) => s.text).join(' '), { timestampedTranscript: segments }));
  const search = new LibrarySearch({ store, getConfig: async () => null });
  await search.indexAll();
  const { results } = await search.search('quokka marsupial');
  assert.strictEqual(results[0].section, 'transcript');
  assert.ok(results[0].start > 0 && results[0].start <= 450);
  assert.match(results[0].link, /&t=\d+s$/);
  assert.match(results[0].snippet, /quokka/);
});

test('deleting a video removes it from search results', async () => {
  await store.putVideo(video('a', 'Pasta night', 'Cook pasta', 'pasta'));
  const search = new LibrarySearch({ store, getConfig: async () => null });
  await search.indexAll();
  assert.strictEqual((await search.search('pasta')).results.length, 1);
  await store.deleteVideo('a');
  search.invalidate();
  assert.strictEqual((await search.search('pasta')).results.length, 0);
});

test('Udemy lectures link to their own page, not a YouTube URL', async () => {
  await store.putVideo(
    video('udemy_123_Intro', 'Python Bootcamp - Decorators', 'Decorators wrap functions', 'closures and decorators', {
      url: 'https://www.udemy.com/course/python-bootcamp/learn/lecture/42',
    })
  );
  const search = new LibrarySearch({ store, getConfig: async () => null });
  await search.indexAll();
  const { results } = await search.search('decorators');
  assert.strictEqual(results[0].platform, 'udemy');
  assert.strictEqual(results[0].link, 'https://www.udemy.com/course/python-bootcamp/learn/lecture/42');
});

test('a failed embedding attempt is not retried on every sync', async () => {
  await store.putVideo(video('a', 'Pasta night', 'Cook pasta', 'pasta pasta'));
  let calls = 0;
  const failing = async () => {
    calls++;
    return { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) };
  };
  const search = new LibrarySearch({ store, fetchFn: failing, getConfig: async () => ({ provider: 'google', key: 'x' }) });
  assert.strictEqual((await search.indexAll()).indexed, 1);
  const afterFirst = calls;
  assert.strictEqual((await search.indexAll()).indexed, 0, 'skipped within the retry window');
  assert.strictEqual(calls, afterFirst);
  // Search still works from the keyword index.
  assert.strictEqual((await search.search('pasta')).results[0].ref, 'a');
});
