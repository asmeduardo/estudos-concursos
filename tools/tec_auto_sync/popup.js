'use strict';
const KEY = 'nexame.tecSnapshot';
const $ = (id) => document.getElementById(id);
function formatDate(value) { if (!value) return 'Nunca'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Nunca' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function render(snapshot) {
  const status = $('status');
  if (!snapshot) { status.className = 'status neutral'; status.querySelector('span').textContent = 'Aguardando atualização'; $('message').textContent = 'Abra o TEC e acesse um caderno para atualizar seu plano.'; $('updated').textContent = 'Nunca'; $('cadernos').textContent = '0'; $('attempts').textContent = '0'; return; }
  status.className = 'status good'; status.querySelector('span').textContent = 'Desempenho atualizado'; $('message').textContent = 'Seu plano será recalculado automaticamente no Nexame.'; $('updated').textContent = formatDate(snapshot.generatedAt); $('cadernos').textContent = String((snapshot.cadernos || []).length); $('attempts').textContent = String((snapshot.questionAttempts || []).length);
}
chrome.storage.local.get(KEY, (result) => render(result[KEY] || null));
$('clear').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'clear_snapshot' }, () => { render(null); $('message').textContent = 'Dados locais removidos.'; }); });
