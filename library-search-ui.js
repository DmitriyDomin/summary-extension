// Search box for the Saved page: keyword + semantic search across saved videos and summaries.
class LibrarySearchUI {
  constructor() {
    this.bound = false;
    this.timer = null;
    this.requestId = 0;
  }

  init() {
    this.input = document.getElementById('summaryInput');
    this.statusEl = document.getElementById('librarySearchStatus');
    this.resultsEl = document.getElementById('librarySearchResults');
    this.listEl = document.getElementById('savedSummaries');
    if (!this.input || !this.resultsEl || !window.librarySearch) return;

    if (!this.bound) {
      this.bound = true;
      this.input.placeholder = 'Search your library...';
      this.input.addEventListener('input', () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.run(), 250);
      });
      window.librarySearch.subscribe((status) => this.renderStatus(status));
    }

    // Keep the index in sync with whatever was saved since the last visit.
    window.librarySearch.indexAll().then(() => {
      this.renderStatus(window.librarySearch.status);
      if (this.input.value.trim()) this.run();
    });
    this.renderStatus(window.librarySearch.status);
  }

  async renderStatus(status) {
    if (!this.statusEl) return;
    if (status.indexing) {
      this.statusEl.textContent = `Indexing your library: ${status.done} of ${status.total}...`;
      return;
    }
    const config = await window.librarySearch.getConfig();
    if (status.error) {
      this.statusEl.textContent = `Keyword search is ready. Semantic indexing failed: ${status.error}`;
    } else if (config) {
      const name = config.provider === 'openai' ? 'OpenAI' : 'Google';
      this.statusEl.textContent = `Keyword and semantic search are on (${name} embeddings).`;
    } else {
      this.statusEl.textContent = 'Keyword search is on. Add an OpenAI or Google API key in Settings to also search by meaning.';
    }
  }

  async run() {
    const query = this.input.value.trim();
    const id = ++this.requestId;

    if (!query) {
      this.resultsEl.hidden = true;
      this.resultsEl.innerHTML = '';
      if (this.listEl) this.listEl.hidden = false;
      return;
    }

    let outcome;
    try {
      outcome = await window.librarySearch.search(query, { limit: 10 });
    } catch (error) {
      console.error('Library search failed:', error);
      outcome = { results: [], mode: 'keyword', warning: `Search failed: ${error.message}` };
    }
    if (id !== this.requestId) return;

    if (this.listEl) this.listEl.hidden = true;
    this.resultsEl.hidden = false;
    this.render(outcome, query);
  }

  render({ results, warning }, query) {
    this.resultsEl.innerHTML = '';

    if (warning) {
      const note = document.createElement('div');
      note.className = 'library-search-note';
      note.textContent = warning;
      this.resultsEl.appendChild(note);
    }

    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'library-search-empty';
      empty.textContent = 'Nothing in your saved videos or summaries matches that yet.';
      this.resultsEl.appendChild(empty);
      return;
    }

    const words = query.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
    results.forEach((result) => this.resultsEl.appendChild(this.renderResult(result, words)));
  }

  renderResult(result, words) {
    const card = document.createElement('div');
    card.className = 'library-result';

    const head = document.createElement('div');
    head.className = 'library-result-head';
    const badge = document.createElement('span');
    badge.className = `library-result-badge ${result.kind}`;
    badge.textContent = result.platform === 'udemy' ? 'Lecture' : result.kind === 'video' ? 'Video' : 'Page';
    const title = document.createElement('span');
    title.className = 'library-result-title';
    title.textContent = result.title || 'Untitled';
    head.append(badge, title);

    const snippet = document.createElement('p');
    snippet.className = 'library-result-snippet';
    snippet.innerHTML = LibrarySearchUI.highlight(result.snippet, words);

    const meta = document.createElement('div');
    meta.className = 'library-result-meta';
    const section = { summary: 'Summary', transcript: 'Transcript', chat: 'Your chat' }[result.section];
    if (section) meta.append(this.chip(section));
    if (result.start !== null && result.start !== undefined) meta.append(this.chip(`at ${LibrarySearchUI.formatTime(result.start)}`));

    const actions = document.createElement('div');
    actions.className = 'library-result-actions';
    if (result.link) {
      const open = document.createElement('a');
      open.href = result.link;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = result.platform === 'udemy' ? 'Open lecture' : result.kind === 'video' ? 'Watch' : 'Open page';
      actions.append(open);
    }
    if (result.kind === 'video' && window.summariesManager) {
      const chat = document.createElement('button');
      chat.type = 'button';
      chat.textContent = 'Open in chat';
      chat.addEventListener('click', () => window.summariesManager.loadVideoInLiveChat(result.ref));
      actions.append(chat);
    }

    card.append(head, snippet, meta, actions);
    return card;
  }

  chip(text) {
    const el = document.createElement('span');
    el.className = 'library-result-chip';
    el.textContent = text;
    return el;
  }

  static escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Escapes first, then wraps query words, so page text can never inject markup.
  static highlight(text, words) {
    const safe = LibrarySearchUI.escapeHtml(text);
    if (!words.length) return safe;
    const pattern = words.map((w) => LibrarySearchUI.escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return safe.replace(new RegExp(`(${pattern})`, 'giu'), '<mark>$1</mark>');
  }

  static formatTime(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }
}

window.LibrarySearchUI = LibrarySearchUI;
window.librarySearchUI = new LibrarySearchUI();
if (typeof module !== 'undefined' && module.exports) module.exports = LibrarySearchUI;
