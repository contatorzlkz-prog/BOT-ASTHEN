# Segurança

Nunca publique tokens Discord, `DKB_SECRET`, credenciais Supabase, arquivos `.env`, comprovantes ou transcrições privadas.

## Aviso sobre a distribuição atual

O código público atual contém uma chave Pix fixa em `src/pix.js` e a imagem QR correspondente em `assets/pix-keybytes.png`. Esses dados são visíveis para qualquer pessoa que acesse o repositório. Eles não autenticam o bot nem substituem as credenciais de API, mas identificam o destino dos pagamentos.

Antes de usar uma cópia deste projeto para outra loja, confira e substitua a chave e o QR juntos. A versão atual ainda não oferece configuração individual desses dados por instalação. Não remova apenas um dos dois: a chave apresentada no ticket e o QR precisam corresponder.

## Credenciais e vulnerabilidades

Cada instalação deve usar seu próprio token no Discord Developer Portal e seu próprio `DKB_SECRET`. Se um token de autenticação vazar, revogue-o e gere outro imediatamente. Mantenha o segredo da Bridge igual ao configurado no plugin, mas nunca o envie em canais, tickets, prints ou issues públicas.

Para reportar uma vulnerabilidade, entre em contato com o mantenedor pelo perfil do GitHub. Não publique credenciais, dados de clientes ou detalhes exploráveis em uma issue pública.
