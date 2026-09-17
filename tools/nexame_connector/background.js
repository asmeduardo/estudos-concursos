'use strict';

const SNAPSHOT_KEY = 'nexame.platformSnapshots';
const STUDY_TOTALS_KEY = 'nexame.platformStudyTotals';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get_snapshot') {
    chrome.storage.local.get([SNAPSHOT_KEY, STUDY_TOTALS_KEY], (result) => {
      const snapshots = result[SNAPSHOT_KEY] || {};
      const fresh = Object.values(snapshots).filter((snapshot) => snapshot && Date.now() - Date.parse(snapshot.generatedAt || '') < MAX_AGE_MS);
      const merged = fresh.length ? { version: 4, source: 'nexame-connector', generatedAt: fresh.map((item) => item.generatedAt).sort().at(-1), cadernos: fresh.flatMap((item) => item.cadernos || []), questionAttempts: fresh.flatMap((item) => item.questionAttempts || []), studyTotals: result[STUDY_TOTALS_KEY] || {} } : null;
      sendResponse({ ok: true, snapshot: merged });
    });
    return true;
  }
  if (message?.type === 'study_time') {
    const seconds = Math.max(0, Math.min(20, Number(message.seconds) || 0)), platform = String(message.platform || 'platform').slice(0, 40), date = String(message.date || '').slice(0, 10);
    if (!seconds || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { sendResponse({ ok: false }); return false; }
    chrome.storage.local.get(STUDY_TOTALS_KEY, (result) => { const totals = result[STUDY_TOTALS_KEY] || {}, key = `${platform}:${date}`; totals[key] = Math.min(86400, (Number(totals[key]) || 0) + seconds); chrome.storage.local.set({ [STUDY_TOTALS_KEY]: totals }, () => sendResponse({ ok: !chrome.runtime.lastError })); });
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
