import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const auth = String(req.headers.authorization || ''), url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!auth.startsWith('Bearer ') || !url || !key) return res.status(401).json({ error: 'unauthorized' });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(auth.slice('Bearer '.length));
  if (userError || !userData.user) return res.status(401).json({ error: 'invalid_token' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const contestId = String(body.contestId || '').trim();
  if (!contestId) return res.status(400).json({ error: 'contest_id_required' });
  const seconds = Math.floor(Number(body.seconds || 0));
  if (seconds < 1 || seconds > 86400) return res.status(400).json({ error: 'invalid_seconds' });
  const { data, error } = await supabase.from('study_sessions').insert({ user_id: userData.user.id, contest_id: contestId, session_date: body.sessionDate || new Date().toISOString().slice(0, 10), session_type: String(body.sessionType || 'study'), seconds, ended_at: body.endedAt || new Date().toISOString(), source: String(body.source || 'dashboard') }).select('id').single();
  if (error) return res.status(500).json({ error: 'session_insert_failed' });
  return res.status(201).json({ ok: true, id: data.id });
}
