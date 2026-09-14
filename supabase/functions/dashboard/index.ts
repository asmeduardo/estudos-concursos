import { authenticate, preflight, response } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  if (req.method !== 'GET') return response({ error: 'method_not_allowed' }, 405);
  const auth = await authenticate(req); if ('error' in auth) return auth.error;
  const contestId = new URL(req.url).searchParams.get('contestId') || '';
  const filter = (query: any) => contestId ? query.eq('contest_id', contestId) : query;
  const [contests, cadernos, sessions, sync] = await Promise.all([
    auth.admin.from('study_contests').select('*').eq('user_id', auth.userId).order('updated_at', { ascending: false }),
    filter(auth.admin.from('study_cadernos').select('*').eq('user_id', auth.userId)).order('updated_at', { ascending: false }),
    filter(auth.admin.from('study_sessions').select('*').eq('user_id', auth.userId)).order('ended_at', { ascending: false }).limit(200),
    filter(auth.admin.from('study_sync_runs').select('*').eq('user_id', auth.userId)).order('created_at', { ascending: false }).limit(1)
  ]);
  if ([contests, cadernos, sessions, sync].some((item) => item.error)) return response({ error: 'dashboard_read_failed' }, 500);
  return response({ contests: contests.data || [], cadernos: cadernos.data || [], sessions: sessions.data || [], lastSync: sync.data?.[0] || null });
});
