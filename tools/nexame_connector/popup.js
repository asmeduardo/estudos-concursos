'use strict';
const KEY = 'nexame.platformSnapshots';
const $ = (id) => document.getElementById(id);
function formatDate(value) { if (!value) return 'Nunca'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Nunca' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function render(snapshot) {
  const status = $('status');
  if (!snapshot) { status.className = 'status neutral'; status.querySelector('span').textContent = 'Aguardando atualização'; $('message').textContent = 'Abra uma plataforma de questões e acesse um caderno para atualizar seu plano.'; $('updated').textContent = 'Nunca'; $('cadernos').textContent = '0'; $('attempts').textContent = '0'; return; }
  status.className = 'status good'; status.querySelector('span').textContent = 'Desempenho atualizado'; $('message').textContent = 'Seu plano será recalculado automaticamente no Nexame.'; $('updated').textContent = formatDate(snapshot.generatedAt); $('cadernos').textContent = String((snapshot.cadernos || []).length); $('attempts').textContent = String((snapshot.questionAttempts || []).length);
}
chrome.storage.local.get(KEY, (result) => { const snapshots = Object.values(result[KEY] || {}); const snapshot = snapshots.length ? { generatedAt: snapshots.map((item) => item.generatedAt).sort().at(-1), cadernos: snapshots.flatMap((item) => item.cadernos || []), questionAttempts: snapshots.flatMap((item) => item.questionAttempts || []) } : null; render(snapshot); });
$('clear').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'clear_snapshot' }, () => { render(null); $('message').textContent = 'Dados locais removidos.'; }); });
