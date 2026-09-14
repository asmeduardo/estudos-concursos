import { createClient } from '@supabase/supabase-js';

type Caderno = {
  id: string; name: string; subject: 'specific' | 'general'; topic?: string;
  contestId?: string;
  attempted?: number; correct?: number; incorrect?: number; repeatErrors?: number;
  lastAttemptAt?: string | null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_bearer_token' });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'supabase_not_configured' });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = auth.slice('Bearer '.length);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'invalid_token' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const contestId = String(body.contestId || '').trim();
  if (!contestId) return res.status(400).json({ error: 'contest_id_required' });
  const rows: Caderno[] = Array.isArray(body.cadernos) ? body.cadernos : [];
  if (!rows.length) return res.status(400).json({ error: 'cadernos_required' });
  const upserts = rows.map((c) => ({ user_id: userData.user.id, contest_id: contestId, caderno_id: String(c.id), name: String(c.name || 'Caderno'), subject: c.subject === 'general' ? 'general' : 'specific', topic: String(c.topic || ''), attempted: Math.max(0, Number(c.attempted || 0)), correct: Math.max(0, Number(c.correct || 0)), incorrect: Math.max(0, Number(c.incorrect || 0)), repeat_errors: Math.max(0, Number(c.repeatErrors || 0)), last_attempt_at: c.lastAttemptAt || null, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('study_cadernos').upsert(upserts, { onConflict: 'user_id,contest_id,caderno_id' });
  if (error) return res.status(500).json({ error: 'cadernos_upsert_failed' });
  await supabase.from('study_sync_runs').insert({ user_id: userData.user.id, contest_id: contestId, source: String(body.source || 'tec'), record_count: upserts.length });
  return res.status(200).json({ ok: true, imported: upserts.length, syncedAt: new Date().toISOString() });
}
