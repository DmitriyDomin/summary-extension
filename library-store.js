// Library store: IndexedDB persistence for saved videos, page summaries, live-chat sessions
// and the search index. It replaces chrome.storage.local, which has a hard quota and forced a
// read-modify-write of one giant array on every save (about 10 videos with transcripts).
//
// Context rules:
//  - Side panel and service worker open IndexedDB directly (extension origin).
//  - Content scripts run in the page's origin and cannot see that database, so they proxy every
//    call to the service worker through chrome.runtime.sendMessage({ action: 'library', ... }).
(function (root) {
  'use strict';

  const DB_NAME = 'summary-library';
  const DB_VERSION = 1;
  const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const LEGACY_SESSION_PREFIX = 'liveChatSession_';
  const HEAVY_VIDEO_FIELDS = ['transcript', 'timestampedTranscript', 'chatHistory'];

  let dbPromise = null;

  const reqToPromise = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const txDone = (tx) =>
    new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });

  function isExtensionContext() {
    if (typeof location === 'undefined') return true;
    return location.protocol === 'chrome-extension:';
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('videos', { keyPath: 'videoId' });
        db.createObjectStore('summaries', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('sessions', { keyPath: 'videoId' });
        const chunks = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
        chunks.createIndex('docId', 'docId');
        db.createObjectStore('index', { keyPath: 'docId' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    })
      .then(async (db) => {
        try {
          await migrateLegacyStorage(db);
          await pruneSessions(db);
        } catch (error) {
          console.error('Library maintenance failed:', error);
        }
        return db;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
    return dbPromise;
  }

  // Runs fn inside one transaction. fn may only await IndexedDB requests, otherwise the
  // transaction auto-commits before the next request is issued.
  async function withStores(names, mode, fn) {
    const db = await openDb();
    return runInTx(db, names, mode, fn);
  }

  async function runInTx(db, names, mode, fn) {
    const list = Array.isArray(names) ? names : [names];
    const tx = db.transaction(list, mode);
    const done = txDone(tx);
    done.catch(() => {});
    let result;
    try {
      result = await fn(...list.map((n) => tx.objectStore(n)));
    } catch (error) {
      try {
        tx.abort();
      } catch (_) {
        /* already finished */
      }
      await done.catch(() => {});
      throw error;
    }
    await done;
    return result;
  }

  // One-time import of everything the old chrome.storage.local layout held.
  async function migrateLegacyStorage(db) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    const migrate = async () => {
      const flag = await runInTx(db, 'meta', 'readonly', (meta) => reqToPromise(meta.get('migratedV1')));
      if (flag) return;

      const all = await chrome.storage.local.get(null);
      const videos = Array.isArray(all.savedVideos) ? all.savedVideos.filter((v) => v && v.videoId) : [];
      const summaries = Array.isArray(all.savedSummaries) ? all.savedSummaries.filter(Boolean) : [];
      const sessionKeys = Object.keys(all).filter((k) => k.startsWith(LEGACY_SESSION_PREFIX));

      await runInTx(db, ['videos', 'summaries', 'sessions', 'meta'], 'readwrite', async (v, s, sess, meta) => {
        videos.forEach((video) => v.put(video));
        summaries.forEach((summary) => {
          const { id, ...rest } = summary;
          s.add(rest);
        });
        sessionKeys.forEach((key) => {
          const data = all[key];
          if (data && typeof data === 'object') {
            sess.put({ ...data, videoId: key.slice(LEGACY_SESSION_PREFIX.length) });
          }
        });
        meta.put({
          key: 'migratedV1',
          at: Date.now(),
          videos: videos.length,
          summaries: summaries.length,
          sessions: sessionKeys.length,
        });
      });

      try {
        await chrome.storage.local.remove(['savedVideos', 'savedSummaries', ...sessionKeys]);
      } catch (error) {
        console.warn('Could not remove legacy storage keys after migration:', error);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('summary-library-migration', migrate);
    } else {
      await migrate();
    }
  }

  async function pruneSessions(db) {
    const cutoff = Date.now() - SESSION_MAX_AGE_MS;
    await runInTx(db, 'sessions', 'readwrite', (sessions) =>
      new Promise((resolve, reject) => {
        const req = sessions.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve();
          const ts = cursor.value && cursor.value.timestamp;
          if (typeof ts === 'number' && ts < cutoff) cursor.delete();
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      })
    );
  }

  const lightVideo = (video) => {
    const copy = { ...video };
    HEAVY_VIDEO_FIELDS.forEach((field) => delete copy[field]);
    copy.hasTranscript = !!(video.transcript && video.transcript.length);
    copy.transcriptLength = video.transcript ? video.transcript.length : 0;
    return copy;
  };

  const docIdForVideo = (videoId) => `video:${videoId}`;
  const docIdForSummary = (id) => `summary:${id}`;

  async function deleteChunksFor(chunks, indexStore, docId) {
    const keys = await reqToPromise(chunks.index('docId').getAllKeys(IDBKeyRange.only(docId)));
    keys.forEach((key) => chunks.delete(key));
    indexStore.delete(docId);
  }

  const local = {
    // Videos -----------------------------------------------------------------------------
    // Light records (no transcript, chat history) for lists.
    async listVideos() {
      const videos = await withStores('videos', 'readonly', (store) =>
        new Promise((resolve, reject) => {
          const out = [];
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve(out);
            out.push(lightVideo(cursor.value));
            cursor.continue();
          };
          req.onerror = () => reject(req.error);
        })
      );
      return videos.sort((a, b) => String(a.savedAt || '').localeCompare(String(b.savedAt || '')));
    },

    async getVideo(videoId) {
      return withStores('videos', 'readonly', (store) => reqToPromise(store.get(videoId))).then((v) => v || null);
    },

    async hasVideo(videoId) {
      const key = await withStores('videos', 'readonly', (store) => reqToPromise(store.getKey(videoId)));
      return key !== undefined;
    },

    async putVideo(video) {
      if (!video || !video.videoId) throw new Error('putVideo requires a videoId');
      await withStores('videos', 'readwrite', (store) => reqToPromise(store.put(video)));
      return true;
    },

    async deleteVideo(videoId) {
      await withStores(['videos', 'sessions', 'chunks', 'index'], 'readwrite', async (videos, sessions, chunks, index) => {
        videos.delete(videoId);
        sessions.delete(videoId);
        await deleteChunksFor(chunks, index, docIdForVideo(videoId));
      });
      return true;
    },

    // Page summaries ---------------------------------------------------------------------
    async listSummaries() {
      return withStores('summaries', 'readonly', (store) => reqToPromise(store.getAll()));
    },

    async addSummary(summary) {
      if (!summary) throw new Error('addSummary requires a summary');
      const { id, ...rest } = summary;
      return withStores('summaries', 'readwrite', (store) => reqToPromise(store.add(rest)));
    },

    async deleteSummary(id) {
      await withStores(['summaries', 'chunks', 'index'], 'readwrite', async (summaries, chunks, index) => {
        summaries.delete(id);
        await deleteChunksFor(chunks, index, docIdForSummary(id));
      });
      return true;
    },

    // Live chat sessions (temporary, unsaved conversations) -------------------------------
    async getSession(videoId) {
      return withStores('sessions', 'readonly', (store) => reqToPromise(store.get(videoId))).then((s) => s || null);
    },

    async putSession(videoId, data) {
      await withStores('sessions', 'readwrite', (store) => reqToPromise(store.put({ ...data, videoId })));
      return true;
    },

    async deleteSession(videoId) {
      await withStores('sessions', 'readwrite', (store) => reqToPromise(store.delete(videoId)));
      return true;
    },

    // Search index. Typed-array vectors only survive in extension pages, not through the proxy.
    async replaceChunks(docId, chunks, state) {
      await withStores(['chunks', 'index'], 'readwrite', async (chunkStore, indexStore) => {
        await deleteChunksFor(chunkStore, indexStore, docId);
        chunks.forEach((chunk) => chunkStore.add({ ...chunk, docId }));
        indexStore.put({ ...state, docId, chunkCount: chunks.length, updatedAt: Date.now() });
      });
      return true;
    },

    async getAllChunks() {
      return withStores('chunks', 'readonly', (store) => reqToPromise(store.getAll()));
    },

    async getIndexState() {
      return withStores('index', 'readonly', (store) => reqToPromise(store.getAll()));
    },
  };

  const METHODS = Object.keys(local);

  function remoteCall(method, args) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'library', method, args }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response || !response.ok) {
          reject(new Error((response && response.error) || 'Library request failed'));
        } else {
          resolve(response.result);
        }
      });
    });
  }

  let api;
  if (isExtensionContext()) {
    api = {
      ...local,
      isProxy: false,
      docIdForVideo,
      docIdForSummary,
      // Service worker hook: returns true when the message was a library request.
      handleMessage(request, sendResponse) {
        if (!request || request.action !== 'library') return false;
        if (!METHODS.includes(request.method)) {
          sendResponse({ ok: false, error: `Unknown library method: ${request.method}` });
          return false;
        }
        local[request.method](...(request.args || []))
          .then((result) => sendResponse({ ok: true, result }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      },
      // Test helper: drops the cached connection so a fresh database can be opened.
      async _close() {
        if (dbPromise) {
          const db = await dbPromise.catch(() => null);
          if (db) db.close();
        }
        dbPromise = null;
      },
    };
  } else {
    api = { isProxy: true, docIdForVideo, docIdForSummary };
    METHODS.forEach((method) => {
      api[method] = (...args) => remoteCall(method, args);
    });
  }

  root.libraryStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
