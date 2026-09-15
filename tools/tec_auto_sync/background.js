'use strict';

const BRIDGE = 'http://127.0.0.1:8765';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'health') {
    fetch(`${BRIDGE}/health`, { cache: 'no-store' })
      .then((response) => sendResponse({ ok: response.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'ingest' && typeof message.payload === 'string') {
    fetch(`${BRIDGE}/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: message.payload })
      .then(async (response) => sendResponse({ ok: response.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});
