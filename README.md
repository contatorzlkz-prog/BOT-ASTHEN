# ASTHEN BOT

Bot de Discord para o servidor Minecraft ASTHEN: atendimento privado, loja de kits, confirmação manual de pagamentos e entrega automática pelo Plugin-ASTHEN.

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-estoque_persistente-3ECF8E?logo=supabase&logoColor=white)
[![Checks](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/vers%C3%A3o-2.14.0-7C5CFC)

<p align="center">
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/releases/latest/download/ASTHEN-BOT-v2.14.0.zip">
    <img src="assets/download-zip.svg" alt="Baixar ASTHEN BOT 2.14.0 em ZIP" width="264" height="58">
  </a>
</p>

<p align="center">
  <strong>Windows 10/11 · Node.js 22 ou mais recente · Paper + Plugin-ASTHEN</strong>
</p>

## Versão 2.14.0

A versão 2.14.0 mantém a fila persistente e simplifica a loja: os kits são criados no Minecraft, sincronizados automaticamente e editados no Discord. Sem plugin conectado, a loja exibe um Kit Demonstração que não gera compras nem cobranças.

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
3. No Minecraft, o administrador define o preço com `/dk price Kit_Ferro 29,90` e ativa o kit.
4. O Plugin-ASTHEN sincroniza o kit automaticamente com o bot. Ele aparece na loja sem cadastro manual pelo Discord.
5. No Discord, `/kit editar` permite alterar apenas o nome exibido, a descrição e a imagem. O preço e a disponibilidade continuam vindo do Minecraft.
6. O comprador confere a prévia, informa o nick e seleciona Java ou Bedrock.
7. O bot abre o ticket privado com o QR Pix, a chave e o valor. A equipe confere o comprovante.
8. Após a aprovação, o bot reserva uma unidade do estoque semanal no Supabase e solicita a entrega ao plugin.
9. O plugin entrega a Shulker Box; se o jogador estiver offline, a entrega fica pendente para quando entrar (com `kits.require-online: false`).

**Importante:** não existe cadastro de kits pelo Discord. Um kit só entra na loja depois de ser criado e sincronizado pelo Plugin-ASTHEN. O nome, a descrição e a imagem comercial podem ser ajustados no Discord.

## Administrar kits no Discord

Todos os comandos `/kit` exigem a permissão **Administrador**.

| Comando | O que faz |
|---|---|
| `/kit listar` | Lista os kits sincronizados do Minecraft e o estado de venda. |
| `/kit editar` | Altera nome exibido, descrição ou imagem de um kit recebido do plugin. |

O identificador técnico do plugin não muda. Por exemplo, o Minecraft pode continuar usando `Kit_Ferro`, enquanto o cliente vê **Kit Ferro**.

O **Plugin-ASTHEN 1.2.0 é a fonte oficial do preço e da disponibilidade**. No Minecraft, use `/dk price Kit_Ferro 29,90` para definir o valor, `/dk price Kit_Ferro remover` para retirar da venda e `/dk enable` ou `/dk disable` para ativar/desativar. Kit sem preço não pode ser comprado.

A lista enviada ao bot inclui `price`, `price_cents` e `for_sale`. O bot usa `price_cents` para exibir o valor sem erro de arredondamento e só permite a compra quando `for_sale: true`. O preço não pode ser editado no Discord.

Quando um kit é desativado ou removido do plugin, ou perde o preço, continua visível como indisponível. Os dados comerciais e pedidos antigos não são apagados.

## Outros recursos

- Painel de suporte com departamentos de compras, servidor, bugs, denúncias e outros assuntos.
- Tickets privados com acesso do comprador e da equipe.
- Confirmação e recusa de pagamentos por membros autorizados.
- Registro privado das decisões e avisos de falha de entrega para a equipe.
- Anúncio de compra com nome e valor do produto.
- Escolha de Minecraft Java ou Bedrock antes de abrir o ticket.
- API HTTP autenticada para o Plugin-ASTHEN com Long Polling, fila persistente de pedidos e atualização posterior de entrega.
- Tentativa automática adicional quando a entrega expira, reutilizando o mesmo identificador para evitar duplicidade.
- Entrega do kit pelo plugin em uma Shulker Box com nome e itens preservados.
- Jogador offline: kit fica pendente no plugin e é tentado automaticamente quando entrar.
- Inventário cheio: o servidor avisa para liberar espaço; depois o jogador usa /dk claim.
- Limite de 10 unidades por kit a cada semana, com reinício domingo às 00:00 no horário de Brasília.
- Estoque semanal e reservas salvos transacionalmente no Supabase; reiniciar o bot não zera as vendas.

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
- Para testar entre PCs Windows sem domínio próprio, use Tailscale Funnel e padronize o dispositivo do bot como `asthen-bot`. A URL `https://asthen-bot.NOME-DO-TAILNET.ts.net` pode ser reutilizada na VPS se ela entrar no mesmo tailnet e o nome for transferido corretamente (renomeie o PC antigo para `asthen-windows` antes de atribuí-lo à VPS). `INICIAR-TUNEL.bat` continua disponível como Cloudflare Quick Tunnel temporário. O guia também documenta Cloudflare Named Tunnel e tunnel.to Registered Free. Veja [TÚNEL HTTPS](docs/TUNNEL-SETUP.md).

A chave deve ser copiada diretamente entre arquivos locais: `DKB_SECRET` no `.env` do bot e `bridge.secret` no `config.yml` do plugin. O bot não mostra esse segredo no Discord.

Consulte [Integração com o Plugin-ASTHEN](docs/PLUGIN-INTEGRATION.md) e [handoff técnico para o plugin](docs/PLUGIN-IMPLEMENTATION-HANDOFF.md).

**Verificação do Plugin-ASTHEN 1.2.0:** no [build do GitHub Actions de 15/11/2026](https://github.com/ElbsxS1/Plugin-ASTHEN/actions/runs/43659388395), os 67 testes JDK-only passaram e o `mvn package` terminou com `BUILD SUCCESS` usando a dependência Paper configurada.

Isso não substitui o teste dentro do jogo. A entrega em Shulker Box ainda precisa ser validada em um servidor Paper real, incluindo cor, nome, slots e retirada com inventário cheio.


## Supabase

Para iniciar o bot, o projeto Supabase precisa de três tabelas e uma função SQL. Abra o SQL Editor e execute o arquivo completo `supabase/SETUP.sql`.

- `asthen_bot_state`: snapshot geral, incluindo a lista recebida do Minecraft, configurações e tickets.
- `asthen_bot_weekly_stock`: saldo reservado por kit e semana.
- `asthen_bot_stock_reservations`: registro idempotente das compras aprovadas.
- `reserve_asthen_weekly_kit_stock(...)`: função que reserva uma unidade sem ultrapassar o limite.

A tabela `asthen_bot_kits` não é necessária nesta versão. O bot não grava mais os kits numa tabela separada; eles ficam no snapshot e são sincronizados pelo Plugin-ASTHEN. Se a tabela antiga existir no projeto, pode deixá-la lá: não é preciso apagá-la.

Configure no `.env` somente:

~~~env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
~~~

A chave é usada apenas no backend. Sem plugin conectado, a loja exibe um Kit Demonstração não comprável e não consulta estoque. Consulte [o guia Supabase](docs/SUPABASE.md) para detalhes.

## Estrutura do projeto

~~~text
BOT-ASTHEN/
├── assets/                  # QR Pix e imagens do projeto
├── bot-integration/         # API HTTP copiada/adaptada para o bot
├── data/                    # Estado local, fila persistente da Bridge e backups (não versionar dados reais)
├── docs/                    # Instalação, comandos e integrações
├── prompts/                 # Prompts de correção e evolução do bot/plugin
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

- [Prompts de manutenção ASTHEN — índice](prompts/README.md)
- [Prompt completo do Plugin-ASTHEN 1.3.0](prompts/PLUGIN-ASTHEN-1.3.0-CORRECOES.md)
- [Túneis HTTPS, hostname asthen-bot e migração para VPS](docs/TUNNEL-SETUP.md)

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
