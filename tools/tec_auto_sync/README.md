# Nexame — sincronização automática do TEC

Esta extensão não faz login e não recebe senha. Você entra normalmente no TEC; enquanto uma página autenticada estiver aberta, ela lê as estatísticas visíveis dos cadernos e o resultado que a própria página exibe para uma questão. Ela não coleta enunciados, comentários ou credenciais. O service worker guarda apenas o último snapshot temporário no `chrome.storage.local` e o entrega ao Nexame quando o painel está aberto.

## Instalação

Na distribuição privada/não listada, instale a extensão pelo link da Chrome Web Store e conceda acesso ao TEC e ao Nexame. Durante o desenvolvimento, ela também pode ser carregada sem compactação em `chrome://extensions`.

Depois, abra o TEC, faça login normalmente e visite a área de cadernos/resultados.

Depois disso, não é necessário exportar ou lançar dados no painel: a extensão sincroniza alterações automaticamente e a SPA recalcula o plano. A extensão não tem permissão para ler outras páginas nem para acessar campos de senha.
