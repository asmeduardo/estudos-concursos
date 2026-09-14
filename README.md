# Estudos — painel adaptativo para concursos

O painel tem como fonte `src/dashboard.ts` (TypeScript estrito). O `dashboard.js` versionado é o artefato gerado por `npm run build`, permitindo que a SPA continue funcionando no GitHub Pages sem um servidor de compilação.

O `index.html` funciona imediatamente em modo local: o progresso e os resultados ficam no navegador. A aba **Painel adaptativo** aceita snapshots JSON/CSV do TEC, aplica a meta de 80% e prioriza recuperação por peso, acurácia, recência e erros repetidos.

## Ponte local do TEC

Não salve a senha do TEC. Gere ou exporte um snapshot usando a sessão autenticada e normalize-o com:

```bash
python3 ../tools/tec_sync.py --import resultado.json --output tec_sync.json
python3 ../tools/tec_sync.py --serve tec_sync.json --port 8765
```

O painel continua utilizável se a ponte estiver desligada; basta importar o arquivo pela interface.

## GitHub Pages + Supabase

O projeto possui as tabelas de concursos, cadernos, sessões, conteúdo e progresso, com RLS aplicado. Quando a configuração pública está disponível, a SPA cria uma sessão anônima do Supabase, carrega o concurso ativo e sincroniza dados automaticamente. Sem configuração, ela continua funcionando em modo local.

No painel Supabase, habilite **Authentication → Providers → Anonymous Sign-Ins**. Não é necessário expor e-mail ou senha no site.

O workflow `.github/workflows/pages.yml` compila o TypeScript e gera `supabase-config.js` somente durante o deploy, usando os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` do GitHub. A chave `anon` é pública por definição e fica protegida pelas políticas RLS; ela não concede acesso aos dados de outros usuários. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no Pages, no navegador ou no repositório. Essa chave só pode existir em uma função server-side protegida.

Para ativar o deploy conectado, cadastre os dois secrets nas configurações do repositório e selecione **GitHub Actions** como fonte do Pages. O valor de `SUPABASE_URL` para este projeto é `https://nwyvkqqbdqigsimdzzrg.supabase.co`; obtenha a chave `anon` no painel **Project Settings → API**.

`api/tec/sync.ts`, `api/study/session.ts` e `api/dashboard.ts` permanecem preparados para um backend serverless futuro; o Pages não executa TypeScript no servidor.

### Backend opcional no Supabase

As Edge Functions equivalentes ficam em `supabase/functions/`. Após vincular o projeto, aplique a migração e publique-as com:

```bash
npx supabase db query --linked --file supabase/migrations/20260915000000_multi_contest.sql --yes
npm run supabase:deploy
```

As funções usam `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente server-side do Supabase; essa chave nunca é enviada ao navegador ou ao GitHub Pages.
