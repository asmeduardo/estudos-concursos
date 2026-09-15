'use strict';
const KEY = 'nexame.tecSnapshot';
const $ = (id) => document.getElementById(id);
function formatDate(value) { if (!value) return 'Nunca'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Nunca' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function render(snapshot) {
  const status = $('status');
  if (!snapshot) { status.className = 'status neutral'; status.querySelector('span').textContent = 'Aguardando dados do TEC'; $('message').textContent = 'Abra o TEC e acesse um caderno para sincronizar.'; $('updated').textContent = 'Nunca'; $('cadernos').textContent = '0'; $('attempts').textContent = '0'; return; }
  status.className = 'status good'; status.querySelector('span').textContent = 'Dados prontos para o Nexame'; $('message').textContent = 'O Nexame receberá estes dados quando o painel estiver aberto.'; $('updated').textContent = formatDate(snapshot.generatedAt); $('cadernos').textContent = String((snapshot.cadernos || []).length); $('attempts').textContent = String((snapshot.questionAttempts || []).length);
}
chrome.storage.local.get(KEY, (result) => render(result[KEY] || null));
$('clear').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'clear_snapshot' }, () => { render(null); $('message').textContent = 'Dados locais removidos.'; }); });
