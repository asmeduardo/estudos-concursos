import { authenticate, preflight, response } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const auth = await authenticate(req); if ('error' in auth) return auth.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ error: 'invalid_json' }, 400); }
  const contestId = String(body.contestId || '').trim(), seconds = Math.floor(Number(body.seconds || 0));
  if (!contestId || seconds < 1 || seconds > 86400) return response({ error: 'invalid_session' }, 400);
  const { data, error } = await auth.admin.from('study_sessions').insert({ user_id: auth.userId, contest_id: contestId, session_date: body.sessionDate || new Date().toISOString().slice(0, 10), session_type: String(body.sessionType || 'study'), seconds, ended_at: body.endedAt || new Date().toISOString(), source: String(body.source || 'dashboard') }).select('id').single();
  if (error) return response({ error: 'session_insert_failed' }, 500);
  return response({ ok: true, id: data.id }, 201);
});
