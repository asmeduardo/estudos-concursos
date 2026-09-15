type Subject = 'specific' | 'general';
type Status = 'good' | 'warn' | 'bad' | 'neutral';

interface Caderno {
  id: string; contestId: string; name: string; subject: Subject; topic: string;
  attempted: number; correct: number; incorrect: number; repeatErrors: number;
  lastAttemptAt: string | null; updatedAt: string;
}
interface Session { type: string; seconds: number; endedAt: string; reason: string; uploaded?: boolean; }
interface ContestConfig { id: string; name: string; examDate: string; targetMinutes: number; targetAccuracy: number; specificWeight: number; generalWeight: number; minQuestions: number; priority: 'primary' | 'secondary'; updatedAt: string; }
interface ContentItem { code: string; area: string; layer: string; videoId: string; start: number; end: number; title: string; channel: string; purpose: string; tec?: unknown[]; }
interface ContentProgress { player: string; code: string; seconds: number; completed: boolean; updatedAt: string; }
interface RoadmapItem { code: string; area: string; layer: string; title: string; videoId: string; tec: string; }
interface StudyEvent { id: string; contestId: string; topicId?: string; type: 'video_session' | 'question_session' | 'review_session' | 'simulation' | 'focus_pause' | 'content_progress'; source: string; seconds: number; endedAt: string; metadata?: Record<string, unknown>; uploaded?: boolean; }
interface QuestionAttempt { id: string; contestId: string; externalQuestionId: string; cadernoId?: string; correct: boolean; attemptedAt: string; durationSeconds?: number; metadata?: Record<string, unknown>; uploaded?: boolean; }
interface StudyState { targetMinutes: number; cadernos: Record<string, Caderno>; contests: Record<string, ContestConfig>; activeContestId: string; content?: Record<string, ContentItem[]>; contentProgress?: Record<string, ContentProgress>; sync?: { at: string; source: string } | null; daily: Record<string, { seconds: number; sessions: Session[] }>; events?: StudyEvent[]; questionAttempts?: QuestionAttempt[]; }
interface Diagnosis { raw: number; smooth: number; eligible: boolean; status: Status; risk: number; action: string; }
type Ranked = Caderno & { d: Diagnosis };
type StudyPhase = 'pre-edital' | 'base' | 'consolidacao' | 'reta-final' | 'vespera';
interface StudyBlock { subject: Subject; topic: string; minutes: number; mode: 'video' | 'tec' | 'correction' | 'review'; action: string; risk: number; }

const KEY = 'study-dashboard-state-v2';
const LEGACY_KEY = 'dataprev-study-state-v1';
const MIN_SAMPLE = 10;
const DEFAULT_TARGET = 390;
const DEFAULT_CONTEST: ContestConfig = { id: 'dataprev-2026', name: 'Dataprev 2026 — Desenvolvedor de Software', examDate: '2026-10-11', targetMinutes: DEFAULT_TARGET, targetAccuracy: 100, specificWeight: 2.5, generalWeight: 1, minQuestions: MIN_SAMPLE, priority: 'primary', updatedAt: new Date().toISOString() };
const today = new Date().toISOString().slice(0, 10);
const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const state: StudyState = loadState();
state.contests ||= {};
if (!Object.keys(state.contests).length) state.contests[DEFAULT_CONTEST.id] = { ...DEFAULT_CONTEST };
state.activeContestId ||= Object.keys(state.contests)[0] || DEFAULT_CONTEST.id;
state.contests[state.activeContestId] ||= { ...DEFAULT_CONTEST, id: state.activeContestId };
Object.values(state.contests).forEach((contest) => { contest.priority ||= contest.id === state.activeContestId ? 'primary' : 'secondary'; });
Object.values(state.contests).filter((contest) => contest.id !== state.activeContestId).forEach((contest) => { contest.priority = 'secondary'; });
state.targetMinutes = Number(state.targetMinutes) || state.contests[state.activeContestId].targetMinutes || DEFAULT_TARGET;
state.contests[state.activeContestId].targetMinutes = state.targetMinutes;
state.contests[state.activeContestId].targetAccuracy = Math.max(50, Math.min(100, Number(state.contests[state.activeContestId].targetAccuracy) || 100));
state.contests[state.activeContestId].minQuestions ||= MIN_SAMPLE;
state.cadernos ||= {};
state.content ||= {};
state.contentProgress ||= {};
state.daily ||= {};
state.events ||= [];
state.questionAttempts ||= [];
Object.values(state.cadernos).forEach((c) => { c.contestId ||= state.activeContestId; });
Object.entries(state.cadernos).filter(([key]) => !key.includes('::')).forEach(([key, c]) => { delete state.cadernos[key]; state.cadernos[cadernoKey(c.id, c.contestId)] = c; });
const legacyDay = state.daily[today];
if (legacyDay && !state.daily[`${state.activeContestId}::${today}`]) state.daily[`${state.activeContestId}::${today}`] = legacyDay;
state.daily[`${state.activeContestId}::${today}`] ||= { seconds: 0, sessions: [] };

let timerRunning = false;
let timerTick: number | null = null;
let timerLast = 0;
let pendingSessionSeconds = 0;
let playerPauseTick: number | null = null;
let manualPause = false;

interface Window {
  __SUPABASE_CONFIG__?: { url?: string; anonKey?: string };
  supabase?: { createClient: (url: string, anonKey: string, options?: unknown) => any };
}

let cloud: any = null;
let cloudUserId = '';
let cloudUserEmail = '';
let cloudIsAnonymous = true;
let cloudSyncTick: number | null = null;
let cloudSyncBusy = false;
let lastLocalSnapshotAt = '';
let roadmapItems: RoadmapItem[] = [];

function activeContest(): ContestConfig { return state.contests[state.activeContestId] || DEFAULT_CONTEST; }
function dayKey(date = today, contestId = state.activeContestId): string { return `${contestId}::${date}`; }
function currentDay(): { seconds: number; sessions: Session[] } { const key = dayKey(); state.daily[key] ||= { seconds: 0, sessions: [] }; return state.daily[key]; }
function cadernoKey(id: string, contestId = state.activeContestId): string { return `${contestId}::${id}`; }
function contestLabel(contestId: string): string { return state.contests[contestId]?.name || contestId; }
function contestIdFromName(name: string): string { const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'concurso'; return `${base}-${Date.now().toString(36)}`; }

