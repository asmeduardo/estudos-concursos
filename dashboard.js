"use strict";
const KEY = 'study-dashboard-state-v2';
const LEGACY_KEY = 'dataprev-study-state-v1';
const MIN_SAMPLE = 10;
const DEFAULT_TARGET = 390;
const DEFAULT_CONTEST = { id: 'meu-primeiro-concurso', name: 'Meu concurso', examDate: '', targetMinutes: DEFAULT_TARGET, targetAccuracy: 100, specificWeight: 1, generalWeight: 1, minQuestions: MIN_SAMPLE, priority: 'primary', updatedAt: new Date().toISOString() };
const today = new Date().toISOString().slice(0, 10);
const $ = (selector) => document.querySelector(selector);
const state = loadState();
state.contests ||= {};
if (!Object.keys(state.contests).length)
    state.contests[DEFAULT_CONTEST.id] = { ...DEFAULT_CONTEST };
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
state.platformStudyTotals ||= {};
state.timeSummaries ||= {};
Object.values(state.cadernos).forEach((c) => {
    c.contestId ||= state.activeContestId;
    // Corrige snapshots antigos da extensão que misturavam o total de outra
    // área da página com os acertos/erros do caderno aberto. Em plataformas de
    // questões, acertos + erros é a quantidade efetivamente resolvida.
    if (/^(tec|qconcursos)$/i.test(c.sourcePlatform || '') && c.correct + c.incorrect > 0 && c.attempted !== c.correct + c.incorrect)
        c.attempted = c.correct + c.incorrect;
});
Object.entries(state.cadernos).filter(([key]) => !key.includes('::')).forEach(([key, c]) => { delete state.cadernos[key]; state.cadernos[cadernoKey(c.id, c.contestId)] = c; });
const legacyDay = state.daily[today];
if (legacyDay && !state.daily[`${state.activeContestId}::${today}`])
    state.daily[`${state.activeContestId}::${today}`] = legacyDay;
