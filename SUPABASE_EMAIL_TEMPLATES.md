# E-mails transacionais do Nexame

Os modelos para confirmação de cadastro por OTP, recuperação de senha e aviso de alteração de senha estão em `supabase/templates/`.

O projeto Supabase atual usa o provedor padrão do plano gratuito. Esse provedor não permite personalizar templates nem é adequado para envio transacional de produção. Quando um SMTP transacional estiver configurado no projeto, restaure no `supabase/config.toml` as seções `auth.email.template.confirmation`, `auth.email.template.recovery` e `auth.email.notification.password_changed`, apontando para os arquivos já preparados.

O aplicativo já envia e valida o OTP de cadastro, autentica com e-mail/senha e dispara a recuperação de senha pelas APIs do Supabase.
