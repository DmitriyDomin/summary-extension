const { test } = require('node:test');
const assert = require('node:assert');
const X = require('../library-export.js');

const video = (n, extra = {}) => ({
  videoId: `v${n}`,
  title: `Video ${n}`,
  url: `https://www.youtube.com/watch?v=v${n}`,
  summary: `Summary ${n}`,
  transcript: 'word '.repeat(100),
  timestampedTranscript: [{ text: 'hi', startTime: 0 }],
  chatHistory: [{ type: 'summary', response: 'S' }, { message: 'Why?', response: 'Because.' }],
  savedAt: '2025-03-04T10:00:00.000Z',
  ...extra,
});

test('formatBytes picks a readable unit', () => {
  assert.strictEqual(X.formatBytes(0), '0 B');
  assert.strictEqual(X.formatBytes(512), '512 B');
  assert.strictEqual(X.formatBytes(2048), '2.0 KB');
  assert.strictEqual(X.formatBytes(150 * 1024), '150 KB');
  assert.strictEqual(X.formatBytes(3.5 * 1024 * 1024), '3.5 MB');
  assert.strictEqual(X.formatBytes(undefined), '0 B');
});

test('approxBytes counts transcript, timestamps, chat and summary', () => {
  const v = video(1);
  const expected = v.transcript.length + JSON.stringify(v.timestampedTranscript).length + JSON.stringify(v.chatHistory).length + v.summary.length;
  assert.strictEqual(X.approxBytes(v), expected);
  assert.strictEqual(X.approxBytes({ videoId: 'x' }), 0);
  assert.strictEqual(X.approxBytes(null), 0);
});

test('buildExport tags the format and drops browser-local summary ids', () => {
  const data = X.buildExport({ videos: [video(1)], summaries: [{ id: 7, summary: 's', tags: ['a'], timestamp: 't' }] }, new Date('2026-01-02T03:04:05Z'));
  assert.strictEqual(data.format, X.FORMAT);
  assert.strictEqual(data.version, 1);
  assert.strictEqual(data.exportedAt, '2026-01-02T03:04:05.000Z');
  assert.deepStrictEqual(data.summaries, [{ summary: 's', tags: ['a'], timestamp: 't' }]);
});

test('prepareImport accepts its own export and round trips', () => {
  const exported = X.buildExport({ videos: [video(1), video(2)], summaries: [{ id: 1, summary: 'p', tags: ['t'], timestamp: 'x' }] });
  const prepared = X.prepareImport(JSON.parse(JSON.stringify(exported)));
  assert.strictEqual(prepared.videos.length, 2);
  assert.strictEqual(prepared.summaries.length, 1);
  assert.strictEqual(prepared.skipped, 0);
});

test('prepareImport rejects foreign or newer files with a clear message', () => {
  assert.throws(() => X.prepareImport({ hello: 'world' }), /not a library export/);
  assert.throws(() => X.prepareImport(null), /not a library export/);
  assert.throws(() => X.prepareImport({ format: X.FORMAT, version: 99 }), /newer version/);
});

test('prepareImport skips malformed entries and counts them', () => {
  const prepared = X.prepareImport({
    format: X.FORMAT,
    version: 1,
    videos: [video(1), { title: 'no id' }, 'text', null],
    summaries: [{ summary: 'ok' }, { summary: '   ' }, { tags: ['x'] }],
  });
  assert.strictEqual(prepared.videos.length, 1);
  assert.strictEqual(prepared.summaries.length, 1);
  assert.deepStrictEqual(prepared.summaries[0].tags, []);
  assert.strictEqual(prepared.skipped, 5);
});

test('planImport adds only what is new, including duplicates inside the file', () => {
  const prepared = { videos: [video(1), video(2), video(2), video(3)], summaries: [{ summary: 'a', timestamp: '1', tags: [] }, { summary: 'b', timestamp: '2', tags: [] }] };
  const plan = X.planImport(prepared, ['v1'], [{ summary: 'a', timestamp: '1' }]);
  assert.deepStrictEqual(plan.newVideos.map((v) => v.videoId), ['v2', 'v3']);
  assert.deepStrictEqual(plan.newSummaries.map((s) => s.summary), ['b']);
  assert.strictEqual(plan.duplicates, 3);
});

test('video markdown has title, link, date, summary and real questions only', () => {
  const md = X.videoToMarkdown(video(1));
  assert.ok(md.startsWith('## Video 1\n'));
  assert.ok(md.includes('[Watch](https://www.youtube.com/watch?v=v1) · Saved 2025-03-04'));
  assert.ok(md.includes('Summary 1'));
  assert.ok(md.includes('### Questions and answers'));
  assert.ok(md.includes('**Why?**\n\nBecause.'));
  assert.ok(!md.includes('\nS\n'), 'the summary turn is not repeated as a question');
  assert.ok(!md.includes('word word'), 'transcripts are not in the Markdown');
});

test('lectures link as lectures, and missing data does not break the output', () => {
  assert.ok(X.videoToMarkdown(video(1, { platform: 'udemy' })).includes('[Open lecture]'));
  const bare = X.videoToMarkdown({ videoId: 'x' });
  assert.ok(bare.includes('## Untitled video'));
  assert.ok(bare.includes('_No summary saved._'));
});

test('libraryToMarkdown groups videos and pages and collapses blank lines', () => {
  const md = X.libraryToMarkdown(
    { videos: [video(1)], summaries: [{ summary: 'Page text', tags: ['News', 'AI'], timestamp: '2025-05-06T00:00:00Z' }] },
    new Date('2026-01-02T00:00:00Z')
  );
  assert.ok(md.startsWith('# My summaries\n\nExported 2026-01-02\n'));
  assert.ok(md.includes('# Videos and lectures'));
  assert.ok(md.includes('# Pages'));
  assert.ok(md.includes('## News, AI\n\nSaved 2025-05-06\n\nPage text'));
  assert.ok(!/\n{3,}/.test(md));
  assert.ok(md.endsWith('\n'));
  assert.strictEqual(X.libraryToMarkdown({}, new Date('2026-01-02T00:00:00Z')), '# My summaries\n\nExported 2026-01-02\n');
});
