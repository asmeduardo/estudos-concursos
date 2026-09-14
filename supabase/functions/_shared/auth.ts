import { createClient } from 'jsr:@supabase/supabase-js@2';

export const jsonHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
export function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
export function preflight(req: Request): Response | null { return req.method === 'OPTIONS' ? new Response('ok', { headers: { ...jsonHeaders, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } }) : null; }
export async function authenticate(req: Request): Promise<{ admin: ReturnType<typeof createClient>; userId: string } | { error: Response }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !url || !key) return { error: response({ error: 'unauthorized' }, 401) };
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: response({ error: 'invalid_token' }, 401) };
  return { admin, userId: data.user.id };
}