state.daily[`${state.activeContestId}::${today}`] ||= { seconds: 0, sessions: [] };
let timerRunning = false;
let timerTick = null;
let timerLast = 0;
let pendingSessionSeconds = 0;
let playerPauseTick = null;
let manualPause = false;
let cloud = null;
let cloudUserId = '';
let cloudUserEmail = '';
let cloudIsAnonymous = true;
let cloudSyncTick = null;
let cloudSyncBusy = false;
let lastExtensionSnapshotAt = '';
let roadmapItems = [];
function activeContest() { return state.contests[state.activeContestId] || DEFAULT_CONTEST; }
function dayKey(date = today, contestId = state.activeContestId) { return `${contestId}::${date}`; }
function currentDay() { const key = dayKey(); state.daily[key] ||= { seconds: 0, sessions: [] }; return state.daily[key]; }
function cadernoKey(id, contestId = state.activeContestId) { return `${contestId}::${id}`; }
function contestLabel(contestId) { return state.contests[contestId]?.name || contestId; }
function contestIdFromName(name) { const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'concurso'; return `${base}-${Date.now().toString(36)}`; }
function loadState() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '{}');
    }
    catch {
        return { targetMinutes: DEFAULT_TARGET, cadernos: {}, contests: {}, activeContestId: DEFAULT_CONTEST.id, content: {}, contentProgress: {}, daily: {} };
    }
}
function saveState() {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (!cloud || cloudSyncBusy)
        return;
    if (cloudSyncTick)
        window.clearTimeout(cloudSyncTick);
    cloudSyncTick = window.setTimeout(() => { void syncCloud(); }, 700);
}
function eventId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function eventTypeForSession(type) {
    if (type === 'video')
        return 'video_session';
    if (type === 'tec')
        return 'question_session';
    if (type === 'correction' || type === 'review')
        return 'review_session';
    return 'simulation';
}
function recordEvent(type, source, seconds = 0, metadata = {}) {
    state.events.push({ id: eventId('evt'), contestId: state.activeContestId, type, source, seconds: Math.max(0, Math.round(seconds)), endedAt: new Date().toISOString(), metadata, uploaded: false });
    // Conserva o histórico recente local; a fonte durável é o Supabase quando conectado.
    if (state.events.length > 2500)
        state.events = state.events.slice(-2500);
}
function recordQuestionAttempt(attempt) {
    const id = `question-${attempt.externalQuestionId}-${attempt.attemptedAt}-${attempt.correct ? 'c' : 'e'}`;
    if (state.questionAttempts.some((item) => item.id === id))
        return;
    state.questionAttempts.push({ ...attempt, id, contestId: state.activeContestId, uploaded: false });
    if (state.questionAttempts.length > 5000)
        state.questionAttempts = state.questionAttempts.slice(-5000);
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)); }
function fmtSeconds(total, short = false) {
    total = Math.max(0, Math.floor(total || 0));
    const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    return short ? `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtMinutes(minutes) { return fmtSeconds(Math.max(0, minutes) * 60); }
function fmtDate(value) {
    if (!value)
        return 'nunca';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function numberValue(value) { return Number(String(value ?? '').replace('%', '').replace(',', '.')) || 0; }
function normalize(raw, index = 0) {
    let attempted = numberValue(raw.attempted ?? raw.respondidas ?? raw.resolvidas ?? raw.total);
    const accuracy = numberValue(raw.accuracy ?? raw.aproveitamento ?? raw.percentualAcerto);
    let correct = numberValue(raw.correct ?? raw.acertos ?? raw.certas);
    if (!correct && attempted && accuracy)
        correct = Math.round(attempted * accuracy / 100);
    const name = String(raw.name ?? raw.nome ?? raw.title ?? `Caderno ${index + 1}`);
    const id = String(raw.id ?? raw.cadernoId ?? raw.codigo ?? `local-${index}-${name.toLowerCase().replace(/\W+/g, '-')}`);
    const area = String(raw.subject ?? raw.area ?? raw.disciplina ?? 'specific').toLowerCase();
    const subject = /geral|portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade|conhecimentos gerais/.test(area) ? 'general' : 'specific';
    const sourcePlatform = String(raw.sourcePlatform ?? raw.source_platform ?? '');
    const explicitIncorrect = numberValue(raw.incorrect ?? raw.erros);
    // O conector só envia uma linha quando conseguiu ler o tripé completo
    // resolvidas/acertos/erros. Dê preferência a ele, nunca a um número solto
    // encontrado na página (por exemplo, “questão 44”).
    if (/^(tec|qconcursos)$/i.test(sourcePlatform) && correct + explicitIncorrect > 0)
        attempted = correct + explicitIncorrect;
    const incorrect = explicitIncorrect || Math.max(0, attempted - correct);
    return { id, contestId: String(raw.contestId ?? raw.contest_id ?? state.activeContestId), name, subject, sourcePlatform, topic: String(raw.topic ?? raw.assunto ?? ''), attempted: Math.max(0, attempted), correct: Math.max(0, Math.min(correct, attempted || correct)), incorrect: Math.max(0, incorrect), repeatErrors: numberValue(raw.repeatErrors ?? raw.errosRepetidos), lastAttemptAt: String(raw.lastAttemptAt ?? raw.ultimoEstudo ?? raw.lastAttempt ?? '') || null, updatedAt: new Date().toISOString() };
}
function cloudConfigured() {
    const cfg = window.__SUPABASE_CONFIG__;
    return Boolean(cfg?.url && cfg.anonKey && window.supabase?.createClient);
}
function cloudCaderno(raw) {
    return {
        id: String(raw.caderno_id ?? raw.id ?? ''), contestId: String(raw.contest_id ?? state.activeContestId), name: String(raw.name ?? ''),
        subject: raw.subject === 'general' ? 'general' : 'specific', topic: String(raw.topic ?? ''),
        attempted: numberValue(raw.attempted), correct: numberValue(raw.correct), incorrect: numberValue(raw.incorrect),
        repeatErrors: numberValue(raw.repeat_errors), lastAttemptAt: String(raw.last_attempt_at ?? '') || null,
        updatedAt: String(raw.updated_at ?? new Date().toISOString())
    };
}
function cloudContent(raw) {
    return { code: String(raw.content_code || ''), area: String(raw.area || ''), layer: String(raw.layer || ''), videoId: String(raw.video_id || ''), start: numberValue(raw.start_seconds), end: numberValue(raw.end_seconds), title: String(raw.title || ''), channel: String(raw.channel || ''), purpose: String(raw.purpose || ''), tec: Array.isArray(raw.tec) ? raw.tec : [] };
}
function cloudMessage(message) {
    const target = $('#syncMessage');
    if (target)
        target.innerHTML = message;
}
function renderAccount() {
    const button = document.querySelector('#accountButton');
    if (!button)
        return;
    button.textContent = cloudUserEmail ? 'Sair' : 'Entrar';
    button.classList.toggle('connected', Boolean(cloudUserEmail));
    button.title = cloudUserEmail ? `Sessão: ${cloudUserEmail}` : 'Entrar na conta';
}
async function pullCloud() {
    if (!cloud || !cloudUserId)
        return;
    const contestsResult = await cloud.from('study_contests').select('*').eq('user_id', cloudUserId);
    if (contestsResult.error)
        throw new Error(contestsResult.error.message);
    for (const raw of (contestsResult.data || [])) {
        const id = String(raw.contest_id || ''), remote = { id, name: String(raw.name || id), examDate: String(raw.exam_date || ''), targetMinutes: numberValue(raw.target_minutes) || DEFAULT_TARGET, targetAccuracy: numberValue(raw.target_accuracy) || 100, specificWeight: numberValue(raw.specific_weight) || 2.5, generalWeight: numberValue(raw.general_weight) || 1, minQuestions: numberValue(raw.min_questions) || MIN_SAMPLE, priority: raw.priority === 'secondary' ? 'secondary' : 'primary', updatedAt: String(raw.updated_at || new Date().toISOString()) }, local = state.contests[id];
        if (!local || new Date(remote.updatedAt).getTime() >= new Date(local.updatedAt).getTime())
            state.contests[id] = remote;
    }
    const cadernosResult = await cloud.from('study_cadernos').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId);
    if (cadernosResult.error)
        throw new Error(cadernosResult.error.message);
    for (const raw of (cadernosResult.data || [])) {
        const remote = cloudCaderno(raw), key = cadernoKey(remote.id, remote.contestId), local = state.cadernos[key];
        if (!local || new Date(remote.updatedAt).getTime() >= new Date(local.updatedAt).getTime())
            state.cadernos[key] = remote;
    }
    const sessionsResult = await cloud.from('study_sessions').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId).eq('session_date', today);
    if (sessionsResult.error)
        throw new Error(sessionsResult.error.message);
    const localPending = currentDay().sessions.filter((session) => !session.uploaded);
    const remoteSessions = (sessionsResult.data || []).map((raw) => ({
        type: String(raw.session_type || 'review'), seconds: numberValue(raw.seconds), endedAt: String(raw.ended_at || new Date().toISOString()), reason: String(raw.source || 'cloud'), uploaded: true
    }));
    state.daily[dayKey()] = { seconds: remoteSessions.reduce((sum, session) => sum + session.seconds, 0) + localPending.reduce((sum, session) => sum + session.seconds, 0), sessions: [...remoteSessions, ...localPending] };
    // O relógio principal é diário, mas o histórico precisa permanecer visível
    // após a virada do dia. O banco devolve apenas agregados do próprio usuário.
    const summaryResult = await cloud.rpc('study_time_summary', { p_contest_id: state.activeContestId, p_today: today });
    if (!summaryResult.error && summaryResult.data) {
        const raw = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
        state.timeSummaries[state.activeContestId] = {
            todaySeconds: numberValue(raw?.today_seconds), yesterdaySeconds: numberValue(raw?.yesterday_seconds),
            weekSeconds: numberValue(raw?.week_seconds), totalSeconds: numberValue(raw?.total_seconds), updatedAt: new Date().toISOString()
        };
    }
    const progressResult = await cloud.from('study_content_progress').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId);
    if (progressResult.error)
        throw new Error(progressResult.error.message);
    for (const raw of (progressResult.data || [])) {
        const code = String(raw.content_code || ''), key = `${state.activeContestId}::${code}`, local = state.contentProgress?.[key], remoteAt = String(raw.updated_at || '');
        if (!local || new Date(remoteAt).getTime() >= new Date(local.updatedAt).getTime())
            state.contentProgress[key] = { player: String(raw.player || ''), code, seconds: numberValue(raw.position_seconds), completed: Boolean(raw.completed), updatedAt: remoteAt || new Date().toISOString() };
    }
    const contentResult = await cloud.from('study_content').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId);
    if (contentResult.error)
        throw new Error(contentResult.error.message);
    if ((contentResult.data || []).length)
        state.content[state.activeContestId] = contentResult.data.sort((a, b) => numberValue(a.position) - numberValue(b.position)).map(cloudContent);
    const eventsResult = await cloud.from('study_events').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId).order('ended_at', { ascending: false }).limit(500);
    if (!eventsResult.error) {
        for (const raw of eventsResult.data || []) {
            const id = String(raw.idempotency_key || raw.id || '');
            if (!id || state.events.some((event) => event.id === id))
                continue;
            state.events.push({ id, contestId: String(raw.contest_id), topicId: raw.topic_id ? String(raw.topic_id) : undefined, type: String(raw.event_type), source: String(raw.source || 'cloud'), seconds: numberValue(raw.seconds), endedAt: String(raw.ended_at), metadata: (raw.metadata || {}), uploaded: true });
        }
    }
    const attemptsResult = await cloud.from('study_question_attempts').select('*').eq('user_id', cloudUserId).eq('contest_id', state.activeContestId).order('attempted_at', { ascending: false }).limit(1000);
    if (!attemptsResult.error) {
        for (const raw of attemptsResult.data || []) {
            const id = String(raw.idempotency_key || raw.id || '');
            if (!id || state.questionAttempts.some((attempt) => attempt.id === id))
                continue;
            state.questionAttempts.push({ id, contestId: String(raw.contest_id), externalQuestionId: String(raw.external_question_id), cadernoId: raw.caderno_id ? String(raw.caderno_id) : undefined, correct: Boolean(raw.correct), attemptedAt: String(raw.attempted_at), durationSeconds: raw.duration_seconds ? numberValue(raw.duration_seconds) : undefined, metadata: (raw.metadata || {}), uploaded: true });
        }
    }
}
async function syncCloud() {
    if (!cloud || !cloudUserId || cloudSyncBusy)
        return;
    cloudSyncBusy = true;
    try {
        const contest = activeContest();
        const contestRows = Object.values(state.contests).map((item) => ({ user_id: cloudUserId, contest_id: item.id, name: item.name, exam_date: item.examDate || null, target_minutes: item.targetMinutes, target_accuracy: item.targetAccuracy, specific_weight: item.specificWeight, general_weight: item.generalWeight, min_questions: item.minQuestions, priority: item.id === state.activeContestId ? 'primary' : 'secondary', updated_at: item.updatedAt }));
        // Rebaixa os secundários antes de promover o concurso ativo; isso respeita a regra de foco único.
        const secondaryRows = contestRows.filter((row) => row.priority === 'secondary');
        if (secondaryRows.length) {
            const secondaryResult = await cloud.from('study_contests').upsert(secondaryRows, { onConflict: 'user_id,contest_id' });
            if (secondaryResult.error && !/column .*priority.* does not exist/i.test(secondaryResult.error.message || ''))
                throw new Error(secondaryResult.error.message);
        }
        const contestRow = contestRows.find((row) => row.contest_id === state.activeContestId);
        let contestResult = await cloud.from('study_contests').upsert(contestRow, { onConflict: 'user_id,contest_id' });
        if (contestResult.error && /(target_accuracy|priority)/i.test(contestResult.error.message || '')) {
            delete contestRow.target_accuracy;
            delete contestRow.priority;
            contestResult = await cloud.from('study_contests').upsert(contestRow, { onConflict: 'user_id,contest_id' });
        }
        if (contestResult.error)
            throw new Error(contestResult.error.message);
        const rows = Object.values(state.cadernos).filter((c) => c.contestId === state.activeContestId).map((c) => ({ user_id: cloudUserId, contest_id: c.contestId, caderno_id: c.id, name: c.name, subject: c.subject, topic: c.topic, attempted: c.attempted, correct: c.correct, incorrect: c.incorrect, repeat_errors: c.repeatErrors, last_attempt_at: c.lastAttemptAt, updated_at: c.updatedAt }));
        const cadernosResult = await cloud.from('study_cadernos').upsert(rows, { onConflict: 'user_id,contest_id,caderno_id' });
        if (cadernosResult.error)
            throw new Error(cadernosResult.error.message);
        const pending = currentDay().sessions.filter((session) => !session.uploaded && session.seconds > 0).map((session) => ({ user_id: cloudUserId, session_date: today, session_type: session.type, seconds: Math.round(session.seconds), ended_at: session.endedAt, source: session.reason || 'dashboard' }));
        if (pending.length) {
            const sessionsResult = await cloud.from('study_sessions').insert(pending.map((session) => ({ ...session, contest_id: state.activeContestId })));
            if (sessionsResult.error)
                throw new Error(sessionsResult.error.message);
            currentDay().sessions.forEach((session) => { if (!session.uploaded)
                session.uploaded = true; });
        }
        const pendingEvents = state.events.filter((event) => !event.uploaded && event.contestId === state.activeContestId).map((event) => ({ user_id: cloudUserId, contest_id: event.contestId, topic_id: event.topicId || null, event_type: event.type, source: event.source, ended_at: event.endedAt, seconds: event.seconds, metadata: event.metadata || {}, idempotency_key: event.id }));
        if (pendingEvents.length) {
            const eventsResult = await cloud.from('study_events').upsert(pendingEvents, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
            if (eventsResult.error && !/relation .*study_events.* does not exist/i.test(eventsResult.error.message || ''))
                throw new Error(eventsResult.error.message);
            if (!eventsResult.error)
                state.events.forEach((event) => { if (event.contestId === state.activeContestId)
                    event.uploaded = true; });
        }
        const pendingAttempts = state.questionAttempts.filter((attempt) => !attempt.uploaded && attempt.contestId === state.activeContestId).map((attempt) => ({ user_id: cloudUserId, contest_id: attempt.contestId, source: String(attempt.metadata?.sourcePlatform || 'connector'), external_question_id: attempt.externalQuestionId, caderno_id: attempt.cadernoId || null, correct: attempt.correct, duration_seconds: attempt.durationSeconds || null, attempted_at: attempt.attemptedAt, metadata: attempt.metadata || {}, idempotency_key: attempt.id }));
        if (pendingAttempts.length) {
            const attemptsResult = await cloud.from('study_question_attempts').upsert(pendingAttempts, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
            if (attemptsResult.error && !/relation .*study_question_attempts.* does not exist/i.test(attemptsResult.error.message || ''))
                throw new Error(attemptsResult.error.message);
            if (!attemptsResult.error)
                state.questionAttempts.forEach((attempt) => { if (attempt.contestId === state.activeContestId)
                    attempt.uploaded = true; });
        }
        const progressRows = Object.entries(state.contentProgress || {}).filter(([key]) => key.startsWith(`${state.activeContestId}::`)).map(([, progress]) => ({ user_id: cloudUserId, contest_id: state.activeContestId, content_code: progress.code, player: progress.player, position_seconds: progress.seconds, completed: progress.completed, updated_at: progress.updatedAt }));
        if (progressRows.length) {
            const progressResult = await cloud.from('study_content_progress').upsert(progressRows, { onConflict: 'user_id,contest_id,content_code' });
            if (progressResult.error)
                throw new Error(progressResult.error.message);
        }
        const contentRows = (state.content?.[state.activeContestId] || []).map((item, index) => ({ user_id: cloudUserId, contest_id: state.activeContestId, content_code: item.code, position: index, area: item.area, layer: item.layer, video_id: item.videoId, start_seconds: item.start, end_seconds: item.end, title: item.title, channel: item.channel, purpose: item.purpose, tec: item.tec || [], updated_at: new Date().toISOString() }));
        if (contentRows.length) {
            const contentResult = await cloud.from('study_content').upsert(contentRows, { onConflict: 'user_id,contest_id,content_code' });
            if (contentResult.error)
                throw new Error(contentResult.error.message);
        }
        await cloud.from('study_sync_runs').insert({ user_id: cloudUserId, contest_id: state.activeContestId, source: 'nexame-dashboard', record_count: rows.length + pendingEvents.length + pendingAttempts.length });
        state.sync = { at: new Date().toISOString(), source: 'Supabase · nuvem' };
        localStorage.setItem(KEY, JSON.stringify(state));
        render();
    }
    catch (error) {
        cloudMessage(`<strong>Sincronização pendente:</strong> ${esc(error instanceof Error ? error.message : error)}`);
    }
    finally {
        cloudSyncBusy = false;
    }
}
async function persistPlanDecision() {
    if (!cloud || !cloudUserId)
        return;
    const result = await cloud.functions.invoke('plan', { body: { contestId: state.activeContestId } });
    if (result.error)
        return;
    const first = result.data?.recommended?.[0];
    if (first)
        cloudMessage(`<strong>Plano auditado.</strong> Próxima prioridade: ${esc(first.name || 'assunto')} — ${esc(first.reason || 'dados recentes')}.`);
}
async function initCloud() {
    if (!cloudConfigured()) {
        window.location.replace(`auth.html?next=${encodeURIComponent(window.location.href)}`);
        return;
    }
    try {
        const cfg = window.__SUPABASE_CONFIG__;
        cloud = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        const session = (await cloud.auth.getSession()).data?.session;
        if (!session) {
            window.location.replace(`auth.html?next=${encodeURIComponent(window.location.href)}`);
            return;
        }
        cloudUserId = session?.user?.id || '';
        cloudUserEmail = session?.user?.email || '';
        cloudIsAnonymous = false;
        if (!cloudUserId || !cloudUserEmail)
            throw new Error('Não foi possível validar sua sessão.');
        await cloud.from('profiles').upsert({ id: cloudUserId, display_name: cloudUserEmail ? cloudUserEmail.split('@')[0] : null }, { onConflict: 'id' });
        await pullCloud();
        state.sync = { at: new Date().toISOString(), source: 'Supabase · conectado' };
        localStorage.setItem(KEY, JSON.stringify(state));
        render();
        renderAccount();
        document.body.classList.remove('auth-pending');
        cloud.auth.onAuthStateChange((_event, nextSession) => {
            if (!nextSession)
                window.location.replace(`auth.html?next=${encodeURIComponent(window.location.href)}`);
        });
        await syncCloud();
        await persistPlanDecision();
    }
    catch (error) {
        cloud = null;
        cloudUserId = '';
        cloudUserEmail = '';
        cloudIsAnonymous = true;
        window.location.replace(`auth.html?next=${encodeURIComponent(window.location.href)}`);
    }
}
function accuracyBands() { const target = activeContest().targetAccuracy || 100; return { critical: Math.max(50, target - 30), recovery: Math.max(60, target - 20), consolidation: Math.max(70, target - 10), target }; }
function diagnosis(c) {
    const raw = c.attempted ? 100 * c.correct / c.attempted : 0;
    const smooth = c.attempted ? 100 * (c.correct + 5) / (c.attempted + 10) : 0;
    const minimum = activeContest().minQuestions || MIN_SAMPLE, eligible = c.attempted >= minimum, bands = accuracyBands();
    // Meta é a direção (100% por padrão), não uma licença para classificar 95%
    // como problema. A faixa forte exige apenas manutenção espaçada.
    const strong = Math.max(bands.consolidation, bands.target - 10);
    let status = 'neutral';
    if (eligible && raw < bands.recovery)
        status = 'bad';
    else if (eligible && raw < bands.target)
        status = 'warn';
    else if (eligible)
        status = 'good';
    const days = c.lastAttemptAt ? Math.max(0, (Date.now() - new Date(c.lastAttemptAt).getTime()) / 86400000) : 14;
    const contest = activeContest(), recency = 1 + Math.min(days / 14, 1), repeat = 1 + Math.min(c.repeatErrors / 5, 1), weight = c.subject === 'specific' ? contest.specificWeight : contest.generalWeight;
    const coverage = c.coverage === 'missing' ? 1.5 : c.coverage === 'partial' ? 1.2 : 1;
    if (eligible && raw >= strong)
        status = 'good';
    const gap = raw >= strong ? 0 : Math.max(0, bands.target - smooth) / 100, maintenance = raw >= strong ? Math.min(days / 60, .08) : 0;
    const confidence = Math.min(.95, Math.max(.15, Math.sqrt(c.attempted) / 10));
    const risk = eligible ? weight * (gap + maintenance) * recency * repeat * coverage * (1.15 - confidence * .15) : 0;
    const action = !eligible ? `Resolver ${Math.max(0, minimum - c.attempted)} questões novas para medir` : raw < bands.critical ? 'Reaprender a teoria + questões graduais' : raw < bands.recovery ? 'Recuperação dirigida + 15 questões novas' : raw < bands.consolidation ? 'Consolidar erros + 12 questões novas' : raw < strong ? `Ajustar os erros até a faixa forte (${strong}%)` : 'Manutenção espaçada para sustentar o domínio';
    return { raw, smooth, confidence, eligible, status, risk, action };
}
function ranked() { return Object.values(state.cadernos).filter((c) => c.contestId === state.activeContestId).map((c) => ({ ...c, d: diagnosis(c) })).sort((a, b) => b.d.risk - a.d.risk || a.name.localeCompare(b.name, 'pt-BR')); }
function daysUntilExam() { const examDate = activeContest().examDate; return examDate ? Math.max(0, Math.ceil((new Date(`${examDate}T23:59:59`).getTime() - Date.now()) / 86400000)) : 0; }
function studyPhase() { const days = daysUntilExam(), examDate = activeContest().examDate; if (!examDate)
    return { key: 'pre-edital', label: 'PRÉ-EDITAL', description: 'Construção de base e cobertura ampla do edital previsto.' }; if (days <= 1)
    return { key: 'vespera', label: 'VÉSPERA', description: 'Revisão curta, erros recorrentes e preservação do descanso.' }; if (days <= 10)
    return { key: 'reta-final', label: 'RETA FINAL', description: 'Consolidar pontos fracos, simulados e revisão espaçada.' }; if (days <= 45)
    return { key: 'consolidacao', label: 'CONSOLIDAÇÃO', description: 'Alternar teoria objetiva, questões FGV e recuperação de erros.' }; return { key: 'base', label: 'FORMAÇÃO DE BASE', description: 'Cobrir o conteúdo essencial antes de intensificar simulados.' }; }
function weightedAccuracy(list) { const measured = list.filter((item) => item.attempted > 0), total = measured.reduce((sum, item) => sum + item.attempted * (item.subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight), 0); return total ? 100 * measured.reduce((sum, item) => sum + item.correct * (item.subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight), 0) / total : 0; }
function readiness(list) { const measured = list.filter((item) => item.attempted > 0), total = measured.reduce((sum, item) => sum + item.attempted * (item.subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight), 0); if (!total)
    return { estimate: 0, confidence: 0 }; return { estimate: measured.reduce((sum, item) => sum + item.d.smooth * item.attempted * (item.subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight), 0) / total, confidence: measured.reduce((sum, item) => sum + item.d.confidence * item.attempted, 0) / measured.reduce((sum, item) => sum + item.attempted, 0) }; }
function renderDecision(list) { const target = $('#decisionText'), phaseBadge = $('#phaseBadge'); if (!target || !phaseBadge)
    return; const phase = studyPhase(), bands = accuracyBands(), studied = currentDay().seconds / 60, remaining = Math.max(0, Math.ceil(state.targetMinutes - studied)), remainingLabel = fmtMinutes(remaining), accuracy = weightedAccuracy(list), forecast = readiness(list), recovery = list.filter((item) => item.d.eligible && item.d.raw < bands.recovery).length; phaseBadge.textContent = phase.label; phaseBadge.className = `badge ${phase.key === 'vespera' || phase.key === 'reta-final' ? 'warn' : phase.key === 'pre-edital' ? 'neutral' : 'good'}`; let title = '', action = ''; if (!list.length) {
    title = 'Aguardando a primeira leitura automática das plataformas';
    action = 'Enquanto isso, o sistema mantém a trilha de conteúdo disponível e registra seu tempo nos players.';
}
else if (!remaining) {
    title = 'Meta líquida de hoje concluída';
    action = phase.key === 'vespera' ? 'Encerrar ou fazer apenas uma revisão leve.' : 'Se continuar, use revisão espaçada dos erros — não aumente a carga automaticamente.';
}
else if (recovery) {
    title = `${recovery} assunto(s) abaixo da faixa de recuperação (${bands.recovery}%)`;
    action = `Dedique os próximos ${remainingLabel} a teoria objetiva + questões novas dos maiores riscos.`;
}
else if (!accuracy) {
    title = 'Ainda sem amostra suficiente de desempenho';
    action = `Use ${remainingLabel} para cobrir a base e resolver questões novas para calibrar o plano.`;
}
else if (forecast.estimate >= bands.target && forecast.confidence >= .7) {
    title = `Objetivo de ${bands.target}% sustentado pela amostra`;
    action = `O sistema reduz a carga para manutenção espaçada e protege o resultado até a prova.`;
}
else if (phase.key === 'reta-final' || phase.key === 'vespera') {
    title = `Consolidar rumo à meta de ${bands.target}% (${forecast.estimate.toFixed(1)}% estimado)`;
    action = `Priorize erros, revisão e simulado; evite abrir assuntos de baixo retorno nos ${remainingLabel} restantes.`;
}
else {
    title = `Avançar rumo à meta de ${bands.target}% (${forecast.estimate.toFixed(1)}% estimado)`;
    action = `${phase.description} Restam ${remainingLabel} da disponibilidade de hoje.`;
} target.innerHTML = `<span class="badge ${recovery ? 'bad' : 'good'}">${recovery ? 'RECUPERAÇÃO' : 'PRÓXIMA AÇÃO'}</span><div><strong>${esc(title)}</strong><div>${esc(action)}</div><div class="muted">Confiança da estimativa: ${Math.round(forecast.confidence * 100)}% · ${phase.description} · ${daysUntilExam() ? `${daysUntilExam()} dias até a prova` : 'data da prova ainda não definida'}.</div></div>`; }
function errorSignals() {
    const groups = new Map();
    for (const attempt of state.questionAttempts || []) {
        if (attempt.contestId !== state.activeContestId || attempt.correct)
            continue;
        const topic = String(attempt.metadata?.topic || 'Assunto não identificado').replace(/\s+/g, ' ').trim();
        const key = topic.toLocaleLowerCase('pt-BR');
        const group = groups.get(key) || { topic, attempts: 0, errors: 0 };
        group.attempts++;
        group.errors++;
        groups.set(key, group);
    }
    const general = /portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade/.test.bind(/portugu|ingl[eê]s|matem|racioc|rlm|legisla|atualidade/);
    return [...groups.values()].map((group) => {
        const tokens = group.topic.toLocaleLowerCase('pt-BR').split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 3);
        const content = roadmapItems.map((item) => ({ item, hits: tokens.filter((token) => `${item.area} ${item.title} ${item.tec}`.toLocaleLowerCase('pt-BR').includes(token)).length })).sort((a, b) => b.hits - a.hits)[0];
        const mapped = Boolean(content?.hits);
        const subject = general(group.topic.toLocaleLowerCase('pt-BR')) ? 'general' : 'specific';
        return { ...group, subject, content: mapped ? content.item : undefined, coverage: (mapped ? 'mapped' : 'unmapped'), risk: group.errors * (mapped ? 1 : 1.7) * (subject === 'specific' ? activeContest().specificWeight : activeContest().generalWeight) };
    }).sort((a, b) => b.risk - a.risk);
}
function dailyPlan(list = ranked()) {
    const available = Math.max(0, state.targetMinutes - Math.floor(currentDay().seconds / 60)), accuracy = weightedAccuracy(list), total = list.length && accuracy >= accuracyBands().target ? Math.min(available, 60) : available, specific = list.filter((item) => item.subject === 'specific'), general = list.filter((item) => item.subject === 'general');
    if (total < 5)
        return [];
    const specificRisk = specific.reduce((sum, item) => sum + item.d.risk, 0), generalRisk = general.reduce((sum, item) => sum + item.d.risk, 0);
    const imbalance = specificRisk + generalRisk ? (specificRisk - generalRisk) / (specificRisk + generalRisk) : 0;
    const contest = activeContest(), weightRatio = contest.specificWeight / (contest.specificWeight + contest.generalWeight), specificShare = Math.max(.45, Math.min(.85, weightRatio + imbalance * .12));
    const minutesBySubject = { specific: Math.round(total * specificShare), general: total - Math.round(total * specificShare) };
    const blocks = [];
    const forced = errorSignals().slice(0, 2);
    for (const signal of forced) {
        const minutes = Math.min(25, Math.max(0, minutesBySubject[signal.subject]));
        if (!minutes)
            continue;
        minutesBySubject[signal.subject] -= minutes;
        blocks.push({ subject: signal.subject, topic: signal.topic, minutes, mode: 'correction', risk: signal.risk, action: signal.coverage === 'mapped' ? `Erro detectado: reveja ${signal.content.code} — ${signal.content.title}; depois faça questões novas.` : 'Erro sem conteúdo mapeado: o Nexame sinalizou lacuna para complemento e revisão dirigida.' });
    }
    ['specific', 'general'].forEach((subject) => {
        const pool = list.filter((item) => item.subject === subject).slice(0, 4), fallback = subject === 'specific' ? 'Específicas — cobertura e recuperação' : 'Gerais — revisão e questões';
        if (!minutesBySubject[subject])
            return;
        if (!pool.length) {
            blocks.push({ subject, topic: fallback, minutes: minutesBySubject[subject], mode: 'review', action: 'Adicionar resultados de uma plataforma de questões para calibrar', risk: 0 });
            return;
        }
        const totalRisk = pool.reduce((sum, item) => sum + Math.max(item.d.risk, .15), 0);
        pool.forEach((item) => { const minutes = Math.max(25, Math.round(minutesBySubject[subject] * Math.max(item.d.risk, .15) / totalRisk)), recovery = item.d.eligible && item.d.raw < accuracyBands().recovery; blocks.push({ subject, topic: item.name, minutes, mode: recovery ? 'correction' : item.attempted < activeContest().minQuestions ? 'tec' : 'video', action: item.d.action, risk: item.d.risk }); });
    });
    return blocks.sort((a, b) => b.risk - a.risk);
}
function renderHud(list = ranked()) {
    const seconds = currentDay().seconds + pendingSessionSeconds, recovery = list.filter((x) => x.d.eligible && x.d.raw < accuracyBands().recovery), next = list[0];
    $('#hudTime').textContent = fmtSeconds(seconds);
    $('#hudTarget').textContent = `${activeContest().targetAccuracy}% · ${fmtMinutes(state.targetMinutes)}`;
    $('#hudRecovery').textContent = String(recovery.length);
    $('#hudRecovery').style.color = recovery.length ? '#fb7185' : '#34d399';
    $('#hudNext').textContent = next ? next.name : 'Aguardando dados';
    $('#hudNext').title = next ? next.d.action : 'Aguardando sincronização das plataformas';
    $('#hudSync').textContent = state.sync ? fmtDate(state.sync.at) : 'local';
}
function renderTimer() { const seconds = currentDay().seconds + pendingSessionSeconds; $('#clock').textContent = fmtSeconds(seconds); $('#timerStatus').textContent = timerRunning ? (focused() ? 'Estudando' : 'Pausado: página fora de foco') : 'Aguardando atividade'; $('#timerToggle').textContent = timerRunning ? 'Pausar sessão' : 'Iniciar sessão'; $('#hudTimerToggle').textContent = timerRunning ? 'Pausar' : 'Iniciar'; $('#hudSessionType').value = $('#sessionType').value; renderHud(); }
function renderTable(list) { const bands = accuracyBands(), strong = Math.max(bands.consolidation, bands.target - 10); $('#cadernosEmpty').style.display = list.length ? 'none' : 'block'; $('#cadernosBody').innerHTML = list.map((x) => { const d = x.d, pct = x.attempted ? d.raw : 0; return `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.topic)}</small></td><td>${x.subject === 'specific' ? 'Específicas' : 'Gerais'}</td><td><div>${pct.toFixed(1)}%</div><div class="bar"><span class="${d.status}" style="width:${Math.min(100, pct)}%"></span></div></td><td>${x.correct}/${x.attempted}<small>${x.repeatErrors || 0} erros repetidos</small></td><td><span class="badge ${d.status}">${d.eligible ? (d.raw < bands.recovery ? 'RECUPERAÇÃO' : d.raw < bands.consolidation ? 'CONSOLIDAÇÃO' : d.raw < strong ? 'EM EVOLUÇÃO' : 'DOMÍNIO FORTE') : 'AMOSTRA PEQUENA'}</span></td><td>${esc(d.action)}</td></tr>`; }).join(''); }
function renderDailyPlan(list) {
    const target = $('#dailyPlan'), blocks = dailyPlan(list);
    if (!target)
        return;
    const specificMinutes = blocks.filter((block) => block.subject === 'specific').reduce((sum, block) => sum + block.minutes, 0);
    const generalMinutes = blocks.filter((block) => block.subject === 'general').reduce((sum, block) => sum + block.minutes, 0);
    const contest = activeContest();
    target.innerHTML = `<div class="plan-summary"><span><b>${daysUntilExam()}</b> dias até a prova</span><span>Específicas <b>${specificMinutes} min</b></span><span>Gerais <b>${generalMinutes} min</b></span></div><div class="plan-list">${blocks.map((block, index) => `<button class="plan-row" data-plan-index="${index}" data-session-type="${block.mode}" title="Selecionar ${esc(block.topic)}"><span class="plan-number">${index + 1}</span><span class="plan-main"><strong>${esc(block.topic)}</strong><small>${block.subject === 'specific' ? `Específicas · peso ${contest.specificWeight}` : `Gerais · peso ${contest.generalWeight}`} · ${esc(block.action)}</small></span><span class="plan-time">${block.minutes} min</span></button>`).join('')}</div>`;
    target.querySelectorAll('.plan-row').forEach((button) => button.addEventListener('click', () => { const type = button.dataset.sessionType || 'review'; $('#sessionType').value = type; $('#hudSessionType').value = type; $('#timerStatus').textContent = `Bloco selecionado: ${button.querySelector('strong')?.textContent || ''}`; $('#timerToggle').focus(); }));
}
function renderRoadmap() {
    const target = $('#roadmapList'), badge = $('#roadmapBadge');
    if (!target || !badge)
        return;
    const items = roadmapItems.length ? roadmapItems : Object.values(state.content?.[state.activeContestId] || []).map((item) => ({ code: item.code, area: item.area, layer: item.layer, title: item.title, videoId: item.videoId, tec: (item.tec || []).map((entry) => String(entry.name || '')).filter(Boolean).join(' · ') }));
    if (!items.length) {
        badge.textContent = 'aguardando player';
        target.innerHTML = '<div class="empty">A trilha será carregada automaticamente ao abrir um dos players.</div>';
        return;
    }
    const diagnoses = ranked();
    const related = (item) => { const haystack = `${item.title} ${item.tec}`.toLowerCase(); return diagnoses.filter((entry) => haystack.includes(entry.name.toLowerCase()) || (entry.topic && haystack.includes(entry.topic.toLowerCase()))); };
    const priority = (item) => { const matches = related(item); return matches.length ? Math.max(...matches.map((entry) => entry.d.risk)) : 0; };
    const measured = items.filter((item) => related(item).length).length;
    badge.textContent = `${items.length} segmentos · ${measured} calibrados`;
    const groups = [...new Set(items.map((item) => item.area || 'Outros'))];
    const bands = accuracyBands();
    target.innerHTML = groups.map((area) => { const group = items.filter((item) => item.area === area).sort((a, b) => priority(b) - priority(a)); return `<details class="roadmap-group"><summary><strong>${esc(area)}</strong><span>${group.length} segmentos</span></summary><div class="roadmap-items">${group.map((item) => { const matches = related(item), best = matches.sort((a, b) => b.d.risk - a.d.risk)[0], status = !best ? '<span class="badge neutral">SEM MEDIÇÃO</span>' : !best.d.eligible ? '<span class="badge warn">MEDIR</span>' : best.d.raw < bands.recovery ? '<span class="badge bad">RECUPERAR</span>' : best.d.raw < bands.target ? '<span class="badge warn">CONSOLIDAR</span>' : '<span class="badge good">META ATINGIDA</span>'; return `<div class="roadmap-item"><div><span class="tag">${esc(item.code)} · ${esc(item.layer)}</span>${status}</div><strong>${esc(item.title)}</strong><small>${esc(item.tec || 'Conteúdo teórico integrado')}</small></div>`; }).join('')}</div></details>`; }).join('');
}
async function loadRoadmap() {
    try {
        const response = await fetch('MAPA_VIDEO_TEC.csv', { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const rows = parseCSV(await response.text());
        roadmapItems = rows.map((row) => ({ code: String(row.codigo || ''), area: String(row.area || ''), layer: String(row.camada || ''), title: String(row.titulo || ''), videoId: String(row.video || ''), tec: String(row.cadernos_tec || '') })).filter((item) => item.code && item.title);
        renderRoadmap();
    }
    catch {
        renderRoadmap();
    }
}
function renderContestControls() {
    const select = $('#contestSelect'), contest = activeContest();
    if (!select)
        return;
    select.innerHTML = Object.values(state.contests).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    select.value = state.activeContestId;
    $('#todayLabel').title = `${contest.name} · prova: ${contest.examDate || 'data não definida'}`;
}
function activateContest(id) {
    if (!state.contests[id] || id === state.activeContestId)
        return;
    if (timerRunning)
        pauseTimer('contest-switch');
    Object.values(state.contests).forEach((contest) => { contest.priority = contest.id === id ? 'primary' : 'secondary'; contest.updatedAt = new Date().toISOString(); });
    state.activeContestId = id;
    state.targetMinutes = activeContest().targetMinutes;
    currentDay();
    state.sync = null;
    saveState();
    render();
    if (cloud)
        void pullCloud().then(() => { render(); return syncCloud(); });
}
function createContestFromForm(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), name = String(form.get('name') || '').trim();
    if (!name)
        return;
    const id = contestIdFromName(name), contest = { id, name, examDate: String(form.get('examDate') || ''), targetMinutes: Math.max(30, Math.min(960, Number(form.get('targetMinutes')) || DEFAULT_TARGET)), targetAccuracy: Math.max(50, Math.min(100, Number(form.get('targetAccuracy')) || 100)), specificWeight: Math.max(.1, Number(form.get('specificWeight')) || 2.5), generalWeight: Math.max(.1, Number(form.get('generalWeight')) || 1), minQuestions: Math.max(1, Math.min(100, Number(form.get('minQuestions')) || MIN_SAMPLE)), priority: 'primary', updatedAt: new Date().toISOString() };
    Object.values(state.contests).forEach((item) => { item.priority = 'secondary'; item.updatedAt = new Date().toISOString(); });
    state.contests[id] = contest;
    state.activeContestId = id;
    state.targetMinutes = contest.targetMinutes;
    currentDay();
    saveState();
    event.currentTarget.reset();
    $('#contestFormWrap').hidden = true;
    render();
    if (cloud)
        void syncCloud();
}
function render() {
    const contest = activeContest(), bands = accuracyBands(), list = ranked();
    const evaluated = list.filter((item) => item.d.eligible), recovery = evaluated.filter((item) => item.d.raw < bands.recovery), seconds = currentDay().seconds;
    $('#todayLabel').textContent = `${new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · ${contest.name}`;
    renderContestControls();
    $('#targetMinutes').value = String(state.targetMinutes);
    $('#goalAccuracy').value = String(contest.targetAccuracy);
    $('#metricTime').textContent = fmtSeconds(seconds);
    const history = state.timeSummaries?.[state.activeContestId];
    $('#metricTimeSub').textContent = `${Math.min(100, Math.round(100 * seconds / (state.targetMinutes * 60)))}% da meta de ${fmtMinutes(state.targetMinutes)}`;
    $('#timerHistory').textContent = history ? `Ontem ${fmtSeconds(history.yesterdaySeconds)} · Semana ${fmtSeconds(history.weekSeconds)} · Total neste concurso ${fmtSeconds(history.totalSeconds)}` : 'Histórico será exibido após a primeira sincronização com a nuvem.';
    $('#dayProgress').style.width = `${Math.min(100, 100 * seconds / (state.targetMinutes * 60))}%`;
    $('#metricCadernos').textContent = String(evaluated.length);
    $('#metricCadernosSub').textContent = `${list.length} cadastrados · mínimo de ${contest.minQuestions} questões`;
    $('#metricRecovery').textContent = String(recovery.length);
    $('#metricRecoverySub').textContent = `abaixo de ${bands.recovery}% · objetivo ${bands.target}%`;
    const sync = state.sync?.at;
    $('#metricSync').textContent = sync ? fmtDate(sync) : 'Nunca';
    $('#metricSyncSub').textContent = state.sync?.source || 'dados locais';
    $('#syncDate').textContent = sync ? fmtDate(sync) : 'nunca';
    $('#syncBadge').textContent = state.sync ? 'ATUALIZADO' : 'LOCAL';
    $('#syncBadge').className = `badge ${state.sync ? 'good' : 'neutral'}`;
    renderDecision(list);
    renderDailyPlan(list);
    renderRoadmap();
    renderTable(list);
    renderHud(list);
    renderTimer();
    renderAccount();
}
function focused() { return document.visibilityState === 'visible' && (document.hasFocus() || document.activeElement?.tagName === 'IFRAME'); }
function checkpointTimer(reason = 'checkpoint', force = false) {
    if (!force && pendingSessionSeconds < 30)
        return;
    if (pendingSessionSeconds < 1)
        return;
    const seconds = Math.round(pendingSessionSeconds), type = $('#sessionType').value;
    currentDay().seconds += seconds;
    currentDay().sessions.push({ type, seconds, endedAt: new Date().toISOString(), reason });
    recordEvent(eventTypeForSession(type), reason === 'player' ? 'youtube-embed' : 'nexame', seconds, { reason });
    pendingSessionSeconds = 0;
    // localStorage é síncrono: mesmo que a aba seja recarregada antes do envio
    // à nuvem, pullCloud preserva esta sessão pendente e a envia na próxima carga.
    saveState();
}
function timerLoop() {
    if (!timerRunning)
        return;
    const now = performance.now();
    if (focused() && timerLast)
        pendingSessionSeconds += Math.max(0, Math.min(5, (now - timerLast) / 1000));
    timerLast = now;
    checkpointTimer('checkpoint');
    renderTimer();
}
function startTimer(source = 'manual') { if (source === 'manual')
    manualPause = false; if (timerRunning)
    return; if (playerPauseTick)
    window.clearTimeout(playerPauseTick); playerPauseTick = null; timerRunning = true; timerLast = performance.now(); timerTick = window.setInterval(timerLoop, 1000); renderTimer(); }
function pauseTimer(reason = 'manual') { if (reason === 'manual' || reason === 'hud')
    manualPause = true; if (!timerRunning)
    return; timerLoop(); timerRunning = false; if (timerTick)
    window.clearInterval(timerTick); timerTick = null; checkpointTimer(reason, true); render(); }
function parseCSV(text) { const rows = []; let row = [], cell = '', quoted = false; for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
        cell += '"';
        i++;
        continue;
    }
    if (ch === '"') {
        quoted = !quoted;
        continue;
    }
    if (ch === ',' && !quoted) {
        row.push(cell.trim());
        cell = '';
        continue;
    }
    if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && next === '\n')
            i++;
        row.push(cell.trim());
        cell = '';
        if (row.some(Boolean))
            rows.push(row);
        row = [];
        continue;
    }
    cell += ch;
} if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
} if (!rows.length)
    return []; const headers = rows.shift().map((x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')); return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || '']))); }
function importRecords(input, source) { const records = Array.isArray(input) ? input : input?.cadernos || input?.data || input?.items || []; if (!records.length)
    throw new Error('Não encontrei uma lista de cadernos no arquivo.'); records.forEach((raw, i) => { const c = normalize(raw, i), key = cadernoKey(c.id, c.contestId), old = state.cadernos[key]; state.cadernos[key] = old ? { ...old, ...c } : c; }); state.sync = { at: new Date().toISOString(), source: `${source} · ${records.length} cadernos · ${contestLabel(state.activeContestId)}` }; saveState(); render(); $('#syncMessage').innerHTML = `<strong>Importação concluída.</strong> ${records.length} registros processados para ${esc(contestLabel(state.activeContestId))}. O plano foi recalculado.`; }
function readFile(file) { const reader = new FileReader(); reader.onload = () => { try {
    const text = String(reader.result), input = file.name.toLowerCase().endsWith('.csv') ? parseCSV(text) : JSON.parse(text);
    importRecords(input, file.name);
}
catch (error) {
    $('#syncMessage').innerHTML = `<strong>Falha na importação:</strong> ${esc(error instanceof Error ? error.message : error)}`;
} }; reader.readAsText(file); }
function exportData() { const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `estudos-${today}.json`; link.click(); URL.revokeObjectURL(link.href); }
function mountPlayer(view) { const wrap = $(`#${view} .iframe-wrap`); if (!wrap || wrap.querySelector('iframe'))
    return; const frame = document.createElement('iframe'); frame.src = wrap.dataset.playerSrc || ''; frame.title = wrap.dataset.playerTitle || ''; frame.loading = 'eager'; frame.addEventListener('load', () => { try {
    const code = frame.contentDocument?.querySelector('#position')?.textContent?.match(/·\s*([EG]\d+)/)?.[1];
    window.NexamePdfLibrary?.attach(frame.contentDocument, code);
}
catch (_) { /* iframe remains usable if augmentation fails */ } }); wrap.appendChild(frame); }
function openView(view) {
    const target = document.querySelector(`#${view}`);
    const tab = document.querySelector(`[data-view="${view}"]`);
    if (!target || !tab)
        return;
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.view').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    target.classList.add('active');
    if (view === 'specific' || view === 'general')
        mountPlayer(view);
    history.replaceState(null, '', `#${view}`);
}
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => openView(button.dataset.view || 'dashboard')));
$('#targetMinutes').addEventListener('change', (event) => { state.targetMinutes = Math.max(30, Math.min(960, Number(event.target.value) || DEFAULT_TARGET)); activeContest().targetMinutes = state.targetMinutes; activeContest().updatedAt = new Date().toISOString(); saveState(); render(); void persistPlanDecision(); });
$('#goalAccuracy').addEventListener('change', (event) => { activeContest().targetAccuracy = Math.max(50, Math.min(100, Number(event.target.value) || 100)); activeContest().updatedAt = new Date().toISOString(); saveState(); render(); void persistPlanDecision(); });
$('#contestSelect').addEventListener('change', (event) => activateContest(event.target.value));
$('#newContest').addEventListener('click', () => { $('#contestFormWrap').hidden = false; $('#contestForm input[name="name"]').focus(); });
$('#cancelContest').addEventListener('click', () => { $('#contestFormWrap').hidden = true; });
$('#contestForm').addEventListener('submit', createContestFromForm);
document.querySelector('#accountButton')?.addEventListener('click', async () => {
    if (!cloud) {
        window.location.replace(`auth.html?next=${encodeURIComponent(window.location.href)}`);
        return;
    }
    await cloud.auth.signOut();
    window.location.replace('auth.html');
});
$('#export').addEventListener('click', exportData);
$('#timerToggle').addEventListener('click', () => timerRunning ? pauseTimer('manual') : startTimer('manual'));
$('#hudTimerToggle').addEventListener('click', () => timerRunning ? pauseTimer('hud') : startTimer('manual'));
$('#hudSessionType').addEventListener('change', (event) => { $('#sessionType').value = event.target.value; });
$('#timerReset').addEventListener('click', () => { if (timerRunning)
    pauseTimer('reset'); state.daily[dayKey()] = { seconds: 0, sessions: [] }; saveState(); render(); });
