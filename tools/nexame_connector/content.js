(function () {
  'use strict';
  const APP_ORIGIN = 'https://asmeduardo.github.io';
  if (location.origin === APP_ORIGIN) {
    let lastSnapshot = '';
    const request = () => chrome.runtime.sendMessage({ type: 'get_snapshot' }, (result) => {
      if (chrome.runtime.lastError || !result?.ok || !result.snapshot) return;
      const stamp = String(result.snapshot.generatedAt || '');
      if (stamp === lastSnapshot) return;
      lastSnapshot = stamp;
      window.postMessage({ type: 'nexame-platform-snapshot', snapshot: result.snapshot }, location.origin);
    });
    request(); setInterval(request, 30000); return;
  }
  const adapters = globalThis.NexameAdapters || {};
  const adapter = Object.values(adapters).find((item) => item.matches(location.hostname));
  if (!adapter) return;
  let lastPayload = '', timer = null;
  const number = (value) => { const match = String(value || '').match(/\d+(?:[.,]\d+)?/); return match ? Number(match[0].replace(',', '.')) : 0; };
  const text = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const idFor = (href, index) => adapter.id(href || location.href, index);
  const summary = (raw) => ({
    attempted: number((raw.match(/(\d+)\s*(?:quest(?:ões|oes)|resolvid[asoa]*|respondid[asoa]*)/i) || [])[1]),
    correct: number((raw.match(/(\d+)\s*(?:acertos?|certas?|você\s+acertou)/i) || [])[1]),
    incorrect: number((raw.match(/(\d+)\s*(?:erros?|erradas?|você\s+errou)/i) || [])[1])
  });
  function record(link, index) {
    const href = link?.href || location.href, raw = text(link === document.body ? document.body : (link.closest('article,li,tr,[class*="card"],[class*="caderno"],section') || link.parentElement || document.body)), stats = summary(raw);
    const sourceId = `${adapter.platform}:${idFor(href, index)}`;
    return { id: sourceId, name: link === document.body ? (document.title || `Caderno ${sourceId}`) : (text(link) || document.title), subject: /portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade|geral/i.test(raw) ? 'general' : 'specific', topic: link === document.body ? (document.title || 'Resultados do caderno') : raw.slice(0, 180), attempted: stats.attempted, correct: stats.correct, incorrect: stats.incorrect, sourcePlatform: adapter.platform, sourceUrl: href };
  }
  function questionAttempt() {
    const match = location.pathname.match(/(?:quest(?:oes|ões)|question)/i); if (!match) return null;
    const raw = text(document.body), correct = /(?:você|voce)\s+acertou|resposta\s+correta/i.test(raw), wrong = /(?:você|voce)\s+errou|resposta\s+incorreta/i.test(raw); if (!correct && !wrong) return null;
    const id = (location.pathname.match(/(?:quest(?:oes|ões)|question)[\/-]([a-z0-9-]+)/i) || [])[1] || location.href;
    return { id: `${adapter.platform}:${id}`, correct, attemptedAt: new Date().toISOString(), topic: document.title.slice(0, 180), sourcePlatform: adapter.platform };
  }
  function collect() {
    if (!adapter.cadernoPath.test(location.pathname)) return;
    const links = [...document.querySelectorAll(adapter.links)], rows = (links.length ? links : [document.body]).map(record), unique = [...new Map(rows.map((row) => [row.id, row])).values()].filter((row) => row.attempted || row.correct || row.incorrect);
    if (!unique.length) return;
    const attempt = questionAttempt(), payload = JSON.stringify({ version: 3, source: 'nexame-connector', sourcePlatform: adapter.platform, generatedAt: new Date().toISOString(), cadernos: unique, questionAttempts: attempt ? [attempt] : [] });
    if (payload === lastPayload) return; lastPayload = payload;
    chrome.runtime.sendMessage({ type: 'ingest', payload }, (result) => { if (!chrome.runtime.lastError && result?.ok) badge(`Nexame atualizado · ${adapter.platform}`); });
  }
  function badge(label) { let node = document.getElementById('nexame-connector-status'); if (!node) { node = document.createElement('div'); node.id = 'nexame-connector-status'; node.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#0f766e;color:#ecfeff;padding:7px 10px;border-radius:8px;font:12px system-ui;box-shadow:0 2px 10px #0005'; document.body.appendChild(node); } if (node.textContent !== label) node.textContent = label; }
  collect();
  new MutationObserver(() => { if (timer !== null) return; timer = setTimeout(() => { timer = null; collect(); }, 500); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(collect, 60000);
})();
