import { authenticate, preflight, response } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const auth = await authenticate(req); if ('error' in auth) return auth.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ error: 'invalid_json' }, 400); }
  const contestId = String(body.contestId || '').trim(), rows = Array.isArray(body.cadernos) ? body.cadernos as Record<string, unknown>[] : [];
  const attempts = Array.isArray(body.questionAttempts) ? body.questionAttempts as Record<string, unknown>[] : [];
  if (!contestId || (!rows.length && !attempts.length)) return response({ error: 'contest_id_and_study_data_required' }, 400);
  const upserts = rows.map((c) => ({ user_id: auth.userId, contest_id: contestId, caderno_id: String(c.id || c.cadernoId || ''), name: String(c.name || c.nome || 'Caderno'), subject: c.subject === 'general' ? 'general' : 'specific', topic: String(c.topic || c.assunto || ''), attempted: Math.max(0, Number(c.attempted || c.respondidas || 0)), correct: Math.max(0, Number(c.correct || c.acertos || 0)), incorrect: Math.max(0, Number(c.incorrect || c.erros || 0)), repeat_errors: Math.max(0, Number(c.repeatErrors || c.errosRepetidos || 0)), last_attempt_at: c.lastAttemptAt || c.ultimoEstudo || null, updated_at: new Date().toISOString() })).filter((c) => c.caderno_id);
  if (upserts.length) {
    const { error } = await auth.admin.from('study_cadernos').upsert(upserts, { onConflict: 'user_id,contest_id,caderno_id' });
    if (error) return response({ error: 'cadernos_upsert_failed' }, 500);
  }
  const questionRows = attempts.map((attempt) => {
    const externalId = String(attempt.id || attempt.questionId || '').trim();
    const attemptedAt = String(attempt.attemptedAt || new Date().toISOString());
    return { user_id: auth.userId, contest_id: contestId, source: 'tec', external_question_id: externalId, caderno_id: attempt.cadernoId ? String(attempt.cadernoId) : null, correct: Boolean(attempt.correct), duration_seconds: Number(attempt.durationSeconds || 0) || null, attempted_at: attemptedAt, metadata: { topic: String(attempt.topic || '') }, idempotency_key: `tec-${externalId}-${attemptedAt}-${Boolean(attempt.correct)}` };
  }).filter((attempt) => attempt.external_question_id);
  if (questionRows.length) {
    const { error } = await auth.admin.from('study_question_attempts').upsert(questionRows, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
    if (error) return response({ error: 'attempts_upsert_failed' }, 500);
  }
  await auth.admin.from('study_sync_runs').insert({ user_id: auth.userId, contest_id: contestId, source: String(body.source || 'tec'), record_count: upserts.length + questionRows.length });
  return response({ ok: true, imported: upserts.length, attempts: questionRows.length, syncedAt: new Date().toISOString() });
});
