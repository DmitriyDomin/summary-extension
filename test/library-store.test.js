require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const store = require('../library-store.js');

async function resetDb() {
  await store._close();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('summary-library');
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = resolve;
  });
  delete globalThis.chrome;
}

const makeVideo = (n, extra = {}) => ({
  videoId: `vid${n}`,
  title: `Video ${n}`,
  url: `https://youtube.com/watch?v=vid${n}`,
  thumbnail: 'x',
  transcript: 'word '.repeat(20000),
  timestampedTranscript: [{ text: 'hello', startTime: 0 }],
  chatHistory: [{ type: 'summary', response: `Summary ${n}` }],
  summary: `Summary ${n}`,
  savedAt: new Date(2025, 0, n).toISOString(),
  ...extra,
});

beforeEach(resetDb);

test('stores far more than the ~10 videos the old chrome.storage layout allowed', async () => {
  for (let i = 1; i <= 60; i++) await store.putVideo(makeVideo(i));
  const list = await store.listVideos();
  assert.strictEqual(list.length, 60);
  assert.strictEqual(list[0].videoId, 'vid1');
  assert.strictEqual(list[59].videoId, 'vid60');
});

test('listVideos omits heavy fields, getVideo returns them', async () => {
  await store.putVideo(makeVideo(1));
  const [light] = await store.listVideos();
  assert.strictEqual(light.transcript, undefined);
  assert.strictEqual(light.chatHistory, undefined);
  assert.strictEqual(light.hasTranscript, true);
  assert.ok(light.transcriptLength > 1000);
  const full = await store.getVideo('vid1');
  assert.ok(full.transcript.length > 1000);
  assert.strictEqual(full.chatHistory.length, 1);
});

test('putVideo overwrites by videoId and hasVideo reflects state', async () => {
  assert.strictEqual(await store.hasVideo('vid1'), false);
  await store.putVideo(makeVideo(1));
  await store.putVideo(makeVideo(1, { title: 'Renamed' }));
  assert.strictEqual(await store.hasVideo('vid1'), true);
  assert.strictEqual((await store.listVideos()).length, 1);
  assert.strictEqual((await store.getVideo('vid1')).title, 'Renamed');
});

test('deleteVideo also removes its session and search chunks', async () => {
  await store.putVideo(makeVideo(1));
  await store.putVideo(makeVideo(2));
  await store.putSession('vid1', { timestamp: Date.now(), chatHistory: [] });
  await store.replaceChunks('video:vid1', [{ text: 'a' }, { text: 'b' }], { model: 'm' });
  await store.replaceChunks('video:vid2', [{ text: 'c' }], { model: 'm' });

  await store.deleteVideo('vid1');

  assert.strictEqual(await store.getVideo('vid1'), null);
  assert.strictEqual(await store.getSession('vid1'), null);
  const chunks = await store.getAllChunks();
  assert.deepStrictEqual(chunks.map((c) => c.docId), ['video:vid2']);
  assert.deepStrictEqual((await store.getIndexState()).map((s) => s.docId), ['video:vid2']);
});

test('summaries get ids, can be listed and deleted', async () => {
  const a = await store.addSummary({ summary: 'A', tags: ['x'], timestamp: 't1' });
  const b = await store.addSummary({ summary: 'B', tags: ['y'], timestamp: 't2' });
  assert.notStrictEqual(a, b);
  let list = await store.listSummaries();
  assert.deepStrictEqual(list.map((s) => s.summary), ['A', 'B']);
  assert.strictEqual(list[0].id, a);
  await store.deleteSummary(a);
  list = await store.listSummaries();
  assert.deepStrictEqual(list.map((s) => s.summary), ['B']);
});

test('replaceChunks replaces previous chunks and records index state', async () => {
  await store.replaceChunks('video:v', [{ text: 'old1' }, { text: 'old2' }], { model: 'm1', hash: 'h1' });
  await store.replaceChunks('video:v', [{ text: 'new', vector: new Float32Array([1, 2]) }], { model: 'm2', hash: 'h2' });
  const chunks = await store.getAllChunks();
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].text, 'new');
  assert.deepStrictEqual(Array.from(chunks[0].vector), [1, 2]);
  const [state] = await store.getIndexState();
  assert.strictEqual(state.model, 'm2');
  assert.strictEqual(state.chunkCount, 1);
});

test('old sessions are pruned on open, recent ones stay', async () => {
  await store.putSession('fresh', { timestamp: Date.now() });
  await store.putSession('stale', { timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 });
  await store._close();
  assert.ok(await store.getSession('fresh'));
  assert.strictEqual(await store.getSession('stale'), null);
});

