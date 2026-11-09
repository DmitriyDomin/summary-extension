// Export/import and Markdown rendering for the saved library, plus storage size helpers.
// Pure functions (no chrome.* or IndexedDB) so they can be unit tested in Node.
(function (root) {
  const FORMAT = 'summary-extension-library';
  const VERSION = 1;

  function approxBytes(video) {
    if (!video) return 0;
    const text = (value) => (typeof value === 'string' ? value.length : 0);
    const json = (value) => (value ? JSON.stringify(value).length : 0);
    return text(video.transcript) + json(video.timestampedTranscript) + json(video.chatHistory) + text(video.summary);
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function buildExport({ videos = [], summaries = [] } = {}, now = new Date()) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: now.toISOString(),
      videos,
      // Database ids belong to this browser only, so they are not exported.
      summaries: summaries.map(({ id, ...rest }) => rest),
    };
  }

  // Validates a parsed JSON file. Throws an Error with a readable message when it is not
  // an export of this extension; otherwise returns only the entries that are usable.
  function prepareImport(data) {
    if (!data || typeof data !== 'object' || data.format !== FORMAT) {
      throw new Error('This file is not a library export from this extension.');
    }
    if (data.version > VERSION) {
      throw new Error('This export was made by a newer version of the extension. Update the extension and try again.');
    }
    const videos = Array.isArray(data.videos) ? data.videos : [];
    const summaries = Array.isArray(data.summaries) ? data.summaries : [];

    const validVideos = videos.filter((v) => v && typeof v === 'object' && typeof v.videoId === 'string' && v.videoId);
    const validSummaries = summaries
      .filter((s) => s && typeof s === 'object' && typeof s.summary === 'string' && s.summary.trim())
      .map(({ id, ...rest }) => ({ ...rest, tags: Array.isArray(rest.tags) ? rest.tags : [] }));

    return {
      videos: validVideos,
      summaries: validSummaries,
      skipped: videos.length - validVideos.length + (summaries.length - validSummaries.length),
    };
  }

  const summaryKey = (s) => `${s.timestamp || ''}|${s.summary}`;

  // Decides what an import adds: videos that are not saved yet and summaries not seen before.
  function planImport(prepared, existingVideoIds, existingSummaries) {
    const haveVideo = new Set(existingVideoIds);
    const haveSummary = new Set(existingSummaries.map(summaryKey));
    const newVideos = [];
    const newSummaries = [];
    prepared.videos.forEach((v) => {
      if (!haveVideo.has(v.videoId)) {
        haveVideo.add(v.videoId);
        newVideos.push(v);
      }
    });
    prepared.summaries.forEach((s) => {
      const key = summaryKey(s);
      if (!haveSummary.has(key)) {
        haveSummary.add(key);
        newSummaries.push(s);
      }
    });
    return {
      newVideos,
      newSummaries,
      duplicates: prepared.videos.length - newVideos.length + (prepared.summaries.length - newSummaries.length),
    };
  }

  const clean = (text) => String(text || '').trim();

  function dateOf(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  function videoToMarkdown(video) {
    const lines = [`## ${clean(video.title) || 'Untitled video'}`, ''];
    const meta = [];
    if (video.url) meta.push(`[${video.platform === 'udemy' ? 'Open lecture' : 'Watch'}](${video.url})`);
    if (dateOf(video.savedAt)) meta.push(`Saved ${dateOf(video.savedAt)}`);
    if (meta.length) lines.push(meta.join(' · '), '');
    lines.push(clean(video.summary) || '_No summary saved._', '');

    const chats = (video.chatHistory || []).filter((c) => c && c.type !== 'summary' && c.response);
    if (chats.length) {
      lines.push('### Questions and answers', '');
      chats.forEach((c) => {
        if (c.message) lines.push(`**${clean(c.message)}**`, '');
        lines.push(clean(c.response), '');
      });
    }
    return lines.join('\n');
  }

  function summaryToMarkdown(summary) {
    const tags = (summary.tags || []).filter(Boolean);
    const head = tags.length ? tags.join(', ') : 'Page summary';
    const lines = [`## ${head}`, ''];
    if (dateOf(summary.timestamp)) lines.push(`Saved ${dateOf(summary.timestamp)}`, '');
    lines.push(clean(summary.summary), '');
    return lines.join('\n');
  }

  function libraryToMarkdown({ videos = [], summaries = [] } = {}, now = new Date()) {
    const parts = [`# My summaries`, '', `Exported ${now.toISOString().slice(0, 10)}`, ''];
    if (videos.length) {
      parts.push('# Videos and lectures', '');
      videos.forEach((v) => parts.push(videoToMarkdown(v)));
    }
    if (summaries.length) {
      parts.push('# Pages', '');
      summaries.forEach((s) => parts.push(summaryToMarkdown(s)));
    }
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  const api = {
    FORMAT,
    VERSION,
    approxBytes,
    formatBytes,
    buildExport,
    prepareImport,
    planImport,
    videoToMarkdown,
    summaryToMarkdown,
    libraryToMarkdown,
  };
  root.LibraryExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
