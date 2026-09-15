(function () {
  'use strict';
  const bridge = 'http://127.0.0.1:8765/ingest';
  // Na SPA, faça apenas o handshake com a ponte local. A página não deve
  // tentar localhost por conta própria quando a extensão/ponte não existe.
  if (location.origin === 'https://asmeduardo.github.io') {
    chrome.runtime.sendMessage({ type: 'health' }, (result) => {
      if (chrome.runtime.lastError || !result?.ok) { localStorage.removeItem('nexame.tecBridge'); return; }
      localStorage.setItem('nexame.tecBridge', 'enabled'); window.postMessage({ type: 'nexame-tec-bridge-ready' }, location.origin);
    });
    return;
  }
  let lastPayload = '';
  let collectTimer = null;

  function number(value) {
    const match = String(value || '').match(/\d+(?:[.,]\d+)?/);
    return match ? Number(match[0].replace(',', '.')) : 0;
  }

  function text(node) { return (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim(); }

  function recordFrom(link, index) {
    const href = link.href || '';
    const idMatch = href.match(/cadernos\/(\d+)/i) || location.href.match(/cadernos\/(\d+)/i);
    const id = idMatch ? idMatch[1] : `tec-${index}`;
    const card = link.closest('article,li,tr,[class*="card"],[class*="Card"],[class*="caderno"],[class*="Caderno"]') || link.parentElement;
    const raw = text(card || document.body);
    const name = link === document.body ? (document.title || `Caderno TEC ${id}`) : (text(link) || document.title || `Caderno TEC ${id}`);
    const attemptedMatch = raw.match(/(\d+)\s*(?:quest(?:ões|oes)|respondid(?:as|os)|resolvid(?:as|os))/i);
    const correctMatch = raw.match(/(\d+)\s*(?:acertos?|certas?)/i);
    const accuracyMatch = raw.match(/(\d+(?:[,.]\d+)?)\s*%/);
    return { id, name, subject: /portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade|geral/i.test(raw) ? 'general' : 'specific', topic: raw.slice(0, 240), attempted: attemptedMatch ? number(attemptedMatch[1]) : 0, correct: correctMatch ? number(correctMatch[1]) : 0, accuracy: accuracyMatch ? number(accuracyMatch[1]) : 0, sourceUrl: href };
  }

  function questionAttempt() {
    const match = location.pathname.match(/questoes\/(?:questao\/)?(\d+)/i);
    if (!match) return null;
    const raw = text(document.body);
    // Só registra quando a própria página tornou o resultado visível. Não lê enunciado nem comentário.
    const correct = /(?:você|voce)\s+acertou|resposta\s+correta/i.test(raw);
    const wrong = /(?:você|voce)\s+errou|resposta\s+incorreta/i.test(raw);
    if (!correct && !wrong) return null;
    const caderno = location.href.match(/cadernos\/(\d+)/i);
    return { id: match[1], cadernoId: caderno ? caderno[1] : undefined, correct, attemptedAt: new Date().toISOString(), topic: document.title.slice(0, 180) };
  }

  function collect() {
    const links = [...document.querySelectorAll('a[href*="/questoes/cadernos/"]')];
    const records = (links.length ? links : [document.body]).map((node, index) => recordFrom(node, index));
    let unique = [...new Map(records.map((row) => [row.id, row])).values()].filter((row) => row.attempted || row.correct || row.accuracy);
    // Algumas versões do TEC renderizam o caderno sem links detectáveis.
    // Ainda assim, a própria página contém o resumo de resolvidas/acertos.
    if (!unique.length && /\/questoes\/cadernos\//i.test(location.pathname)) {
      const raw = text(document.body);
      const attempted = raw.match(/(\d+)\s*(?:resolvidas?|respondidas?)/i);
      const correct = raw.match(/(\d+)\s*(?:acertos?|certas?)/i);
      const incorrect = raw.match(/(\d+)\s*(?:erros?|erradas?)/i);
      if (attempted || correct || incorrect) unique = [{ id: (location.pathname.match(/cadernos\/(\d+)/i) || [])[1] || 'tec-caderno', name: document.title || 'Caderno TEC', subject: /portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade/i.test(raw) ? 'general' : 'specific', topic: raw.slice(0, 240), attempted: attempted ? number(attempted[1]) : 0, correct: correct ? number(correct[1]) : 0, accuracy: 0, sourceUrl: location.href }];
    }
    if (!unique.length) { badge('TEC aberto · aguardando resultados visíveis'); return; }
    const attempt = questionAttempt();
    const stable = JSON.stringify({ unique, attempt: attempt ? `${attempt.id}:${attempt.correct}` : '' });
    if (stable === lastPayload) return;
    lastPayload = stable;
    const payload = JSON.stringify({ source: 'tec-extension', generatedAt: new Date().toISOString(), cadernos: unique, questionAttempts: attempt ? [attempt] : [] });
    chrome.runtime.sendMessage({ type: 'ingest', payload }, (result) => { if (chrome.runtime.lastError || !result?.ok) { badge('TEC detectado · falha ao enviar'); return; } badge(`TEC sincronizado · ${unique.length || (attempt ? 1 : 0)}`); });
  }

  function badge(label) {
    let node = document.getElementById('study-tec-sync-badge');
    if (!node) { node = document.createElement('div'); node.id = 'study-tec-sync-badge'; node.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#0f766e;color:#ecfeff;padding:7px 10px;border-radius:8px;font:12px system-ui;box-shadow:0 2px 10px #0005'; document.body.appendChild(node); }
    if (node.textContent !== label) node.textContent = label;
  }

  collect();
  new MutationObserver((mutations) => {
    // A própria badge é criada/atualizada pela extensão; ignorá-la evita um
    // ciclo MutationObserver → collect → badge → MutationObserver.
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !target?.closest('#study-tec-sync-badge');
    });
    if (!relevant || collectTimer !== null) return;
    collectTimer = setTimeout(() => { collectTimer = null; collect(); }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(collect, 60_000);
})();