function loadState(): StudyState {
  try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '{}') as StudyState; }
  catch { return { targetMinutes: DEFAULT_TARGET, cadernos: {}, contests: {}, activeContestId: DEFAULT_CONTEST.id, content: {}, contentProgress: {}, daily: {} }; }
}
function saveState(): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  if (!cloud || cloudSyncBusy) return;
  if (cloudSyncTick) window.clearTimeout(cloudSyncTick);
  cloudSyncTick = window.setTimeout(() => { void syncCloud(); }, 700);
}
function eventId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function eventTypeForSession(type: string): StudyEvent['type'] {
  if (type === 'video') return 'video_session';
  if (type === 'tec') return 'question_session';
  if (type === 'correction' || type === 'review') return 'review_session';
  return 'simulation';
}
function recordEvent(type: StudyEvent['type'], source: string, seconds = 0, metadata: Record<string, unknown> = {}): void {
  state.events!.push({ id: eventId('evt'), contestId: state.activeContestId, type, source, seconds: Math.max(0, Math.round(seconds)), endedAt: new Date().toISOString(), metadata, uploaded: false });
  // Conserva o histórico recente local; a fonte durável é o Supabase quando conectado.
  if (state.events!.length > 2500) state.events = state.events!.slice(-2500);
}
function recordQuestionAttempt(attempt: Omit<QuestionAttempt, 'id' | 'contestId' | 'uploaded'>): void {
  const id = `question-${attempt.externalQuestionId}-${attempt.attemptedAt}-${attempt.correct ? 'c' : 'e'}`;
  if (state.questionAttempts!.some((item) => item.id === id)) return;
  state.questionAttempts!.push({ ...attempt, id, contestId: state.activeContestId, uploaded: false });
  if (state.questionAttempts!.length > 5000) state.questionAttempts = state.questionAttempts!.slice(-5000);
}
function esc(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c)); }
function fmtSeconds(total: number, short = false): string {
  total = Math.max(0, Math.floor(total || 0));
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return short ? `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtDate(value: string | null | undefined): string {
  if (!value) return 'nunca'; const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function numberValue(value: unknown): number { return Number(String(value ?? '').replace('%', '').replace(',', '.')) || 0; }
function normalize(raw: Record<string, unknown>, index = 0): Caderno {
  const attempted = numberValue(raw.attempted ?? raw.respondidas ?? raw.resolvidas ?? raw.total);
  const accuracy = numberValue(raw.accuracy ?? raw.aproveitamento ?? raw.percentualAcerto);
  let correct = numberValue(raw.correct ?? raw.acertos ?? raw.certas);
  if (!correct && attempted && accuracy) correct = Math.round(attempted * accuracy / 100);
  const name = String(raw.name ?? raw.nome ?? raw.title ?? `Caderno ${index + 1}`);
  const id = String(raw.id ?? raw.cadernoId ?? raw.codigo ?? `local-${index}-${name.toLowerCase().replace(/\W+/g, '-')}`);
  const area = String(raw.subject ?? raw.area ?? raw.disciplina ?? 'specific').toLowerCase();
  const subject: Subject = /geral|portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade|conhecimentos gerais/.test(area) ? 'general' : 'specific';
  return { id, contestId: String(raw.contestId ?? raw.contest_id ?? state.activeContestId), name, subject, topic: String(raw.topic ?? raw.assunto ?? ''), attempted: Math.max(0, attempted), correct: Math.max(0, Math.min(correct, attempted || correct)), incorrect: Math.max(0, numberValue(raw.incorrect ?? raw.erros) || attempted - correct), repeatErrors: numberValue(raw.repeatErrors ?? raw.errosRepetidos), lastAttemptAt: String(raw.lastAttemptAt ?? raw.ultimoEstudo ?? raw.lastAttempt ?? '') || null, updatedAt: new Date().toISOString() };
}

function cloudConfigured(): boolean {
  const cfg = window.__SUPABASE_CONFIG__;
  return Boolean(cfg?.url && cfg.anonKey && window.supabase?.createClient);
}
function cloudCaderno(raw: Record<string, unknown>): Caderno {
  return {
    id: String(raw.caderno_id ?? raw.id ?? ''), contestId: String(raw.contest_id ?? state.activeContestId), name: String(raw.name ?? ''),
    subject: raw.subject === 'general' ? 'general' : 'specific', topic: String(raw.topic ?? ''),
    attempted: numberValue(raw.attempted), correct: numberValue(raw.correct), incorrect: numberValue(raw.incorrect),
    repeatErrors: numberValue(raw.repeat_errors), lastAttemptAt: String(raw.last_attempt_at ?? '') || null,
    updatedAt: String(raw.updated_at ?? new Date().toISOString())
  };
}
function cloudContent(raw: Record<string, unknown>): ContentItem {
  return { code: String(raw.content_code || ''), area: String(raw.area || ''), layer: String(raw.layer || ''), videoId: String(raw.video_id || ''), start: numberValue(raw.start_seconds), end: numberValue(raw.end_seconds), title: String(raw.title || ''), channel: String(raw.channel || ''), purpose: String(raw.purpose || ''), tec: Array.isArray(raw.tec) ? raw.tec : [] };
}
function cloudMessage(message: string): void {
  const target = $('#syncMessage');
  if (target) target.innerHTML = message;
}
function renderAccount(): void {
  const button = document.querySelector<HTMLButtonElement>('#accountButton');
  if (!button) return;
  if (!cloud) { button.textContent = 'Conectar conta'; button.classList.remove('connected'); return; }
  if (cloudUserEmail) { button.textContent = cloudUserEmail; button.classList.add('connected'); return; }
  button.textContent = cloudIsAnonymous ? 'Salvar progresso na conta' : 'Conta conectada';
  button.classList.toggle('connected', !cloudIsAnonymous);
}
async function connectAccount(): Promise<void> {
  if (!cloud) { cloudMessage('<strong>Conexão indisponível.</strong> Configure o Supabase para vincular uma conta.'); return; }
  const email = window.prompt('Informe seu e-mail para salvar o progresso e acessar em outros dispositivos:');
  if (!email) return;
  const clean = email.trim();
  const result = cloudIsAnonymous
    ? await cloud.auth.updateUser({ email: clean })
    : await cloud.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: window.location.href.split('#')[0] } });
  if (result.error) { cloudMessage(`<strong>Não foi possível enviar o acesso:</strong> ${esc(result.error.message)}`); return; }
  cloudMessage('<strong>E-mail enviado.</strong> Abra o link recebido para tornar seu progresso permanente nesta e em outras máquinas.');
}
async function pullCloud(): Promise<void> {
  if (!cloud || !cloudUserId) return;
  const contestsResult = await cloud.from('study_contests').select('*').eq('user_id', cloudUserId);
  if (contestsResult.error) throw new Error(contestsResult.error.message);
  for (const raw of (contestsResult.data || []) as Record<string, unknown>[]) {
    const id = String(raw.contest_id || ''), remote: ContestConfig = { id, name: String(raw.name || id), examDate: String(raw.exam_date || ''), targetMinutes: numberValue(raw.target_minutes) || DEFAULT_TARGET, targetAccuracy: numberValue(raw.target_accuracy) || 100, specificWeight: numberValue(raw.specific_weight) || 2.5, generalWeight: numberValue(raw.general_weight) || 1, minQuestions: numberValue(raw.min_questions) || MIN_SAMPLE, priority: raw.priority === 'secondary' ? 'secondary' : 'primary', updatedAt: String(raw.updated_at || new Date().toISOString()) }, local = state.contests[id];
    if (!local || new Date(remote.updatedAt).getTime() >= new Date(local.updatedAt).getTime()) state.contests[id] = remote;
  }
  const cadernosResult = await cloud.from('study_cadernos').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId);
  if (cadernosResult.error) throw new Error(cadernosResult.error.message);
  for (const raw of (cadernosResult.data || []) as Record<string, unknown>[]) {
    const remote = cloudCaderno(raw), key = cadernoKey(remote.id, remote.contestId), local = state.cadernos[key];
    if (!local || new Date(remote.updatedAt).getTime() >= new Date(local.updatedAt).getTime()) state.cadernos[key] = remote;
  }
  const sessionsResult = await cloud.from('study_sessions').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId).eq('session_date', today);
  if (sessionsResult.error) throw new Error(sessionsResult.error.message);
  const localPending = currentDay().sessions.filter((session) => !session.uploaded);
  const remoteSessions = ((sessionsResult.data || []) as Record<string, unknown>[]).map((raw) => ({
    type: String(raw.session_type || 'review'), seconds: numberValue(raw.seconds), endedAt: String(raw.ended_at || new Date().toISOString()), reason: String(raw.source || 'cloud'), uploaded: true
  }));
  state.daily[dayKey()] = { seconds: remoteSessions.reduce((sum, session) => sum + session.seconds, 0) + localPending.reduce((sum, session) => sum + session.seconds, 0), sessions: [...remoteSessions, ...localPending] };
  const progressResult = await cloud.from('study_content_progress').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId);
  if (progressResult.error) throw new Error(progressResult.error.message);
  for (const raw of (progressResult.data || []) as Record<string, unknown>[]) {
    const code = String(raw.content_code || ''), key = `${state.activeContestId}::${code}`, local = state.contentProgress?.[key], remoteAt = String(raw.updated_at || '');
    if (!local || new Date(remoteAt).getTime() >= new Date(local.updatedAt).getTime()) state.contentProgress![key] = { player: String(raw.player || ''), code, seconds: numberValue(raw.position_seconds), completed: Boolean(raw.completed), updatedAt: remoteAt || new Date().toISOString() };
  }
  const contentResult = await cloud.from('study_content').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId);
  if (contentResult.error) throw new Error(contentResult.error.message);
  if ((contentResult.data || []).length) state.content![state.activeContestId] = (contentResult.data as Record<string, unknown>[]).sort((a, b) => numberValue(a.position) - numberValue(b.position)).map(cloudContent);
  const eventsResult = await cloud.from('study_events').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId).order('ended_at', { ascending: false }).limit(500);
  if (!eventsResult.error) {
    for (const raw of eventsResult.data || []) {
      const id = String(raw.idempotency_key || raw.id || '');
      if (!id || state.events!.some((event) => event.id === id)) continue;
      state.events!.push({ id, contestId: String(raw.contest_id), topicId: raw.topic_id ? String(raw.topic_id) : undefined, type: String(raw.event_type) as StudyEvent['type'], source: String(raw.source || 'cloud'), seconds: numberValue(raw.seconds), endedAt: String(raw.ended_at), metadata: (raw.metadata || {}) as Record<string, unknown>, uploaded: true });
    }
  }
  const attemptsResult = await cloud.from('study_question_attempts').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId).order('attempted_at', { ascending: false }).limit(1000);
  if (!attemptsResult.error) {
    for (const raw of attemptsResult.data || []) {
      const id = String(raw.idempotency_key || raw.id || '');
      if (!id || state.questionAttempts!.some((attempt) => attempt.id === id)) continue;
      state.questionAttempts!.push({ id, contestId: String(raw.contest_id), externalQuestionId: String(raw.external_question_id), cadernoId: raw.caderno_id ? String(raw.caderno_id) : undefined, correct: Boolean(raw.correct), attemptedAt: String(raw.attempted_at), durationSeconds: raw.duration_seconds ? numberValue(raw.duration_seconds) : undefined, metadata: (raw.metadata || {}) as Record<string, unknown>, uploaded: true });
    }
  }
}
async function syncCloud(): Promise<void> {
  if (!cloud || !cloudUserId || cloudSyncBusy) return;
  cloudSyncBusy = true;
  try {
    const contest = activeContest();
    const contestRows = Object.values(state.contests).map((item) => ({ user_id: cloudUserId, contest_id: item.id, name: item.name, exam_date: item.examDate || null, target_minutes: item.targetMinutes, target_accuracy: item.targetAccuracy, specific_weight: item.specificWeight, general_weight: item.generalWeight, min_questions: item.minQuestions, priority: item.id === state.activeContestId ? 'primary' : 'secondary', updated_at: item.updatedAt }));
    // Rebaixa os secundários antes de promover o concurso ativo; isso respeita a regra de foco único.
    const secondaryRows = contestRows.filter((row) => row.priority === 'secondary');
    if (secondaryRows.length) {
      const secondaryResult = await cloud.from('study_contests').upsert(secondaryRows, { onConflict: 'user_id,contest_id' });
      if (secondaryResult.error && !/column .*priority.* does not exist/i.test(secondaryResult.error.message || '')) throw new Error(secondaryResult.error.message);
    }
    const contestRow: Record<string, unknown> = contestRows.find((row) => row.contest_id === state.activeContestId)!;
    let contestResult = await cloud.from('study_contests').upsert(contestRow, { onConflict: 'user_id,contest_id' });
    if (contestResult.error && /(target_accuracy|priority)/i.test(contestResult.error.message || '')) { delete contestRow.target_accuracy; delete contestRow.priority; contestResult = await cloud.from('study_contests').upsert(contestRow, { onConflict: 'user_id,contest_id' }); }
    if (contestResult.error) throw new Error(contestResult.error.message);
    const rows = Object.values(state.cadernos).filter((c) => c.contestId === state.activeContestId).map((c) => ({ user_id: cloudUserId, contest_id: c.contestId, caderno_id: c.id, name: c.name, subject: c.subject, topic: c.topic, attempted: c.attempted, correct: c.correct, incorrect: c.incorrect, repeat_errors: c.repeatErrors, last_attempt_at: c.lastAttemptAt, updated_at: c.updatedAt }));
    const cadernosResult = await cloud.from('study_cadernos').upsert(rows, { onConflict: 'user_id,contest_id,caderno_id' });
    if (cadernosResult.error) throw new Error(cadernosResult.error.message);
    const pending = currentDay().sessions.filter((session) => !session.uploaded && session.seconds > 0).map((session) => ({ user_id: cloudUserId, session_date: today, session_type: session.type, seconds: Math.round(session.seconds), ended_at: session.endedAt, source: session.reason || 'dashboard' }));
    if (pending.length) {
      const sessionsResult = await cloud.from('study_sessions').insert(pending.map((session) => ({ ...session, contest_id: state.activeContestId })));
      if (sessionsResult.error) throw new Error(sessionsResult.error.message);
      currentDay().sessions.forEach((session) => { if (!session.uploaded) session.uploaded = true; });
    }
    const pendingEvents = state.events!.filter((event) => !event.uploaded && event.contestId === state.activeContestId).map((event) => ({ user_id: cloudUserId, contest_id: event.contestId, topic_id: event.topicId || null, event_type: event.type, source: event.source, ended_at: event.endedAt, seconds: event.seconds, metadata: event.metadata || {}, idempotency_key: event.id }));
    if (pendingEvents.length) {
      const eventsResult = await cloud.from('study_events').upsert(pendingEvents, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
      if (eventsResult.error && !/relation .*study_events.* does not exist/i.test(eventsResult.error.message || '')) throw new Error(eventsResult.error.message);
      if (!eventsResult.error) state.events!.forEach((event) => { if (event.contestId === state.activeContestId) event.uploaded = true; });
    }
    const pendingAttempts = state.questionAttempts!.filter((attempt) => !attempt.uploaded && attempt.contestId === state.activeContestId).map((attempt) => ({ user_id: cloudUserId, contest_id: attempt.contestId, source: 'tec', external_question_id: attempt.externalQuestionId, caderno_id: attempt.cadernoId || null, correct: attempt.correct, duration_seconds: attempt.durationSeconds || null, attempted_at: attempt.attemptedAt, metadata: attempt.metadata || {}, idempotency_key: attempt.id }));
    if (pendingAttempts.length) {
      const attemptsResult = await cloud.from('study_question_attempts').upsert(pendingAttempts, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
      if (attemptsResult.error && !/relation .*study_question_attempts.* does not exist/i.test(attemptsResult.error.message || '')) throw new Error(attemptsResult.error.message);
      if (!attemptsResult.error) state.questionAttempts!.forEach((attempt) => { if (attempt.contestId === state.activeContestId) attempt.uploaded = true; });
    }
    const progressRows = Object.entries(state.contentProgress || {}).filter(([key]) => key.startsWith(`${state.activeContestId}::`)).map(([, progress]) => ({ user_id: cloudUserId, contest_id: state.activeContestId, content_code: progress.code, player: progress.player, position_seconds: progress.seconds, completed: progress.completed, updated_at: progress.updatedAt }));
    if (progressRows.length) {
      const progressResult = await cloud.from('study_content_progress').upsert(progressRows, { onConflict: 'user_id,contest_id,content_code' });
      if (progressResult.error) throw new Error(progressResult.error.message);
    }
    const contentRows = (state.content?.[state.activeContestId] || []).map((item, index) => ({ user_id: cloudUserId, contest_id: state.activeContestId, content_code: item.code, position: index, area: item.area, layer: item.layer, video_id: item.videoId, start_seconds: item.start, end_seconds: item.end, title: item.title, channel: item.channel, purpose: item.purpose, tec: item.tec || [], updated_at: new Date().toISOString() }));
    if (contentRows.length) {
      const contentResult = await cloud.from('study_content').upsert(contentRows, { onConflict: 'user_id,contest_id,content_code' });
      if (contentResult.error) throw new Error(contentResult.error.message);
    }
    await cloud.from('study_sync_runs').insert({ user_id: cloudUserId, contest_id: state.activeContestId, source: 'nexame-dashboard', record_count: rows.length + pendingEvents.length + pendingAttempts.length });
    state.sync = { at: new Date().toISOString(), source: 'Supabase · nuvem' };
    localStorage.setItem(KEY, JSON.stringify(state));
    render();
  } catch (error) {
    cloudMessage(`<strong>Sincronização pendente:</strong> ${esc(error instanceof Error ? error.message : error)}`);
  } finally { cloudSyncBusy = false; }
}
async function initCloud(): Promise<void> {
  if (!cloudConfigured()) return;
  try {
    const cfg = window.__SUPABASE_CONFIG__!;
    cloud = window.supabase!.createClient(cfg.url!, cfg.anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    let session = (await cloud.auth.getSession()).data?.session;
    if (!session) session = (await cloud.auth.signInAnonymously()).data?.session;
    cloudUserId = session?.user?.id || '';
    cloudUserEmail = session?.user?.email || '';
    cloudIsAnonymous = Boolean((session?.user as { is_anonymous?: boolean } | undefined)?.is_anonymous || !cloudUserEmail);
    if (!cloudUserId) throw new Error('Não foi possível criar a sessão anônima.');
    await cloud.from('profiles').upsert({ id: cloudUserId, display_name: cloudUserEmail ? cloudUserEmail.split('@')[0] : null }, { onConflict: 'id' });
    await pullCloud();
    state.sync = { at: new Date().toISOString(), source: 'Supabase · conectado' };
    localStorage.setItem(KEY, JSON.stringify(state));
    render();
    renderAccount();
    await syncCloud();
  } catch (error) {
    cloud = null; cloudUserId = ''; cloudUserEmail = ''; cloudIsAnonymous = true;
    cloudMessage(`<strong>Modo local:</strong> não foi possível conectar ao Supabase (${esc(error instanceof Error ? error.message : error)}).`);
    render(); renderAccount();
  }
}
function accuracyBands(): { critical: number; recovery: number; consolidation: number; target: number } { const target = activeContest().targetAccuracy || 100; return { critical: Math.max(50, target - 30), recovery: Math.max(60, target - 20), consolidation: Math.max(70, target - 10), target }; }
function diagnosis(c: Caderno): Diagnosis {
  const raw = c.attempted ? 100 * c.correct / c.attempted : 0;
  const smooth = c.attempted ? 100 * (c.correct + 5) / (c.attempted + 10) : 0;
  const minimum = activeContest().minQuestions || MIN_SAMPLE, eligible = c.attempted >= minimum, bands = accuracyBands();
  let status: Status = 'neutral';
  if (eligible && raw < bands.recovery) status = 'bad'; else if (eligible && raw < bands.target) status = 'warn'; else if (eligible) status = 'good';
  const days = c.lastAttemptAt ? Math.max(0, (Date.now() - new Date(c.lastAttemptAt).getTime()) / 86400000) : 14;
  const contest = activeContest(), recency = 1 + Math.min(days / 14, 1), repeat = 1 + Math.min(c.repeatErrors / 5, 1), weight = c.subject === 'specific' ? contest.specificWeight : contest.generalWeight;
  const coverage = (c as Caderno & { coverage?: string }).coverage === 'missing' ? 1.5 : (c as Caderno & { coverage?: string }).coverage === 'partial' ? 1.2 : 1;
  const gap = Math.max(0, bands.target - smooth) / 100, maintenance = raw >= bands.target ? Math.min(days / 60, .08) : 0;
  const risk = eligible ? weight * (gap + maintenance) * recency * repeat * coverage : 0;
  const action = !eligible ? `Resolver ${Math.max(0, minimum - c.attempted)} questões novas para medir` : raw < bands.critical ? 'Reaprender a teoria + questões graduais' : raw < bands.recovery ? 'Recuperação dirigida + 15 questões novas' : raw < bands.consolidation ? 'Consolidar erros + 12 questões novas' : raw < bands.target ? `Fechar a lacuna até ${bands.target}%` : 'Manutenção espaçada para sustentar a meta';
  return { raw, smooth, eligible, status, risk, action };
}
function ranked(): Ranked[] { return Object.values(state.cadernos).filter((c) => c.contestId === state.activeContestId).map((c) => ({ ...c, d: diagnosis(c) })).sort((a, b) => b.d.risk - a.d.risk || a.name.localeCompare(b.name, 'pt-BR')); }
function daysUntilExam(): number { const examDate = activeContest().examDate; return examDate ? Math.max(0, Math.ceil((new Date(`${examDate}T23:59:59`).getTime() - Date.now()) / 86400000)) : 0; }
function studyPhase(): { key: StudyPhase; label: string; description: string } { const days = daysUntilExam(), examDate = activeContest().examDate; if (!examDate) return { key: 'pre-edital', label: 'PRÉ-EDITAL', description: 'Construção de base e cobertura ampla do edital previsto.' }; if (days <= 1) return { key: 'vespera', label: 'VÉSPERA', description: 'Revisão curta, erros recorrentes e preservação do descanso.' }; if (days <= 10) return { key: 'reta-final', label: 'RETA FINAL', description: 'Consolidar pontos fracos, simulados e revisão espaçada.' }; if (days <= 45) return { key: 'consolidacao', label: 'CONSOLIDAÇÃO', description: 'Alternar teoria objetiva, questões FGV e recuperação de erros.' }; return { key: 'base', label: 'FORMAÇÃO DE BASE', description: 'Cobrir o conteúdo essencial antes de intensificar simulados.' }; }
function weightedAccuracy(list: Ranked[]): number { const measured = list.filter((item) => item.attempted > 0), total = measured.reduce((sum, item) => sum + item.attempted * (item.subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight), 0); return total ? 100 * measured.reduce((sum, item) => sum + item.correct * (item.subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight), 0) / total : 0; }
function renderDecision(list: Ranked[]): void { const target = $('#decisionText'), phaseBadge = $('#phaseBadge'); if (!target || !phaseBadge) return; const phase = studyPhase(), bands = accuracyBands(), studied = currentDay().seconds / 60, remaining = Math.max(0, Math.ceil(state.targetMinutes - studied)), accuracy = weightedAccuracy(list), recovery = list.filter((item) => item.d.eligible && item.d.raw < bands.recovery).length; phaseBadge.textContent = phase.label; phaseBadge.className = `badge ${phase.key === 'vespera' || phase.key === 'reta-final' ? 'warn' : phase.key === 'pre-edital' ? 'neutral' : 'good'}`; let title = '', action = ''; if (!list.length) { title = 'Aguardando a primeira leitura automática do TEC'; action = 'Enquanto isso, o sistema mantém a trilha de conteúdo disponível e registra seu tempo nos players.'; } else if (!remaining) { title = 'Meta líquida de hoje concluída'; action = phase.key === 'vespera' ? 'Encerrar ou fazer apenas uma revisão leve.' : 'Se continuar, use revisão espaçada dos erros — não aumente a carga automaticamente.'; } else if (recovery) { title = `${recovery} assunto(s) abaixo da faixa de recuperação (${bands.recovery}%)`; action = `Dedique os próximos ${remaining} min a teoria objetiva + questões novas dos maiores riscos.`; } else if (!accuracy) { title = 'Ainda sem amostra suficiente de desempenho'; action = `Use ${remaining} min para cobrir a base e resolver questões FGV para calibrar o plano.`; } else if (accuracy >= bands.target) { title = `Objetivo de ${bands.target}% atingido`; action = `O sistema reduz a carga para manutenção espaçada e protege o resultado até a prova.`; } else if (phase.key === 'reta-final' || phase.key === 'vespera') { title = `Consolidar rumo à meta de ${bands.target}% (${accuracy.toFixed(1)}% ponderado)`; action = `Priorize erros, revisão e simulado; evite abrir assuntos de baixo retorno nos ${remaining} min restantes.`; } else { title = `Avançar rumo à meta de ${bands.target}% (${accuracy.toFixed(1)}% ponderado)`; action = `${phase.description} Restam ${remaining} min da disponibilidade de hoje.`; } target.innerHTML = `<span class="badge ${recovery ? 'bad' : 'good'}">${recovery ? 'RECUPERAÇÃO' : 'PRÓXIMA AÇÃO'}</span><div><strong>${esc(title)}</strong><div>${esc(action)}</div><div class="muted">${phase.description} · ${daysUntilExam() ? `${daysUntilExam()} dias até a prova` : 'data da prova ainda não definida'}.</div></div>`; }
function dailyPlan(list = ranked()): StudyBlock[] {
  const available = Math.max(0, state.targetMinutes - Math.floor(currentDay().seconds / 60)), accuracy = weightedAccuracy(list), total = list.length && accuracy >= accuracyBands().target ? Math.min(available, 60) : available, specific = list.filter((item) => item.subject === 'specific'), general = list.filter((item) => item.subject === 'general');
  if (total < 5) return [];
  const specificRisk = specific.reduce((sum, item) => sum + item.d.risk, 0), generalRisk = general.reduce((sum, item) => sum + item.d.risk, 0);
  const imbalance = specificRisk + generalRisk ? (specificRisk - generalRisk) / (specificRisk + generalRisk) : 0;
  const contest = activeContest(), weightRatio = contest.specificWeight / (contest.specificWeight + contest.generalWeight), specificShare = Math.max(.45, Math.min(.85, weightRatio + imbalance * .12));
  const minutesBySubject: Record<Subject, number> = { specific: Math.round(total * specificShare), general: total - Math.round(total * specificShare) };
  const blocks: StudyBlock[] = [];
  (['specific', 'general'] as Subject[]).forEach((subject) => {
    const pool = list.filter((item) => item.subject === subject).slice(0, 4), fallback = subject === 'specific' ? 'Específicas — cobertura e recuperação' : 'Gerais — revisão e questões';
    if (!pool.length) { blocks.push({ subject, topic: fallback, minutes: minutesBySubject[subject], mode: 'review', action: 'Adicionar resultados do TEC para calibrar', risk: 0 }); return; }
    const totalRisk = pool.reduce((sum, item) => sum + Math.max(item.d.risk, .15), 0);
    pool.forEach((item) => { const minutes = Math.max(25, Math.round(minutesBySubject[subject] * Math.max(item.d.risk, .15) / totalRisk)), recovery = item.d.eligible && item.d.raw < accuracyBands().recovery; blocks.push({ subject, topic: item.name, minutes, mode: recovery ? 'correction' : item.attempted < activeContest().minQuestions ? 'tec' : 'video', action: item.d.action, risk: item.d.risk }); });
  });
  return blocks.sort((a, b) => b.risk - a.risk);
}
function renderHud(list = ranked()): void {
  const seconds = currentDay().seconds + pendingSessionSeconds, recovery = list.filter((x) => x.d.eligible && x.d.raw < accuracyBands().recovery), next = list[0];
  $('#hudTime').textContent = fmtSeconds(seconds, true); $('#hudTarget').textContent = `${activeContest().targetAccuracy}% · ${state.targetMinutes} min`; $('#hudRecovery').textContent = String(recovery.length); $('#hudRecovery').style.color = recovery.length ? '#fb7185' : '#34d399'; $('#hudNext').textContent = next ? next.name : 'Aguardando dados'; $('#hudNext').title = next ? next.d.action : 'Aguardando sincronização automática do TEC'; $('#hudSync').textContent = state.sync ? fmtDate(state.sync.at) : 'local';
}
function renderTimer(): void { const seconds = currentDay().seconds + pendingSessionSeconds; $('#clock').textContent = fmtSeconds(seconds); $('#timerStatus').textContent = timerRunning ? (focused() ? 'Estudando' : 'Pausado: página fora de foco') : 'Aguardando atividade'; $('#timerToggle').textContent = timerRunning ? 'Pausar sessão' : 'Iniciar sessão'; $('#hudTimerToggle').textContent = timerRunning ? 'Pausar' : 'Iniciar'; $<HTMLSelectElement>('#hudSessionType').value = $<HTMLSelectElement>('#sessionType').value; renderHud(); }
function renderTable(list: Ranked[]): void { const bands = accuracyBands(); $('#cadernosEmpty').style.display = list.length ? 'none' : 'block'; $('#cadernosBody').innerHTML = list.map((x) => { const d = x.d, pct = x.attempted ? d.raw : 0; return `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.topic)}</small></td><td>${x.subject === 'specific' ? 'Específicas' : 'Gerais'}</td><td><div>${pct.toFixed(1)}%</div><div class="bar"><span class="${d.status}" style="width:${Math.min(100, pct)}%"></span></div></td><td>${x.correct}/${x.attempted}<small>${x.repeatErrors || 0} erros repetidos</small></td><td><span class="badge ${d.status}">${d.eligible ? (d.raw < bands.recovery ? 'RECUPERAÇÃO' : d.raw < bands.consolidation ? 'CONSOLIDAÇÃO' : d.raw < bands.target ? 'QUASE NA META' : 'META ATINGIDA') : 'AMOSTRA PEQUENA'}</span></td><td>${esc(d.action)}</td></tr>`; }).join(''); }
function renderNext(x?: Ranked): void { if (!x) { $('#planStatus').textContent = 'Sem diagnóstico'; $('#planStatus').className = 'badge neutral'; $('#nextBlock').innerHTML = '<span class="badge neutral">AGUARDANDO</span><div><strong>Aguardando sincronização automática do TEC.</strong><div class="muted">Assim que houver dados, o motor priorizará a recuperação com maior retorno por minuto.</div></div>'; return; } const d = x.d, contest = activeContest(), bands = accuracyBands(), title = d.raw < bands.recovery ? 'Recuperação obrigatória' : d.raw < bands.target ? 'Consolidação até a meta' : 'Manutenção espaçada'; $('#planStatus').textContent = title; $('#planStatus').className = `badge ${d.status}`; $('#nextBlock').innerHTML = `<span class="badge ${d.status}">${x.subject === 'specific' ? `ESPECÍFICAS · ${contest.specificWeight}` : `GERAIS · ${contest.generalWeight}`}</span><div><strong>${esc(x.name)}</strong><div>${esc(d.action)} · ${x.attempted} questões · <b>${d.raw.toFixed(1)}%</b></div><div class="muted">Meta ${bands.target}% · prioridade ${d.risk.toFixed(2)} · ${esc(x.topic || 'assunto do caderno')}</div></div>`; }
function renderDailyPlan(list: Ranked[]): void {
  const target = $('#dailyPlan'), blocks = dailyPlan(list);
  if (!target) return;
  const specificMinutes = blocks.filter((block) => block.subject === 'specific').reduce((sum, block) => sum + block.minutes, 0);
  const generalMinutes = blocks.filter((block) => block.subject === 'general').reduce((sum, block) => sum + block.minutes, 0);
  const contest = activeContest();
  target.innerHTML = `<div class="plan-summary"><span><b>${daysUntilExam()}</b> dias até a prova</span><span>Específicas <b>${specificMinutes} min</b></span><span>Gerais <b>${generalMinutes} min</b></span></div><div class="plan-list">${blocks.map((block, index) => `<button class="plan-row" data-plan-index="${index}" data-session-type="${block.mode}" title="Selecionar ${esc(block.topic)}"><span class="plan-number">${index + 1}</span><span class="plan-main"><strong>${esc(block.topic)}</strong><small>${block.subject === 'specific' ? `Específicas · peso ${contest.specificWeight}` : `Gerais · peso ${contest.generalWeight}`} · ${esc(block.action)}</small></span><span class="plan-time">${block.minutes} min</span></button>`).join('')}</div>`;
  target.querySelectorAll<HTMLButtonElement>('.plan-row').forEach((button) => button.addEventListener('click', () => { const type = button.dataset.sessionType || 'review'; $<HTMLSelectElement>('#sessionType').value = type; $<HTMLSelectElement>('#hudSessionType').value = type; $('#timerStatus').textContent = `Bloco selecionado: ${button.querySelector('strong')?.textContent || ''}`; $('#timerToggle').focus(); }));
}
function renderRoadmap(): void {
  const target = $('#roadmapList'), badge = $('#roadmapBadge');
  if (!target || !badge) return;
  const items = roadmapItems.length ? roadmapItems : Object.values(state.content?.[state.activeContestId] || []).map((item) => ({ code: item.code, area: item.area, layer: item.layer, title: item.title, videoId: item.videoId, tec: (item.tec || []).map((entry: any) => String(entry.name || '')).filter(Boolean).join(' · ') }));
  if (!items.length) { badge.textContent = 'aguardando player'; target.innerHTML = '<div class="empty">A trilha será carregada automaticamente ao abrir um dos players.</div>'; return; }
  const diagnoses = ranked();
  const related = (item: RoadmapItem): Ranked[] => { const haystack = `${item.title} ${item.tec}`.toLowerCase(); return diagnoses.filter((entry) => haystack.includes(entry.name.toLowerCase()) || (entry.topic && haystack.includes(entry.topic.toLowerCase()))); };
  const priority = (item: RoadmapItem): number => { const matches = related(item); return matches.length ? Math.max(...matches.map((entry) => entry.d.risk)) : 0; };
  const measured = items.filter((item) => related(item).length).length;
  badge.textContent = `${items.length} segmentos · ${measured} calibrados`;
  const groups = [...new Set(items.map((item) => item.area || 'Outros'))];
  const bands = accuracyBands();
  target.innerHTML = groups.map((area) => { const group = items.filter((item) => item.area === area).sort((a, b) => priority(b) - priority(a)); return `<details class="roadmap-group" open><summary><strong>${esc(area)}</strong><span>${group.length} segmentos</span></summary><div>${group.map((item) => { const matches = related(item), best = matches.sort((a, b) => b.d.risk - a.d.risk)[0], status = !best ? '<span class="badge neutral">SEM MEDIÇÃO</span>' : !best.d.eligible ? '<span class="badge warn">MEDIR</span>' : best.d.raw < bands.recovery ? '<span class="badge bad">RECUPERAR</span>' : best.d.raw < bands.target ? '<span class="badge warn">CONSOLIDAR</span>' : '<span class="badge good">META ATINGIDA</span>'; return `<div class="roadmap-item"><div><span class="tag">${esc(item.code)} · ${esc(item.layer)}</span>${status}</div><strong>${esc(item.title)}</strong><small>${esc(item.tec || 'Conteúdo teórico integrado')}</small></div>`; }).join('')}</div></details>`; }).join('');
}
async function loadRoadmap(): Promise<void> {
  try {
    const response = await fetch('MAPA_VIDEO_TEC.csv', { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = parseCSV(await response.text());
    roadmapItems = rows.map((row) => ({ code: String(row.codigo || ''), area: String(row.area || ''), layer: String(row.camada || ''), title: String(row.titulo || ''), videoId: String(row.video || ''), tec: String(row.cadernos_tec || '') })).filter((item) => item.code && item.title);
    renderRoadmap();
  } catch { renderRoadmap(); }
}
function renderContestControls(): void {
  const select = $('#contestSelect') as HTMLSelectElement, contest = activeContest();
  if (!select) return;
  select.innerHTML = Object.values(state.contests).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  select.value = state.activeContestId;
  $('#todayLabel').title = `${contest.name} · prova: ${contest.examDate || 'data não definida'}`;
}
function activateContest(id: string): void {
  if (!state.contests[id] || id === state.activeContestId) return;
  if (timerRunning) pauseTimer('contest-switch');
  Object.values(state.contests).forEach((contest) => { contest.priority = contest.id === id ? 'primary' : 'secondary'; contest.updatedAt = new Date().toISOString(); });
  state.activeContestId = id;
  state.targetMinutes = activeContest().targetMinutes;
  currentDay();
  state.sync = null;
  saveState(); render();
  if (cloud) void pullCloud().then(() => { render(); return syncCloud(); });
}
function createContestFromForm(event: SubmitEvent): void {
  event.preventDefault();
  const form = new FormData(event.currentTarget as HTMLFormElement), name = String(form.get('name') || '').trim();
  if (!name) return;
  const id = contestIdFromName(name), contest: ContestConfig = { id, name, examDate: String(form.get('examDate') || ''), targetMinutes: Math.max(30, Math.min(960, Number(form.get('targetMinutes')) || DEFAULT_TARGET)), targetAccuracy: Math.max(50, Math.min(100, Number(form.get('targetAccuracy')) || 100)), specificWeight: Math.max(.1, Number(form.get('specificWeight')) || 2.5), generalWeight: Math.max(.1, Number(form.get('generalWeight')) || 1), minQuestions: Math.max(1, Math.min(100, Number(form.get('minQuestions')) || MIN_SAMPLE)), priority: 'primary', updatedAt: new Date().toISOString() };
  Object.values(state.contests).forEach((item) => { item.priority = 'secondary'; item.updatedAt = new Date().toISOString(); });
  state.contests[id] = contest; state.activeContestId = id; state.targetMinutes = contest.targetMinutes; currentDay(); saveState(); (event.currentTarget as HTMLFormElement).reset(); $('#contestFormWrap').hidden = true; render(); if (cloud) void syncCloud();
}
function render(): void { const contest = activeContest(), bands = accuracyBands(), list = ranked(), evaluated = list.filter((x) => x.d.eligible), recovery = evaluated.filter((x) => x.d.raw < bands.recovery), seconds = currentDay().seconds; $('#todayLabel').textContent = `${new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · ${contest.name}`; renderContestControls(); $<HTMLInputElement>('#targetMinutes').value = String(state.targetMinutes); $<HTMLInputElement>('#goalAccuracy').value = String(contest.targetAccuracy); $('#metricTime').textContent = fmtSeconds(seconds, true); $('#metricTimeSub').textContent = `${Math.min(100, Math.round(100 * seconds / (state.targetMinutes * 60)))}% da meta de ${state.targetMinutes} min`; $('#dayProgress').style.width = `${Math.min(100, 100 * seconds / (state.targetMinutes * 60))}%`; $('#metricCadernos').textContent = String(evaluated.length); $('#metricCadernosSub').textContent = `${list.length} cadastrados · mínimo de ${contest.minQuestions} questões`; $('#metricRecovery').textContent = String(recovery.length); $('#metricRecoverySub').textContent = `abaixo de ${bands.recovery}% · objetivo ${bands.target}%`; const sync = state.sync?.at; $('#metricSync').textContent = sync ? fmtDate(sync) : 'Nunca'; $('#metricSyncSub').textContent = state.sync?.source || 'dados locais'; $('#syncDate').textContent = sync ? fmtDate(sync) : 'nunca'; $('#syncBadge').textContent = state.sync ? 'ATUALIZADO' : 'LOCAL'; $('#syncBadge').className = `badge ${state.sync ? 'good' : 'neutral'}`; renderDecision(list); renderNext(list[0]); renderDailyPlan(list); renderRoadmap(); renderTable(list); renderHud(list); renderTimer(); renderAccount(); }
function focused(): boolean { return document.visibilityState === 'visible' && (document.hasFocus() || document.activeElement?.tagName === 'IFRAME'); }
function timerLoop(): void { if (!timerRunning) return; const now = performance.now(); if (focused() && timerLast) pendingSessionSeconds += Math.max(0, Math.min(5, (now - timerLast) / 1000)); timerLast = now; renderTimer(); }
function startTimer(source: 'manual' | 'player' = 'manual'): void { if (source === 'manual') manualPause = false; if (timerRunning) return; if (playerPauseTick) window.clearTimeout(playerPauseTick); playerPauseTick = null; timerRunning = true; timerLast = performance.now(); timerTick = window.setInterval(timerLoop, 1000); renderTimer(); }
function pauseTimer(reason = 'manual'): void { if (reason === 'manual' || reason === 'hud') manualPause = true; if (!timerRunning) return; timerLoop(); timerRunning = false; if (timerTick) window.clearInterval(timerTick); timerTick = null; if (pendingSessionSeconds >= 1) { const seconds = Math.round(pendingSessionSeconds), type = $<HTMLSelectElement>('#sessionType').value; currentDay().seconds += seconds; currentDay().sessions.push({ type, seconds, endedAt: new Date().toISOString(), reason }); recordEvent(eventTypeForSession(type), reason === 'player' ? 'youtube-embed' : 'nexame', seconds, { reason }); pendingSessionSeconds = 0; saveState(); } render(); }
function parseCSV(text: string): Record<string, unknown>[] { const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i], next = text[i + 1]; if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; } if (ch === '"') { quoted = !quoted; continue; } if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; } if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && next === '\n') i++; row.push(cell.trim()); cell = ''; if (row.some(Boolean)) rows.push(row); row = []; continue; } cell += ch; } if (cell || row.length) { row.push(cell.trim()); rows.push(row); } if (!rows.length) return []; const headers = rows.shift()!.map((x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')); return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || '']))); }
function importRecords(input: unknown, source: string): void { const records = Array.isArray(input) ? input : (input as { cadernos?: unknown[]; data?: unknown[]; items?: unknown[] })?.cadernos || (input as { data?: unknown[] })?.data || (input as { items?: unknown[] })?.items || []; if (!records.length) throw new Error('Não encontrei uma lista de cadernos no arquivo.'); records.forEach((raw, i) => { const c = normalize(raw as Record<string, unknown>, i), key = cadernoKey(c.id, c.contestId), old = state.cadernos[key]; state.cadernos[key] = old ? { ...old, ...c } : c; }); state.sync = { at: new Date().toISOString(), source: `${source} · ${records.length} cadernos · ${contestLabel(state.activeContestId)}` }; saveState(); render(); $('#syncMessage').innerHTML = `<strong>Importação concluída.</strong> ${records.length} registros processados para ${esc(contestLabel(state.activeContestId))}. O plano foi recalculado.`; }
function readFile(file: File): void { const reader = new FileReader(); reader.onload = () => { try { const text = String(reader.result), input = file.name.toLowerCase().endsWith('.csv') ? parseCSV(text) : JSON.parse(text); importRecords(input, file.name); } catch (error) { $('#syncMessage').innerHTML = `<strong>Falha na importação:</strong> ${esc(error instanceof Error ? error.message : error)}`; } }; reader.readAsText(file); }
async function pullLocalSnapshot(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:8765/tec_sync.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { generatedAt?: string; cadernos?: unknown[]; questionAttempts?: Array<{ id?: string; cadernoId?: string; correct?: boolean; attemptedAt?: string; durationSeconds?: number; topic?: string }> };
    if ((!Array.isArray(payload.cadernos) || !payload.cadernos.length) && !(payload.questionAttempts || []).length) {
      $('#syncMessage').innerHTML = '<strong>Ponte ativa.</strong> Aguardando uma página de resultados do TEC.';
      return true;
    }
    if (payload.generatedAt && payload.generatedAt === lastLocalSnapshotAt) return true;
    if ((payload.cadernos || []).length) importRecords(payload, 'ponte TEC automática');
    for (const attempt of payload.questionAttempts || []) {
      if (!attempt.id || typeof attempt.correct !== 'boolean') continue;
      recordQuestionAttempt({ externalQuestionId: String(attempt.id), cadernoId: attempt.cadernoId, correct: attempt.correct, attemptedAt: attempt.attemptedAt || payload.generatedAt || new Date().toISOString(), durationSeconds: attempt.durationSeconds, metadata: { topic: attempt.topic || '' } });
    }
    if ((payload.questionAttempts || []).length) recordEvent('question_session', 'tec-extension', 0, { attempts: payload.questionAttempts!.length });
    saveState();
    lastLocalSnapshotAt = payload.generatedAt || new Date().toISOString();
    return true;
  } catch (error) {
    $('#syncMessage').innerHTML = `<strong>Ponte local indisponível.</strong> ${esc(error instanceof Error ? error.message : error)}.`;
    return false;
  }
}
function exportData(): void { const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `estudos-${today}.json`; link.click(); URL.revokeObjectURL(link.href); }

function mountPlayer(view: string): void { const wrap = $<HTMLDivElement>(`#${view} .iframe-wrap`); if (!wrap || wrap.querySelector('iframe')) return; const frame = document.createElement('iframe'); frame.src = wrap.dataset.playerSrc || ''; frame.title = wrap.dataset.playerTitle || ''; frame.loading = 'eager'; wrap.appendChild(frame); }
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); document.querySelectorAll('.view').forEach((x) => x.classList.remove('active')); button.classList.add('active'); $(`#${button.dataset.view}`).classList.add('active'); if (button.dataset.view === 'specific' || button.dataset.view === 'general') mountPlayer(button.dataset.view); history.replaceState(null, '', `#${button.dataset.view}`); }));
$('#targetMinutes').addEventListener('change', (event) => { state.targetMinutes = Math.max(30, Math.min(960, Number((event.target as HTMLInputElement).value) || DEFAULT_TARGET)); activeContest().targetMinutes = state.targetMinutes; activeContest().updatedAt = new Date().toISOString(); saveState(); render(); });
$('#goalAccuracy').addEventListener('change', (event) => { activeContest().targetAccuracy = Math.max(50, Math.min(100, Number((event.target as HTMLInputElement).value) || 100)); activeContest().updatedAt = new Date().toISOString(); saveState(); render(); });
$('#contestSelect').addEventListener('change', (event) => activateContest((event.target as HTMLSelectElement).value)); $('#newContest').addEventListener('click', () => { $('#contestFormWrap').hidden = false; $<HTMLInputElement>('#contestForm input[name="name"]').focus(); }); $('#cancelContest').addEventListener('click', () => { $('#contestFormWrap').hidden = true; }); $('#contestForm').addEventListener('submit', createContestFromForm);
document.querySelector<HTMLButtonElement>('#settingsNav')?.addEventListener('click', () => { document.querySelector<HTMLButtonElement>('[data-view="dashboard"]')?.click(); $('#settingsArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
document.querySelector<HTMLButtonElement>('#accountButton')?.addEventListener('click', () => { void connectAccount(); });
$('#recalc').addEventListener('click', () => { render(); $('#syncMessage').innerHTML = '<strong>Plano recalculado.</strong> A prioridade considera peso, acurácia, recência e erros repetidos.'; });
$('#export').addEventListener('click', exportData); void pullLocalSnapshot(); setInterval(pullLocalSnapshot, 2 * 60 * 1000);
$('#timerToggle').addEventListener('click', () => timerRunning ? pauseTimer('manual') : startTimer('manual')); $('#hudTimerToggle').addEventListener('click', () => timerRunning ? pauseTimer('hud') : startTimer('manual')); $('#hudSessionType').addEventListener('change', (event) => { $<HTMLSelectElement>('#sessionType').value = (event.target as HTMLSelectElement).value; }); $('#hudPanel').addEventListener('click', () => document.querySelector<HTMLButtonElement>('[data-view="dashboard"]')!.click()); $('#timerReset').addEventListener('click', () => { if (timerRunning) pauseTimer('reset'); state.daily[dayKey()] = { seconds: 0, sessions: [] }; saveState(); render(); });
['visibilitychange', 'blur'].forEach((eventName) => document.addEventListener(eventName, () => { if (timerRunning) { timerLoop(); renderTimer(); } })); window.addEventListener('focus', () => { if (timerRunning) timerLast = performance.now(); renderTimer(); }); window.addEventListener('beforeunload', () => { if (timerRunning) pauseTimer('unload'); });
$('#clearCadernos').addEventListener('click', () => { if (confirm('Remover os cadernos e resultados deste concurso neste navegador?')) { Object.keys(state.cadernos).filter((key) => key.startsWith(`${state.activeContestId}::`)).forEach((key) => delete state.cadernos[key]); state.sync = null; saveState(); render(); } }); $('#cadernoForm').addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement), c = normalize({ id: `manual-${String(form.get('name')).toLowerCase().replace(/\W+/g, '-')}`, name: form.get('name'), subject: form.get('subject'), attempted: form.get('attempted'), correct: form.get('correct'), repeatErrors: form.get('repeatErrors'), lastAttemptAt: form.get('lastAttemptAt') }); state.cadernos[cadernoKey(c.id)] = c; state.sync = { at: new Date().toISOString(), source: `cadastro manual · ${contestLabel(state.activeContestId)}` }; saveState(); (event.currentTarget as HTMLFormElement).reset(); render(); });
window.addEventListener('message', (event: MessageEvent<{ type?: string; playing?: boolean; player?: string; code?: string; seconds?: number; completed?: boolean; catalog?: ContentItem[] }>) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'dataprev-study-state') {
    if (event.data.playing) {
      const frame = [...document.querySelectorAll('iframe')].find((item) => item.contentWindow === event.source);
      if (frame?.closest('#specific') || frame?.closest('#general')) { $<HTMLSelectElement>('#sessionType').value = 'video'; $<HTMLSelectElement>('#hudSessionType').value = 'video'; }
      if (playerPauseTick) window.clearTimeout(playerPauseTick); playerPauseTick = null;
      if (!timerRunning && !manualPause) startTimer('player');
    } else if (timerRunning && !playerPauseTick) { playerPauseTick = window.setTimeout(() => { playerPauseTick = null; if (timerRunning) pauseTimer('player'); }, 1500); }
    return;
  }
  if (event.data?.type === 'dataprev-content-catalog' && Array.isArray(event.data.catalog)) { state.content![state.activeContestId] = event.data.catalog; saveState(); return; }
  if (event.data?.type === 'dataprev-content-progress' && event.data.code) { const key = `${state.activeContestId}::${event.data.code}`; state.contentProgress![key] = { player: event.data.player || 'player', code: event.data.code, seconds: Math.max(0, Number(event.data.seconds) || 0), completed: Boolean(event.data.completed), updatedAt: new Date().toISOString() }; saveState(); }
});
if (location.hash === '#specific' || location.hash === '#general') document.querySelector<HTMLButtonElement>(`[data-view="${location.hash.slice(1)}"]`)?.click();
render();
void initCloud();
void loadRoadmap();