test('migrates the old chrome.storage layout once and clears the legacy keys', async () => {
  const data = {
    savedVideos: [makeVideo(1), makeVideo(2)],
    savedSummaries: [{ summary: 'Page', tags: ['t'], timestamp: 'now' }],
    liveChatSession_vid1: { timestamp: Date.now(), chatHistory: [], videoData: { videoId: 'vid1' } },
    apiKey: 'keep-me',
  };
  const removed = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ ...data }),
        remove: async (keys) => keys.forEach((k) => { removed.push(k); delete data[k]; }),
      },
    },
  };

  const videos = await store.listVideos();
  assert.deepStrictEqual(videos.map((v) => v.videoId), ['vid1', 'vid2']);
  assert.strictEqual((await store.listSummaries())[0].summary, 'Page');
  assert.ok(await store.getSession('vid1'));
  assert.deepStrictEqual(removed.sort(), ['liveChatSession_vid1', 'savedSummaries', 'savedVideos']);
  assert.strictEqual(data.apiKey, 'keep-me');

  // A second open must not re-import stale data over newer edits.
  await store.putVideo(makeVideo(1, { title: 'Edited' }));
  data.savedVideos = [makeVideo(1, { title: 'Stale' })];
  await store._close();
  assert.strictEqual((await store.getVideo('vid1')).title, 'Edited');
});

test('handleMessage serves proxied calls and rejects unknown methods', async () => {
  let reply;
  const respond = (r) => { reply = r; };
  const handled = store.handleMessage({ action: 'library', method: 'putVideo', args: [makeVideo(5)] }, respond);
  assert.strictEqual(handled, true);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepStrictEqual(reply, { ok: true, result: true });
  assert.ok(await store.getVideo('vid5'));

  assert.strictEqual(store.handleMessage({ action: 'other' }, respond), false);
  assert.strictEqual(store.handleMessage({ action: 'library', method: 'drop' }, respond), false);
  assert.strictEqual(reply.ok, false);
});

test('listVideos reports an estimated size per video', async () => {
  await store.putVideo(makeVideo(1));
  await store.putVideo(makeVideo(2, { transcript: '', timestampedTranscript: [] }));
  const [big, small] = await store.listVideos();
  assert.ok(big.sizeBytes > 100000);
  assert.ok(small.sizeBytes < 200);
});

test('removeTranscript frees the transcript but keeps summary, chat and link', async () => {
  await store.putVideo(makeVideo(1));
  assert.strictEqual(await store.removeTranscript('vid1'), true);
  const video = await store.getVideo('vid1');
  assert.strictEqual(video.transcript, '');
  assert.deepStrictEqual(video.timestampedTranscript, []);
  assert.strictEqual(video.transcriptRemoved, true);
  assert.strictEqual(video.summary, 'Summary 1');
  assert.strictEqual(video.chatHistory.length, 1);
  const [light] = await store.listVideos();
  assert.strictEqual(light.hasTranscript, false);
  assert.ok(light.sizeBytes < 200);
  assert.strictEqual(await store.removeTranscript('missing'), false);
});

test('exportAll returns full videos and summaries; importPlanned adds without overwriting', async () => {
  await store.putVideo(makeVideo(1));
  await store.addSummary({ summary: 'Page one', tags: ['a'], timestamp: 't1' });
  const library = await store.exportAll();
  assert.strictEqual(library.videos.length, 1);
  assert.ok(library.videos[0].transcript.length > 1000);
  assert.strictEqual(library.summaries.length, 1);

  const exportMod = require('../library-export.js');
  const prepared = exportMod.prepareImport(exportMod.buildExport({
    videos: [makeVideo(1, { summary: 'changed' }), makeVideo(2)],
    summaries: [{ summary: 'Page one', tags: ['a'], timestamp: 't1' }, { summary: 'Page two', tags: [], timestamp: 't2' }],
  }));
  const plan = exportMod.planImport(prepared, (await store.listVideos()).map((v) => v.videoId), await store.listSummaries());
  assert.deepStrictEqual(await store.importPlanned(plan), { videos: 1, summaries: 1 });

  assert.strictEqual((await store.getVideo('vid1')).summary, 'Summary 1');
  assert.strictEqual((await store.getVideo('vid2')).title, 'Video 2');
  assert.strictEqual((await store.listSummaries()).length, 2);
});
