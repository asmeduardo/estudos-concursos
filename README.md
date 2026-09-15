# Nexame — estudos adaptativos para concursos

O painel tem como fonte `src/dashboard.ts` (TypeScript estrito). O `dashboard.js` versionado é o artefato gerado por `npm run build`, permitindo que a SPA continue funcionando no GitHub Pages sem um servidor de compilação.

O `index.html` funciona imediatamente em modo local. O Nexame mantém um concurso principal, aceita concursos secundários para reaproveitamento de matérias e prioriza recuperação por peso, desempenho, recência, erros repetidos e tempo restante. A meta é configurável por concurso e começa em 100%; ela não é um número fixo de aprovação.

## Ponte local do TEC

Não salve a senha do TEC. A sincronização automática usa uma sessão que você já autenticou no navegador:

Para sincronização automática, use a extensão local incluída em `tools/tec_auto_sync`:

```bash
python3 tools/tec_sync.py --serve tec_sync.json --port 8765
```

Depois carregue `tools/tec_auto_sync` em `chrome://extensions` (Modo do desenvolvedor → Carregar sem compactação), entre no TEC normalmente e abra a área de cadernos/resultados. A extensão só lê estatísticas visíveis de uma sessão que você já autenticou; ela não lê, armazena ou envia senha. A ponte fica limitada a `127.0.0.1` e o painel consulta o snapshot a cada dois minutos.

O cadastro manual permanece apenas como contingência, caso a ponte esteja indisponível:

```bash
python3 tools/tec_sync.py --import resultado.json --output tec_sync.json
```

O painel continua utilizável se a ponte estiver desligada; basta importar o arquivo pela interface.

## GitHub Pages + Supabase

O projeto possui tabelas de concursos, cadernos, sessões, conteúdo, eventos de estudo, tentativas por questão e decisões de plano, todas protegidas por RLS. Quando a configuração pública está disponível, a SPA inicia de forma anônima e permite vincular o progresso a e-mail para acesso entre dispositivos. Sem configuração, ela continua funcionando em modo local.

No painel Supabase, habilite **Authentication → Providers → Anonymous Sign-Ins** e **Email OTP/Magic Link**. Não é necessário expor senha do TEC ou qualquer chave administrativa no site.

O workflow `.github/workflows/pages.yml` compila o TypeScript e gera `supabase-config.js` somente durante o deploy, usando os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` do GitHub. A chave `anon` é pública por definição e fica protegida pelas políticas RLS; ela não concede acesso aos dados de outros usuários. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no Pages, no navegador ou no repositório. Essa chave só pode existir em uma função server-side protegida.

Para ativar o deploy conectado, cadastre os dois secrets nas configurações do repositório e selecione **GitHub Actions** como fonte do Pages. O valor de `SUPABASE_URL` para este projeto é `https://nwyvkqqbdqigsimdzzrg.supabase.co`; obtenha a chave `anon` no painel **Project Settings → API**.

`api/tec/sync.ts`, `api/study/session.ts` e `api/dashboard.ts` permanecem preparados para um backend serverless futuro; o Pages não executa TypeScript no servidor.

### Backend opcional no Supabase

As Edge Functions equivalentes ficam em `supabase/functions/`. Após vincular o projeto, aplique a migração e publique-as com:

```bash
npx supabase db push --linked
npm run supabase:deploy
```

As funções usam `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente server-side do Supabase; essa chave nunca é enviada ao navegador ou ao GitHub Pages.

## Identidade visual

Os arquivos em `assets/brand/` são vetoriais e podem ser usados em fundos claros, escuros e em favicon. O símbolo representa um caminho que forma o “N” e segue adiante; a imagem gerada por IA foi usada apenas para explorar o conceito, e os ativos de produção foram desenhados em SVG para permanecerem nítidos em qualquer tamanho.
