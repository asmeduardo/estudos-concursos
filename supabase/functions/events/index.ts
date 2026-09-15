import { authenticate, preflight, response } from '../_shared/auth.ts';

type InputEvent = { idempotencyKey?: string; contestId?: string; topicId?: string; type?: string; source?: string; seconds?: number; endedAt?: string; metadata?: Record<string, unknown> };
type InputAttempt = { idempotencyKey?: string; contestId?: string; topicId?: string; source?: string; externalQuestionId?: string; cadernoId?: string; correct?: boolean; durationSeconds?: number; attemptedAt?: string; metadata?: Record<string, unknown> };

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const auth = await authenticate(req); if ('error' in auth) return auth.error;
  let body: { events?: InputEvent[]; attempts?: InputAttempt[] };
  try { body = await req.json(); } catch { return response({ error: 'invalid_json' }, 400); }
  const allowed = new Set(['video_session', 'question_session', 'review_session', 'simulation', 'focus_pause', 'content_progress']);
  const events = (body.events || []).map((event) => ({
    user_id: auth.userId, contest_id: String(event.contestId || '').trim(), topic_id: event.topicId || null,
    event_type: String(event.type || ''), source: String(event.source || 'nexame'), seconds: Math.max(0, Math.min(86400, Math.floor(Number(event.seconds || 0)))),
    ended_at: event.endedAt || new Date().toISOString(), metadata: event.metadata || {}, idempotency_key: String(event.idempotencyKey || '').trim()
  })).filter((event) => event.contest_id && event.idempotency_key && allowed.has(event.event_type));
  const attempts = (body.attempts || []).map((attempt) => ({
    user_id: auth.userId, contest_id: String(attempt.contestId || '').trim(), topic_id: attempt.topicId || null,
    source: String(attempt.source || 'external'), external_question_id: String(attempt.externalQuestionId || '').trim(), caderno_id: attempt.cadernoId || null,
    correct: Boolean(attempt.correct), duration_seconds: attempt.durationSeconds ? Math.max(0, Math.min(7200, Math.floor(Number(attempt.durationSeconds)))) : null,
    attempted_at: attempt.attemptedAt || new Date().toISOString(), metadata: attempt.metadata || {}, idempotency_key: String(attempt.idempotencyKey || '').trim()
  })).filter((attempt) => attempt.contest_id && attempt.external_question_id && attempt.idempotency_key);
  if (!events.length && !attempts.length) return response({ error: 'no_valid_events' }, 400);
  if (events.length) { const { error } = await auth.admin.from('study_events').upsert(events, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }); if (error) return response({ error: 'event_write_failed' }, 500); }
  if (attempts.length) { const { error } = await auth.admin.from('study_question_attempts').upsert(attempts, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }); if (error) return response({ error: 'attempt_write_failed' }, 500); }
  return response({ ok: true, events: events.length, attempts: attempts.length }, 201);
});