['visibilitychange', 'blur'].forEach((eventName) => document.addEventListener(eventName, () => { if (timerRunning) {
    timerLoop();
    renderTimer();
} }));
window.addEventListener('focus', () => { if (timerRunning)
    timerLast = performance.now(); renderTimer(); });
window.addEventListener('beforeunload', () => { if (timerRunning)
    pauseTimer('unload'); });
$('#clearCadernos').addEventListener('click', () => { if (confirm('Remover os cadernos e resultados deste concurso neste navegador?')) {
    Object.keys(state.cadernos).filter((key) => key.startsWith(`${state.activeContestId}::`)).forEach((key) => delete state.cadernos[key]);
    state.sync = null;
    saveState();
    render();
} });
$('#cadernoForm').addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget), c = normalize({ id: `manual-${String(form.get('name')).toLowerCase().replace(/\W+/g, '-')}`, name: form.get('name'), subject: form.get('subject'), attempted: form.get('attempted'), correct: form.get('correct'), repeatErrors: form.get('repeatErrors'), lastAttemptAt: form.get('lastAttemptAt') }); state.cadernos[cadernoKey(c.id)] = c; state.sync = { at: new Date().toISOString(), source: `cadastro manual · ${contestLabel(state.activeContestId)}` }; saveState(); event.currentTarget.reset(); render(); });
window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin)
        return;
    if (event.data?.type === 'nexame-platform-snapshot' && event.data.snapshot) {
        const payload = event.data.snapshot;
        if (payload.generatedAt && payload.generatedAt === lastExtensionSnapshotAt)
            return;
        lastExtensionSnapshotAt = payload.generatedAt || new Date().toISOString();
        for (const [key, totalValue] of Object.entries(payload.studyTotals || {})) {
            const total = Math.max(0, Math.min(86400, Number(totalValue) || 0)), prior = state.platformStudyTotals[key] || 0, delta = Math.max(0, total - prior);
            state.platformStudyTotals[key] = Math.max(prior, total);
            if (!delta || !key.endsWith(`:${today}`))
                continue;
            currentDay().seconds += delta;
            currentDay().sessions.push({ type: 'tec', seconds: delta, endedAt: payload.generatedAt || new Date().toISOString(), reason: 'plataforma de questões' });
            recordEvent('question_session', 'nexame-connector', delta, { platformTotalKey: key });
        }
        if (Array.isArray(payload.cadernos) && payload.cadernos.length)
            importRecords(payload, 'extensão Nexame · plataforma de questões');
        for (const attempt of payload.questionAttempts || []) {
            if (!attempt.id || typeof attempt.correct !== 'boolean')
                continue;
            recordQuestionAttempt({ externalQuestionId: String(attempt.id), cadernoId: attempt.cadernoId, correct: attempt.correct, attemptedAt: attempt.attemptedAt || payload.generatedAt || new Date().toISOString(), durationSeconds: attempt.durationSeconds, metadata: { topic: attempt.topic || '' } });
        }
        saveState();
        render();
        return;
    }
    if (event.data?.type === 'dataprev-study-state') {
        const frame = [...document.querySelectorAll('iframe')].find((item) => item.contentWindow === event.source);
        window.NexamePdfLibrary?.attach(frame?.contentDocument, event.data.code);
        if (event.data.playing) {
            if (frame?.closest('#specific') || frame?.closest('#general')) {
                $('#sessionType').value = 'video';
                $('#hudSessionType').value = 'video';
            }
            if (playerPauseTick)
                window.clearTimeout(playerPauseTick);
            playerPauseTick = null;
            if (!timerRunning && !manualPause)
                startTimer('player');
        }
        else if (timerRunning && !playerPauseTick) {
            playerPauseTick = window.setTimeout(() => { playerPauseTick = null; if (timerRunning)
                pauseTimer('player'); }, 1500);
        }
        return;
    }
    if (event.data?.type === 'dataprev-content-catalog' && Array.isArray(event.data.catalog)) {
        state.content[state.activeContestId] = event.data.catalog;
        saveState();
        return;
    }
    if (event.data?.type === 'dataprev-content-progress' && event.data.code) {
        const key = `${state.activeContestId}::${event.data.code}`;
        state.contentProgress[key] = { player: event.data.player || 'player', code: event.data.code, seconds: Math.max(0, Number(event.data.seconds) || 0), completed: Boolean(event.data.completed), updatedAt: new Date().toISOString() };
        saveState();
    }
});
const requestedView = location.hash.slice(1);
if (['specific', 'general', 'settings'].includes(requestedView))
    openView(requestedView);
render();
void initCloud();
void loadRoadmap();
