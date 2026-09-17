(function () {
  'use strict';
  const APP_ORIGIN = 'https://asmeduardo.github.io';
  const localStudyDate = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const pick = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  };
  // Uma aba que já estava aberta perde o contexto quando a extensão é
  // atualizada. Nunca deixe um timer antigo gerar erro no console do usuário.
  const extensionAlive = () => {
    try { return Boolean(chrome?.runtime?.id); } catch { return false; }
  };
  const send = (message, callback) => {
    if (!extensionAlive()) return;
    try {
      chrome.runtime.sendMessage(message, (result) => {
        try {
          if (!extensionAlive() || chrome.runtime.lastError) return;
          callback?.(result);
        } catch { /* extensão foi recarregada; a aba será atualizada pelo Chrome */ }
      });
    } catch { /* extensão foi recarregada; não há nada a sincronizar nesta aba */ }
  };
  if (location.origin === APP_ORIGIN) {
    let lastSnapshot = '';
    let bridgeTimer = null;
    const request = () => {
      if (!extensionAlive()) { if (bridgeTimer !== null) clearInterval(bridgeTimer); return; }
      send({ type: 'get_snapshot' }, (result) => {
      if (!result?.ok || !result.snapshot) return;
      const stamp = String(result.snapshot.generatedAt || '');
      if (stamp === lastSnapshot) return;
      lastSnapshot = stamp;
      window.postMessage({ type: 'nexame-platform-snapshot', snapshot: result.snapshot }, location.origin);
      });
    };
    request(); bridgeTimer = setInterval(request, 30000); return;
  }
  const adapters = globalThis.NexameAdapters || {};
  const adapter = Object.values(adapters).find((item) => item.matches(location.hostname));
  if (!adapter) return;
  let lastPayload = '', timer = null, studyLast = Date.now(), studyWhole = 0, studySubject = 'specific';
  const number = (value) => { const match = String(value || '').match(/\d+(?:[.,]\d+)?/); return match ? Number(match[0].replace(',', '.')) : 0; };
  const text = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const idFor = (href, index) => adapter.id(href || location.href, index);
  // A página de resolução contém números de navegação, número da questão e
  // contadores de comentários. Eles não são estatísticas do caderno. Só
  // aceitamos uma sequência estatística completa e contextualizada, ou uma
  // taxa explicitamente rotulada junto da quantidade resolvida.
  function summary(raw) {
    const grouped = raw.match(/(\d+)\s+resolvid[ao]s?\s*,?\s*(\d+)\s+acertos?\s+e\s*(\d+)\s+erros?/i);
    if (grouped) return { attempted: number(grouped[1]), correct: number(grouped[2]), incorrect: number(grouped[3]), reliable: true };
    const attempted = number((raw.match(/(\d+)\s+(?:quest(?:ões|oes)\s+resolvid[ao]s?|resolvid[ao]s?|respondid[ao]s?)/i) || [])[1]);
    const percent = number((raw.match(/(?:aproveitamento|percentual\s+de\s+acertos?|taxa\s+de\s+acerto)\D{0,28}(\d{1,3}(?:[.,]\d+)?)\s*%/i) || [])[1]);
    if (attempted && percent >= 0 && percent <= 100) {
      const correct = Math.round(attempted * percent / 100);
      return { attempted, correct, incorrect: attempted - correct, reliable: true };
    }
    return { attempted: 0, correct: 0, incorrect: 0, reliable: false };
  }
  function pageName(raw, sourceId) {
    const heading = [...document.querySelectorAll('h1,h2,h3')].map(text).find((value) => /caderno|questões/i.test(value) && value.length < 160);
    const named = raw.match(/(?:caderno\s+(?:\d+\s*[-–]\s*)?[^\n]{2,130})/i)?.[0];
    return (heading || named || document.title || `Caderno ${sourceId}`).replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  function record(link, index) {
    const href = link?.href || location.href, raw = text(link === document.body ? document.body : (link.closest('article,li,tr,[class*="card"],[class*="caderno"],section') || link.parentElement || document.body)), stats = summary(raw);
    const sourceId = `${adapter.platform}:${idFor(href, index)}`;
    if (!stats.reliable) return null;
    return { id: sourceId, name: link === document.body ? pageName(raw, sourceId) : (text(link) || document.title), subject: /portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade|geral/i.test(raw) ? 'general' : 'specific', topic: link === document.body ? questionContext() : raw.slice(0, 180), attempted: stats.attempted, correct: stats.correct, incorrect: stats.incorrect, sourcePlatform: adapter.platform, sourceUrl: href };
  }
  function questionContext() {
    const selectors = [
      '[class*="materia"]', '[class*="disciplina"]', '[class*="assunto"]',
      '[data-testid*="subject"]', '[data-testid*="topic"]', '.breadcrumb', '[class*="bread"]'
    ];
    const values = selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map(text)).filter((value) => value && value.length < 240);
    const labelled = values.find((value) => /(?:mat[eé]ria|disciplina|assunto)\s*:/i.test(value));
    return (labelled || values.find((value) => /(?:java|sql|seguran|portugu|ingl[eê]s|racioc|scrum|banco|requisito|arquitetura)/i.test(value)) || document.title).slice(0, 240);
  }
  function questionAttempt() {
    const match = location.pathname.match(/(?:quest(?:oes|ões)|question)/i); if (!match) return null;
    const raw = text(document.body), correct = /(?:você|voce)\s+acertou|resposta\s+correta/i.test(raw), wrong = /(?:você|voce)\s+errou|resposta\s+incorreta/i.test(raw); if (!correct && !wrong) return null;
    const id = (location.pathname.match(/(?:quest(?:oes|ões)|question)[\/-]([a-z0-9-]+)/i) || [])[1] || location.href;
    return { id: `${adapter.platform}:${id}`, correct, attemptedAt: new Date().toISOString(), topic: questionContext(), sourcePlatform: adapter.platform, sourceUrl: location.href };
  }
  function collect() {
    if (!adapter.cadernoPath.test(location.pathname)) return;
    // Em um caderno aberto, a fonte de verdade é o resumo do próprio caderno.
    // Não varremos links de navegação, pois eles podem misturar estatísticas
    // de outro card ou números de uma questão exibida na mesma página.
    const links = [...document.querySelectorAll(adapter.links)], sourceRows = location.pathname.match(/\/cadernos?\/\d+/i) ? [document.body] : (links.length ? links : [document.body]);
    const rows = sourceRows.map(record).filter(Boolean), unique = [...new Map(rows.map((row) => [row.id, row])).values()];
    if (!unique.length) return;
    studySubject = unique[0].subject === 'general' ? 'general' : 'specific';
    const attempt = questionAttempt(), payload = JSON.stringify({ version: 3, source: 'nexame-connector', sourcePlatform: adapter.platform, generatedAt: new Date().toISOString(), cadernos: unique, questionAttempts: attempt ? [attempt] : [] });
    if (payload === lastPayload) return; lastPayload = payload;
    send({ type: 'ingest', payload }, (result) => { if (result?.ok) badge(`Nexame atualizado · ${adapter.platform}`); });
  }
  function trackStudyTime() { const now = Date.now(), elapsed = Math.min(20, Math.max(0, (now - studyLast) / 1000)); studyLast = now; if (document.visibilityState !== 'visible' || !document.hasFocus() || !adapter.cadernoPath.test(location.pathname)) return; studyWhole += elapsed; const seconds = Math.floor(studyWhole); if (!seconds) return; studyWhole -= seconds; send({ type: 'study_time', platform: adapter.platform, subject: studySubject, date: localStudyDate(), seconds }); }
  function badge(label) { let node = document.getElementById('nexame-connector-status'); if (!node) { node = document.createElement('div'); node.id = 'nexame-connector-status'; node.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#0f766e;color:#ecfeff;padding:7px 10px;border-radius:8px;font:12px system-ui;box-shadow:0 2px 10px #0005'; document.body.appendChild(node); } if (node.textContent !== label) node.textContent = label; }
  collect();
  new MutationObserver(() => { if (timer !== null) return; timer = setTimeout(() => { timer = null; collect(); }, 500); }).observe(document.documentElement, { childList: true, subtree: true });
  const collectorTimer = setInterval(() => { if (!extensionAlive()) { clearInterval(collectorTimer); clearInterval(studyTimer); return; } collect(); }, 60000);
  const studyTimer = setInterval(() => { if (!extensionAlive()) { clearInterval(collectorTimer); clearInterval(studyTimer); return; } trackStudyTime(); }, 15000);
  document.addEventListener('visibilitychange', () => { studyLast = Date.now(); }); window.addEventListener('focus', () => { studyLast = Date.now(); });
})();
