# ASTHEN BOT

Bot de Discord para atendimento privado, loja de kits de Minecraft Java e entrega automática pelo Plugin-ASTHEN.

## O que faz

- Abre tickets privados por departamento usando menus nativos do Discord.
- Apresenta kits recebidos do plugin em um menu de seleção, com prévia, preço, descrição e imagem.
- Coleta e revisa o nick Java antes de abrir o ticket de pagamento.
- Mostra o Pix, a imagem QR original configurada e as instruções para anexar o comprovante.
- Permite que administradores confirmem ou recusem pagamentos.
- Após confirmar o pagamento, envia ao plugin somente o identificador do pedido, o nick Java e o nome exato do kit.
- Exibe o resultado da entrega; se o plugin estiver indisponível, mantém o pedido e permite uma nova tentativa com o mesmo identificador.
- Salva o estado localmente e sincroniza um snapshot com o Supabase, quando configurado.

## Requisitos

- Node.js 22 ou superior.
- Aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications).
- Permissões do bot: View Channels, Send Messages, Read Message History, Embed Links, Attach Files e Manage Channels.
- Escopos OAuth2: `bot` e `applications.commands`.
- Para entrega Minecraft: Plugin-ASTHEN instalado em um servidor Paper compatível com a versão indicada no [repositório do plugin](https://github.com/ElbsxS1/Plugin-ASTHEN).

O Message Content Intent não é necessário.

## Instalação

### Windows 10/11

1. Extraia o ZIP.
2. Execute `INSTALAR.bat`.
3. Execute `INICIAR.bat`.
4. Na primeira execução, informe o token Discord e o Application ID.
5. Quando solicitado, configure opcionalmente Supabase e Plugin-ASTHEN.

O assistente cria o `.env` automaticamente. As credenciais ficam no computador onde o bot é executado.

### Linux

```bash
bash setup-linux.sh
./start-linux.sh
```

## Configurar o Discord

Use `/configurar` para selecionar os canais de suporte, loja, logs, compradores e o cargo da equipe.

Use `/pix` para definir a chave e as instruções de pagamento.

## Integração com Minecraft Java

A API de integração fica no bot. O plugin funciona como cliente em modo `poll`: ele consulta o bot por conexões de saída e recebe os pedidos aprovados. Esse modelo não exige uma porta de entrada no servidor Minecraft.

1. Instale o [Plugin-ASTHEN](https://github.com/ElbsxS1/Plugin-ASTHEN) no servidor e reinicie.
2. No console do Minecraft, cadastre cada kit com `/dk create Kit_Ferro` (use o nome exato do produto).
3. Copie `bridge.secret` de `plugins/DiscordKitBridge/config.yml`.
4. Na primeira inicialização do bot, cole esse segredo no assistente para gravá-lo como `DKB_SECRET` no `.env`.
5. Publique a porta local `127.0.0.1:8787` por um túnel HTTPS ou proxy reverso para que o servidor Minecraft consiga alcançá-la.
6. Em `plugins/DiscordKitBridge/config.yml`, mantenha `bridge.mode: "poll"` e defina `bridge.poll.url` como a URL HTTPS base do bot, sem `/plugin/v1`.
7. Quando o plugin sincronizar sua lista, use `/kit configurar` para associar o nome exato do kit a um preço, descrição e imagem da loja.

A bridge usa `Authorization: Bearer` com o mesmo segredo do plugin. O segredo não vai para o Supabase nem para mensagens do Discord. Consulte [docs/PLUGIN-INTEGRATION.md](docs/PLUGIN-INTEGRATION.md) para o roteiro completo.

### Identificadores dos kits

| Nome exibido na loja | Nome exato no plugin | Preço inicial |
|---|---|---:|
| Kit Keep | `Kit_Keep` | R$ 125,00 planejado (indisponível) |
| Kit Ferro | `Kit_Ferro` | R$ 15,00 |
| Kit Dima | `Kit_Dima` | R$ 25,00 |
| Kit Netherita | `Kit_Netherita` | R$ 30,00 |
| Kit Elytra | `Kit_Elytra` | A definir |
| Kit Construção | `Kit_Construcao` | A definir |

Kit Keep fica indisponível até que o plugin implemente e teste KeepInventory ao morrer; R$ 125,00 é o preço planejado. Elytra e Construção também ficam indisponíveis até que um administrador defina seus preços. O nome no plugin aceita letras, números, `_` e `-`, até 32 caracteres.

**Limitação conhecida do plugin atual:** ele entrega os itens guardados na Shulker Box do kit, mas ainda não implementa o efeito KeepInventory ao morrer. Portanto, `Kit_Keep` pode entregar itens cadastrados, mas não deve ser anunciado como proteção contra perda do inventário até que o plugin receba essa função.

## Fluxo de compra e entrega

1. O cliente seleciona um kit no painel público.
2. O bot mostra a prévia e o cliente informa o nick Java.
3. O cliente revisa os dados e confirma; só então é criado o ticket privado de pagamento.
4. O cliente paga e anexa o comprovante.
5. Um administrador confirma ou recusa o pagamento.
6. Ao confirmar, o bot envia `player`, `platform: java`, `kit` e um `request_id` único ao plugin.
7. O plugin valida jogador e kit e entrega os itens no servidor. Se o inventário estiver cheio, pode guardar o conjunto para `/dk claim`, conforme a configuração do plugin.

A entrega é idempotente no plugin: tentativas repetidas reutilizam o mesmo `request_id` para evitar duplicação.

## Supabase e backup local

O Supabase é o armazenamento remoto do estado do bot, não a API de entrega Minecraft. O arquivo `data/state.json` é sempre gravado primeiro. A sincronização remota agrupa alterações próximas e usa tentativas com intervalo progressivo quando a API falha.

Para ativar:

1. Execute `supabase/001_asthen_bot_state.sql` no SQL Editor do projeto Supabase.
2. Na configuração inicial, informe a Project URL e a Secret API Key `sb_secret_...`.
3. Use a URL base do projeto. O bot também normaliza URLs copiadas com `/v1` ou `/rest/v1` no final.

A chave secreta fica somente no `.env` local. Não use a chave publishable/anon para operações administrativas. Consulte [docs/SUPABASE.md](docs/SUPABASE.md).

## Comandos administrativos

- `/configurar`: configura os canais e a equipe.
- `/pix`: configura chave e instruções Pix.
- `/kit listar`: mostra kits cadastrados e estado do vínculo com o plugin.
- `/kit configurar`: define preço, descrição e imagem para um kit já sincronizado do plugin.
- `/kit preco`: altera o preço.
- `/kit adicionar`: fluxo de cadastro legado para compatibilidade.
- `/kit remover`: remove o produto da loja sem apagar o kit Minecraft.

## Verificação

```bash
npm install
npm run check
npm run check:commands
npm test
```

O GitHub Actions executa as verificações de sintaxe, comandos e bridge em cada atualização da branch principal.

## Segurança

Nunca publique o arquivo `.env`. Ele contém o token do Discord e os segredos do Supabase e do Plugin-ASTHEN. Não compartilhe esses valores em issues, prints ou mensagens públicas.