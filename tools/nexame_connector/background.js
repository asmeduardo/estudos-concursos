'use strict';

const SNAPSHOT_KEY = 'nexame.platformSnapshots';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get_snapshot') {
    chrome.storage.local.get(SNAPSHOT_KEY, (result) => {
      const snapshots = result[SNAPSHOT_KEY] || {};
      const fresh = Object.values(snapshots).filter((snapshot) => snapshot && Date.now() - Date.parse(snapshot.generatedAt || '') < MAX_AGE_MS);
      const merged = fresh.length ? { version: 3, source: 'nexame-connector', generatedAt: fresh.map((item) => item.generatedAt).sort().at(-1), cadernos: fresh.flatMap((item) => item.cadernos || []), questionAttempts: fresh.flatMap((item) => item.questionAttempts || []) } : null;
      sendResponse({ ok: true, snapshot: merged });
    });
    return true;
  }
  if (message?.type === 'clear_snapshot') {
    chrome.storage.local.remove(SNAPSHOT_KEY, () => sendResponse({ ok: !chrome.runtime.lastError }));
    return true;
  }
  if (message?.type === 'ingest' && typeof message.payload === 'string') {
    try {
      const snapshot = JSON.parse(message.payload);
      if (!snapshot || !Array.isArray(snapshot.cadernos) || JSON.stringify(snapshot).length > 1_000_000) throw new Error('invalid_snapshot');
      const platform = String(snapshot.sourcePlatform || snapshot.cadernos[0]?.sourcePlatform || 'unknown');
      chrome.storage.local.get(SNAPSHOT_KEY, (result) => { const snapshots = result[SNAPSHOT_KEY] || {}; snapshots[platform] = snapshot; chrome.storage.local.set({ [SNAPSHOT_KEY]: snapshots }, () => sendResponse({ ok: !chrome.runtime.lastError })); });
    } catch { sendResponse({ ok: false }); }
    return true;
  }
  return false;
});
