"use strict";
const appWindow = window;
const root = document.querySelector('#authRoot');
const configured = Boolean(appWindow.__SUPABASE_CONFIG__?.url && appWindow.__SUPABASE_CONFIG__?.anonKey && appWindow.supabase?.createClient);
const auth = configured ? appWindow.supabase.createClient(appWindow.__SUPABASE_CONFIG__.url, appWindow.__SUPABASE_CONFIG__.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const COOLDOWN_SECONDS = 60;
const pageMode = document.body.dataset.authMode;
const query = new URLSearchParams(location.search);
const mode = pageMode === 'signup' && query.get('verify') === '1' ? 'verify' : pageMode;
function url(file) { return new URL(file, location.href).href; }
function safeNext() {
    const value = query.get('next');
    if (!value)
        return url('index.html');
    try {
        const parsed = new URL(value, location.origin);
        return parsed.origin === location.origin ? parsed.href : url('index.html');
    }
    catch {
        return url('index.html');
    }
}
function shell(content) {
    root.innerHTML = `<div class="auth-shell"><aside class="auth-aside"><a class="brand" href="index.html"><img src="assets/brand/nexame-mark.svg" alt=""><span>Nexame</span></a><div class="aside-copy"><div class="eyebrow">Estudo adaptativo</div><h1>Seu próximo passo, decidido por dados.</h1><p>Organize seu estudo, acompanhe o desempenho e preserve seu progresso com uma conta segura.</p></div><p class="aside-foot">© Nexame · Dados de estudo protegidos por conta individual.</p></aside><section class="auth-main"><div class="auth-card">${content}</div></section></div>`;
}
function notice(message = '', kind = '') { const target = document.querySelector('#notice'); if (!target)
    return; target.className = `notice ${kind}`; target.textContent = message; }
function buttonBusy(button, busy, label) { button.disabled = busy; if (label)
    button.textContent = label; }
function validPassword(password) { if (password.length < 8)
    return 'Use pelo menos 8 caracteres.'; if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    return 'Use letras maiúsculas, minúsculas e números.'; return null; }
function passwordField(label, name, autocomplete) { return `<label>${label}<span class="password-row"><input name="${name}" type="password" autocomplete="${autocomplete}" required><button class="password-toggle" type="button" data-password-toggle aria-label="Mostrar senha">Mostrar</button></span></label>`; }
function bindPasswordToggles() { document.querySelectorAll('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => { const input = button.parentElement?.querySelector('input'); if (!input)
    return; input.type = input.type === 'password' ? 'text' : 'password'; button.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar'; })); }
function cooldownKey(action, email) { return `nexame.auth.cooldown.${action}.${email.toLowerCase()}`; }
function cooldownRemaining(action, email) { const until = Number(localStorage.getItem(cooldownKey(action, email)) || 0); return Math.max(0, Math.ceil((until - Date.now()) / 1000)); }
function startCooldown(action, email) { localStorage.setItem(cooldownKey(action, email), String(Date.now() + COOLDOWN_SECONDS * 1000)); }
async function requestAuthEmail(action, email, details) {
    const result = await auth.functions.invoke('auth-email', { body: { action, email, ...details } });
    if (!result.error && result.data?.ok)
        return;
    let message = 'Não foi possível processar a solicitação agora.';
    try {
        const body = await result.error?.context?.json();
        if (body?.error)
            message = String(body.error);
    }
    catch { /* resposta genérica intencional */ }
    throw new Error(message);
}
function bindCooldown(button, action, email, send) {
    const refresh = () => { const left = cooldownRemaining(action, email); button.disabled = left > 0; button.textContent = left ? `Reenviar em ${left}s` : 'Reenviar código'; };
    refresh();
    const tick = window.setInterval(refresh, 1000);
    button.addEventListener('click', async () => { if (cooldownRemaining(action, email))
        return; buttonBusy(button, true, 'Enviando…'); try {
        await send();
        startCooldown(action, email);
        notice('Novo código enviado. Verifique sua caixa de entrada.', 'success');
    }
    catch (error) {
        notice(error instanceof Error ? error.message : 'Não foi possível enviar o código.', 'error');
    }
    finally {
        refresh();
    } });
    window.addEventListener('pagehide', () => window.clearInterval(tick), { once: true });
}
function renderLogin() {
    shell(`<h2>Boas-vindas de volta</h2><p class="lead">Entre para continuar seu plano de estudos.</p><form id="loginForm"><label>E-mail<input name="email" type="email" autocomplete="email" required></label>${passwordField('Senha', 'password', 'current-password')}<button class="primary" type="submit">Entrar</button></form><p id="notice" class="notice" role="status"></p><div class="auth-links"><a href="recuperar-senha.html">Esqueci minha senha</a><span>Não tem uma conta? <a href="cadastro.html">Criar conta</a></span></div>`);
    bindPasswordToggles();
    const form = document.querySelector('#loginForm');
    form.addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(form), button = form.querySelector('button[type="submit"]'); buttonBusy(button, true, 'Entrando…'); notice(); const result = await auth.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) }); if (result.error) {
        notice('E-mail ou senha inválidos. Verifique os dados e tente novamente.', 'error');
        buttonBusy(button, false, 'Entrar');
        return;
    } location.replace(safeNext()); });
}
function renderSignup() {
    shell(`<h2>Crie sua conta</h2><p class="lead">Seu progresso ficará disponível de forma segura em todos os seus dispositivos.</p><form id="signupForm"><label>Nome<input name="name" autocomplete="name" required></label><label>E-mail<input name="email" type="email" autocomplete="email" required></label>${passwordField('Senha', 'password', 'new-password')}<p class="small">Mínimo de 8 caracteres, com maiúscula, minúscula e número.</p><button class="primary" type="submit">Criar conta</button></form><p id="notice" class="notice" role="status"></p><div class="auth-links"><span>Já tem uma conta? <a href="auth.html">Entrar</a></span></div>`);
    bindPasswordToggles();
    const form = document.querySelector('#signupForm');
    form.addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(form), email = String(data.get('email')).trim(), password = String(data.get('password')), validation = validPassword(password), button = form.querySelector('button[type="submit"]'); if (validation) {
        notice(validation, 'error');
        return;
    } buttonBusy(button, true, 'Enviando código…'); try {
        await requestAuthEmail('signup', email, { password, name: String(data.get('name')).trim(), redirectTo: url(`cadastro.html?verify=1&email=${encodeURIComponent(email)}`) });
        startCooldown('signup', email);
        location.replace(url(`cadastro.html?verify=1&email=${encodeURIComponent(email)}`));
    }
    catch {
        notice('Não foi possível criar a conta agora. Tente novamente em instantes.', 'error');
        buttonBusy(button, false, 'Criar conta');
    } });
}
function renderVerify() {
    const email = query.get('email') || '';
    if (!email) {
        location.replace(url('cadastro.html'));
        return;
    }
    shell(`<h2>Confirme seu e-mail</h2><p class="lead">Enviamos um código de 8 dígitos para <strong>${email.replace(/[<>&"]/g, '')}</strong>.</p><form id="verifyForm"><label>Código de confirmação<input class="otp" name="code" inputmode="numeric" autocomplete="one-time-code" minlength="8" maxlength="8" pattern="[0-9]{8}" required></label><button class="primary" type="submit">Confirmar e entrar</button></form><p id="notice" class="notice" role="status"></p><p class="cooldown"><button class="password-toggle" id="resendCode" type="button">Reenviar código</button></p><div class="auth-links"><a href="cadastro.html">Usar outro e-mail</a></div>`);
    bindCooldown(document.querySelector('#resendCode'), 'signup', email, () => requestAuthEmail('resend_signup', email, { redirectTo: location.href }));
    const form = document.querySelector('#verifyForm');
    form.addEventListener('submit', async (event) => { event.preventDefault(); const button = form.querySelector('button[type="submit"]'), token = String(new FormData(form).get('code')).replace(/\D/g, ''); buttonBusy(button, true, 'Confirmando…'); const result = await auth.auth.verifyOtp({ email, token, type: 'signup' }); if (result.error) {
        notice('Código inválido ou expirado. Solicite um novo código e tente novamente.', 'error');
        buttonBusy(button, false, 'Confirmar e entrar');
        return;
    } location.replace(safeNext()); });
}
function renderRecovery() {
    shell(`<h2>Recuperar senha</h2><p class="lead">Informe seu e-mail. Se existir uma conta, você receberá instruções para redefinir a senha.</p><form id="recoveryForm"><label>E-mail<input name="email" type="email" autocomplete="email" required></label><button class="primary" type="submit">Enviar instruções</button></form><p id="notice" class="notice" role="status"></p><p class="cooldown"><button class="password-toggle" id="resendRecovery" type="button" hidden>Reenviar instruções</button></p><div class="auth-links"><a href="auth.html">Voltar para entrar</a></div>`);
    const form = document.querySelector('#recoveryForm'), resend = document.querySelector('#resendRecovery');
    const requestRecovery = async (email) => requestAuthEmail('recovery', email, { redirectTo: url('redefinir-senha.html') });
    form.addEventListener('submit', async (event) => { event.preventDefault(); const email = String(new FormData(form).get('email')).trim(), button = form.querySelector('button[type="submit"]'); if (cooldownRemaining('recovery', email)) {
        notice(`Aguarde ${cooldownRemaining('recovery', email)}s para um novo envio.`, 'error');
        return;
    } buttonBusy(button, true, 'Enviando…'); try {
        await requestRecovery(email);
        startCooldown('recovery', email);
        notice('Se houver uma conta com este e-mail, as instruções foram enviadas.', 'success');
        resend.hidden = false;
        bindCooldown(resend, 'recovery', email, () => requestRecovery(email));
    }
    catch {
        notice('Não foi possível processar o pedido agora. Tente novamente em instantes.', 'error');
    }
    finally {
        buttonBusy(button, false, 'Enviar instruções');
    } });
}
async function renderReset() {
    const session = (await auth.auth.getSession()).data.session;
    if (!session) {
        shell(`<h2>Link inválido ou expirado</h2><p class="lead">Peça uma nova redefinição de senha para receber um link válido.</p><div class="auth-links"><a href="recuperar-senha.html">Pedir nova redefinição</a></div>`);
        return;
    }
    shell(`<h2>Escolha uma nova senha</h2><p class="lead">Use uma senha forte que você ainda não tenha usado nesta conta.</p><form id="resetForm">${passwordField('Nova senha', 'password', 'new-password')}${passwordField('Confirmar nova senha', 'confirmation', 'new-password')}<button class="primary" type="submit">Salvar nova senha</button></form><p id="notice" class="notice" role="status"></p>`);
    bindPasswordToggles();
    const form = document.querySelector('#resetForm');
    form.addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(form), password = String(data.get('password')), confirmation = String(data.get('confirmation')), validation = validPassword(password), button = form.querySelector('button[type="submit"]'); if (validation) {
        notice(validation, 'error');
        return;
    } if (password !== confirmation) {
        notice('As senhas não coincidem.', 'error');
        return;
    } buttonBusy(button, true, 'Salvando…'); const result = await auth.auth.updateUser({ password }); if (result.error) {
        notice(result.error.message, 'error');
        buttonBusy(button, false, 'Salvar nova senha');
        return;
    } notice('Senha atualizada. Você já pode entrar.', 'success'); await auth.auth.signOut(); window.setTimeout(() => location.replace(url('auth.html')), 900); });
}
async function boot() {
    if (!auth) {
        shell('<h2>Conexão indisponível</h2><p class="lead">Não foi possível carregar a autenticação. Atualize a página em alguns instantes.</p>');
        return;
    }
    if (mode === 'reset') {
        await renderReset();
        return;
    }
    const session = (await auth.auth.getSession()).data.session;
    if (session) {
        location.replace(safeNext());
        return;
    }
    if (mode === 'login')
        renderLogin();
    else if (mode === 'signup')
        renderSignup();
    else if (mode === 'verify')
        renderVerify();
    else
        renderRecovery();
}
void boot();
