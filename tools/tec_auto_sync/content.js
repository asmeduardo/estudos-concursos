(function () {
  'use strict';
  const bridge = 'http://127.0.0.1:8765/ingest';
  let lastPayload = '';

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
    const name = text(link) || document.title || `Caderno TEC ${id}`;
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
    const unique = [...new Map(records.map((row) => [row.id, row])).values()].filter((row) => row.attempted || row.correct || row.accuracy);
    if (!unique.length) return;
    const attempt = questionAttempt();
    const stable = JSON.stringify({ unique, attempt: attempt ? `${attempt.id}:${attempt.correct}` : '' });
    if (stable === lastPayload) return;
    lastPayload = stable;
    const payload = JSON.stringify({ source: 'tec-extension', generatedAt: new Date().toISOString(), cadernos: unique, questionAttempts: attempt ? [attempt] : [] });
    fetch(bridge, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, mode: 'cors' }).then(() => badge(`TEC sincronizado · ${unique.length || (attempt ? 1 : 0)}`)).catch(() => badge('TEC detectado · ponte desligada'));
  }

  function badge(label) {
    let node = document.getElementById('study-tec-sync-badge');
    if (!node) { node = document.createElement('div'); node.id = 'study-tec-sync-badge'; node.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#0f766e;color:#ecfeff;padding:7px 10px;border-radius:8px;font:12px system-ui;box-shadow:0 2px 10px #0005'; document.body.appendChild(node); }
    node.textContent = label;
  }

  collect();
  new MutationObserver(() => collect()).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(collect, 60_000);
})();
