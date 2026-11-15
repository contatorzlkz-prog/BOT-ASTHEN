# ASTHEN BOT

Bot de Discord para o servidor Minecraft ASTHEN: atendimento privado, loja de kits, confirmação manual de pagamentos e entrega automática pelo Plugin-ASTHEN.

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-opcional-3ECF8E?logo=supabase&logoColor=white)
[![Checks](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/vers%C3%A3o-2.9.0-7C5CFC)

<p align="center">
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/archive/refs/heads/main.zip">
    <img src="assets/download-zip.svg" alt="Baixar ASTHEN BOT em ZIP" width="264" height="58">
  </a>
</p>

<p align="center">
  <strong>Windows 10/11 · Node.js 22 ou mais recente · Paper + Plugin-ASTHEN</strong>
</p>

## Começar

1. Baixe o ZIP pelo botão acima e extraia a pasta.
2. Execute `INSTALAR.bat`.
3. Informe o token do bot e o Application ID.
4. Execute `INICIAR.bat`.
5. No servidor Discord, use `/configurar` para definir os canais e o cargo da equipe.

O instalador verifica o Node.js, instala as dependências e executa as verificações antes de finalizar.

## Como funciona a loja

O **Plugin-ASTHEN é a origem dos kits reais e dos itens entregues no Minecraft**. O bot cuida da apresentação comercial no Discord.

1. Um administrador cria o kit real dentro do Minecraft pelo Plugin-ASTHEN.
2. O plugin envia a lista de kits para a API do bot.
3. O administrador usa `/kit criar` e seleciona um kit recebido do Minecraft.
4. O Discord abre uma janela para preencher nome exibido, preço, descrição e imagem HTTPS.
5. O kit aparece na loja. O comprador escolhe, confere a prévia, informa o nick e seleciona Java ou Bedrock.
6. O bot abre o ticket privado com o QR Pix, a chave e o valor.
7. A equipe confere o comprovante e confirma ou recusa o pagamento.
8. Após a aprovação, o bot solicita ao plugin a entrega do kit na plataforma escolhida.

**Importante:** `/kit criar` cadastra o produto na loja do Discord. Ele não cria espadas, armaduras ou outros itens dentro do Minecraft. Os itens reais continuam sendo configurados no plugin.

## Administrar kits no Discord

Todos os comandos `/kit` exigem a permissão **Administrador**.

| Comando | O que faz |
|---|---|
| `/kit criar` | Cadastra na loja um kit que já chegou do plugin. Preenche nome, preço, descrição e imagem de uma vez. |
| `/kit listar` | Mostra os kits, o estado no Minecraft e se o cadastro comercial está pronto. |
| `/kit editar` | Altera individualmente nome exibido, preço, descrição, imagem ou disponibilidade. |
| `/kit remover` | Marca o produto como indisponível na loja sem apagar o cadastro ou o kit no Minecraft. |

O identificador técnico do plugin não muda. Por exemplo, o Minecraft pode continuar usando `Kit_Ferro`, enquanto o cliente vê **Kit Ferro**.

Kits novos aparecem no catálogo como indisponíveis até terem preço. Quando um kit é desativado ou removido do plugin, ele permanece visível como indisponível. Os dados comerciais antigos e os pedidos não são apagados.

A versão atual do plugin envia nome, estado e quantidade de itens, mas ainda não envia preço. Por enquanto, configure o preço usando `/kit criar` ou `/kit editar`. O bot aceita o campo opcional `price` para quando o plugin passar a enviá-lo.

## Outros recursos

- Painel de suporte com departamentos de compras, servidor, bugs, denúncias e outros assuntos.
- Tickets privados com acesso do comprador e da equipe.
- Confirmação e recusa de pagamentos por membros autorizados.
- Registro privado das decisões e avisos de falha de entrega para a equipe.
- Anúncio de compra com nome e valor do produto.
- Escolha de Minecraft Java ou Bedrock antes de abrir o ticket.
- API HTTP autenticada para o Plugin-ASTHEN usando o modo poll.
- Tentativa automática adicional quando a entrega expira, reutilizando o mesmo identificador para evitar duplicidade.
- Backup local em `data/state.json` e sincronização opcional com Supabase.

## Instalação e atualização

### Requisitos

- Windows 10 ou Windows 11.
- Node.js 22 ou mais recente.
- Um bot criado no Discord Developer Portal.
- Servidor Paper com o Plugin-ASTHEN para testar a entrega real.

### Atualizar sem perder os dados

A chave de integração é gerada uma vez e guardada em `DKB_SECRET` dentro do arquivo `.env`.

- Na mesma pasta, mantenha o arquivo `.env` e a pasta `data`.
- Em uma pasta nova, copie o `.env` e a pasta `data` da instalação anterior antes de iniciar.
- Nunca publique o `.env` no GitHub ou envie tokens e chaves em canais do Discord.

O token do Discord, o segredo `DKB_SECRET` e a chave do Supabase são credenciais diferentes.

## Configuração da integração Minecraft

O bot e o servidor Minecraft podem ficar em computadores diferentes.

- No PC do bot: a API local usa `127.0.0.1:8787`.
- No PC do Minecraft: o plugin consulta um endereço HTTPS que encaminha até a API do bot.
- Para testes, o repositório inclui `INICIAR-TUNEL.bat`, que usa Cloudflare Quick Tunnel.

A chave deve ser copiada diretamente entre arquivos locais: `DKB_SECRET` no `.env` do bot e `bridge.secret` no `config.yml` do plugin. O bot não mostra esse segredo no Discord.

Consulte [Integração com o Plugin-ASTHEN](docs/PLUGIN-INTEGRATION.md) e [handoff técnico para o plugin](docs/PLUGIN-IMPLEMENTATION-HANDOFF.md).

A entrega real só pode ser considerada testada depois que o Paper e o plugin estiverem online e concluírem uma compra de teste.

## Supabase

O Supabase é opcional. Ele guarda um snapshot do estado e uma tabela organizada de kits por servidor Discord.

**Instalação nova:** abra o SQL Editor do Supabase e execute o arquivo completo [`supabase/SETUP.sql`](supabase/SETUP.sql). Ele cria as tabelas:

- `asthen_bot_state`: snapshot do estado do bot.
- `asthen_bot_kits`: catálogo comercial e estado de cada kit por servidor Discord.

**Projeto que já tinha as tabelas:** execute [`supabase/003_asthen_bot_kit_catalog_status.sql`](supabase/003_asthen_bot_kit_catalog_status.sql) para adicionar os novos campos. A migração pode ser executada mais de uma vez.

Depois configure no `.env`:

~~~env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
SUPABASE_KITS_TABLE=asthen_bot_kits
~~~

Use uma Secret API Key somente no backend do bot. Não a coloque no cliente, em páginas públicas ou no GitHub. Veja [configuração e diagnóstico do Supabase](docs/SUPABASE.md).

## Estrutura do projeto

~~~text
BOT-ASTHEN/
├── assets/                  # QR Pix e imagens do projeto
├── bot-integration/         # API HTTP copiada/adaptada para o bot
├── data/                    # Estado local (não versionar dados reais)
├── docs/                    # Instalação, comandos e integrações
├── linux/                   # Scripts para Linux
├── src/                     # Código do bot Discord
├── supabase/                # SQL de criação e migração das tabelas
├── test/                    # Testes automatizados
├── .github/                 # CI e modelos de contribuição
├── INSTALAR.bat             # Instalação no Windows
├── INICIAR.bat              # Inicialização no Windows
└── package.json             # Dependências, versão e scripts
~~~

## Verificações

Para executar localmente:

~~~bash
npm install
npm run check
npm run check:commands
npm test
~~~

O GitHub Actions executa as mesmas verificações em pull requests e atualizações da branch principal.

## Documentação

- [Instalação detalhada](docs/INSTALLATION.md)
- [Lista de comandos](docs/COMMANDS.md)
- [Integração com o Minecraft](docs/PLUGIN-INTEGRATION.md)
- [SQL e Supabase](docs/SUPABASE.md)
- [Arquitetura e fluxo do projeto](docs/ARCHITECTURE.md)
- [Como contribuir](CONTRIBUTING.md)
- [Segurança](SECURITY.md)

## Pix

A chave Pix e o QR Code são fixos nesta versão da loja. Não existe comando `/pix`. A mensagem de pagamento contém o QR Code, a chave e o botão para copiar.

Para trocar os dados Pix no futuro, é necessário atualizar em conjunto `src/pix.js` e `assets/pix-keybytes.png`.

## Segurança

- Nunca publique arquivos `.env`, tokens, chaves ou comprovantes.
- Não compartilhe `DKB_SECRET` em mensagens, prints ou canais do Discord.
- A API deve ficar vinculada a `127.0.0.1`; use HTTPS para conectar outro computador.
- A equipe confere os comprovantes manualmente.
- A entrega depende do Plugin-ASTHEN estar atualizado e conectado.
