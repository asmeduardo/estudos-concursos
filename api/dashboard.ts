import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const auth = String(req.headers.authorization || '');
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!auth.startsWith('Bearer ') || !url || !key) return res.status(401).json({ error: 'unauthorized' });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(auth.slice('Bearer '.length));
  if (userError || !userData.user) return res.status(401).json({ error: 'invalid_token' });
  const uid = userData.user.id;
  const contestId = String(req.query?.contestId || '');
  const contestFilter = (query: any) => contestId ? query.eq('contest_id', contestId) : query;
  const [cadernos, sessions, sync] = await Promise.all([
    contestFilter(supabase.from('study_cadernos').select('*').eq('user_id', uid)).order('updated_at', { ascending: false }),
    contestFilter(supabase.from('study_sessions').select('*').eq('user_id', uid)).order('ended_at', { ascending: false }).limit(200),
    contestFilter(supabase.from('study_sync_runs').select('*').eq('user_id', uid)).order('created_at', { ascending: false }).limit(1),
  ]);
  if (cadernos.error || sessions.error || sync.error) return res.status(500).json({ error: 'dashboard_read_failed' });
  return res.status(200).json({ cadernos: cadernos.data || [], sessions: sessions.data || [], lastSync: sync.data?.[0] || null });
}
