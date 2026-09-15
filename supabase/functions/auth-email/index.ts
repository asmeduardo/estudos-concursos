import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': 'https://asmeduardo.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};
const allowedRedirects = new Set([
  'https://asmeduardo.github.io/estudos-concursos/cadastro.html',
  'https://asmeduardo.github.io/estudos-concursos/redefinir-senha.html'
]);

function json(body: Record<string, unknown>, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: cors }); }
function clientIp(request: Request): string { return (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '').split(',')[0].trim(); }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const body = await request.json() as { action?: string; email?: string; password?: string; name?: string; redirectTo?: string };
    const action = body.action === 'signup_otp' || body.action === 'resend_signup' || body.action === 'signup' ? 'signup' : body.action === 'recovery' ? 'recovery' : '';
    const email = String(body.email || '').trim().toLowerCase();
    const redirectTo = String(body.redirectTo || 'https://asmeduardo.github.io/estudos-concursos/redefinir-senha.html');
    if (!action || !validEmail(email)) return json({ error: 'Solicitação inválida.' }, 400);
    if (!allowedRedirects.has(redirectTo.split('?')[0])) return json({ error: 'URL de retorno inválida.' }, 400);
    if (body.action === 'signup' && (String(body.password || '').length < 8 || !/[a-z]/.test(String(body.password)) || !/[A-Z]/.test(String(body.password)) || !/\d/.test(String(body.password)))) return json({ error: 'Senha não atende aos requisitos.' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const claim = await admin.rpc('claim_auth_email_send', { p_email: email, p_action: action, p_ip: clientIp(request) });
    if (claim.error) return json({ error: 'Não foi possível validar o limite de envio.' }, 500);
    const rate = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    if (!rate?.allowed) return json({ error: 'Aguarde antes de solicitar outro e-mail.', retryAfter: Number(rate?.retry_after_seconds || 60) }, 429);

    const endpoint = body.action === 'signup' ? 'signup' : body.action === 'signup_otp' ? 'otp' : body.action === 'resend_signup' ? 'otp' : 'recover';
    const payload = body.action === 'signup'
      ? { email, password: String(body.password), data: { display_name: String(body.name || '').trim() }, redirect_to: redirectTo }
      : body.action === 'signup_otp' || body.action === 'resend_signup'
        ? { email, create_user: true, redirect_to: redirectTo }
        : { email, redirect_to: redirectTo };
    const response = await fetch(`${url}/auth/v1/${endpoint}`, { method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) return json({ error: 'Não foi possível enviar o e-mail agora.' }, 400);
    return json({ ok: true, retryAfter: 60 });
  } catch {
    return json({ error: 'Não foi possível processar a solicitação.' }, 500);
  }
});
