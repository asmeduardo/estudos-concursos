'use strict';

const SNAPSHOT_KEY = 'nexame.tecSnapshot';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get_snapshot') {
    chrome.storage.local.get(SNAPSHOT_KEY, (result) => {
      const snapshot = result[SNAPSHOT_KEY];
      const fresh = snapshot && Date.now() - Date.parse(snapshot.generatedAt || '') < MAX_AGE_MS;
      sendResponse({ ok: true, snapshot: fresh ? snapshot : null });
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
      chrome.storage.local.set({ [SNAPSHOT_KEY]: snapshot }, () => sendResponse({ ok: !chrome.runtime.lastError }));
    } catch { sendResponse({ ok: false }); }
    return true;
  }
  return false;
});
