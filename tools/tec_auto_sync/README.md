# Nexame — sincronização automática do TEC

Esta extensão não faz login e não recebe senha. Você entra normalmente no TEC; enquanto uma página autenticada estiver aberta, ela lê as estatísticas visíveis dos cadernos e o resultado que a própria página exibe para uma questão. Ela não coleta enunciados, comentários ou credenciais e envia somente esses metadados para `http://127.0.0.1:8765/ingest`.

## Configuração única

1. Na pasta do projeto, inicie a ponte:

   ```bash
   python3 tools/tec_sync.py --serve tec_sync.json --port 8765
   ```

2. Abra `chrome://extensions`, ative **Modo do desenvolvedor** e escolha **Carregar sem compactação**.
3. Selecione a pasta `tools/tec_auto_sync`.
4. Abra o TEC, faça login normalmente e visite a área de cadernos/resultados.

Depois disso, não é necessário exportar ou lançar dados no painel: a extensão sincroniza alterações automaticamente e a SPA recalcula o plano. A extensão não tem permissão para ler outras páginas nem para acessar campos de senha.
