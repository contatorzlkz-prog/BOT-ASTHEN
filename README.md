# ASTHEN BOT

Bot de Discord para suporte, pedidos privados e venda de kits de Minecraft Java com entrega pelo Plugin-ASTHEN.

**Versão do bot: 2.6.0**

## Loja: como a compra funciona

1. O cliente abre o catálogo e escolhe um kit.
2. O bot mostra uma prévia privada com nome, preço, descrição e imagem.
3. O cliente pode **Trocar kit** ou **Confirmar kit**.
4. Ao confirmar, informa o nick Java (3 a 16 caracteres) no formulário.
5. Ao enviar o formulário, o bot abre o ticket privado de pagamento. O ticket mostra o nome do kit, a imagem, o preço, a descrição, o nick e as informações Pix.
6. O cliente envia o comprovante. Um membro da equipe confere e confirma ou recusa o pagamento.
7. Só depois da confirmação, o bot envia ao plugin o nick, `platform: java`, o nome exato do kit e um `request_id` único.
8. O ticket recebe o resultado da entrega.

O cliente não precisa confirmar o pedido duas vezes depois de informar o nick. O envio do formulário de nick abre o ticket.

## Recursos

- Painéis separados de suporte e loja.
- Tickets privados por departamento.
- Cadastro de kit com nome do plugin, preço, descrição e link HTTPS de imagem.
- Prévia do produto antes de abrir o ticket.
- Confirmação manual do pagamento pela equipe.
- API HTTP local autenticada para comunicação com o Plugin-ASTHEN em modo `poll`.
- Chave da integração gerada pelo próprio bot e guardada em `.env`.
- Comandos privados de diagnóstico e gerenciamento da integração.
- Backup local em `data/state.json` e sincronização opcional de snapshot com Supabase.

## Requisitos

- Windows 10/11 ou Linux.
- Node.js 22 ou superior.
- Aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications).
- Um servidor Minecraft Paper compatível com o Plugin-ASTHEN.

O Message Content Intent não é necessário.

## Instalação no Windows

1. Baixe o projeto pelo botão **Code > Download ZIP** e extraia a pasta.
2. Abra `.env.example`, faça uma cópia com o nome `.env` e preencha `DISCORD_TOKEN` e `CLIENT_ID`.
3. Execute `INSTALAR.bat` uma vez.
4. Execute `INICIAR.bat` para ligar o bot.

Não publique nem envie seu arquivo `.env`. A chave de integração Minecraft será criada automaticamente na primeira inicialização e será gravada nesse arquivo.

## Configurar o Discord

Use `/configurar` para definir os canais de suporte, loja, logs, compradores e o cargo da equipe.

Use `/pix` para cadastrar a chave e as instruções de pagamento.

### Cadastrar kits da loja

Use `/kit adicionar`. O cadastro pede:

- Nome exato do kit no plugin, por exemplo `Kit_Ferro`.
- Preço.
- Descrição comercial.
- Link HTTPS da imagem (opcional).

Use `/kit listar` para conferir os produtos e `/kit remover` para retirar um produto da loja. Cadastrar o produto no bot não cria os itens no Minecraft: o mesmo kit precisa existir no plugin.

## Integração com Minecraft Java

A comunicação usa o modo `poll`: o plugin faz conexões de saída e consulta o bot. O servidor Minecraft não precisa abrir uma porta de entrada para o bot.

**Importante:** a versão atual do repositório do plugin ainda precisa receber os ajustes descritos em [PLUGIN-IMPLEMENTATION-HANDOFF.md](docs/PLUGIN-IMPLEMENTATION-HANDOFF.md), principalmente para aceitar a chave gerada pelo bot. Até esse ajuste ser feito, a integração completa não está pronta para uso real.

### Teste local no mesmo Windows

Para testar sem VPS, o bot e o servidor Paper precisam estar na mesma máquina:

- Bot: `DKB_HOST=127.0.0.1` e `DKB_PORT=8787` (padrão).
- Plugin: `bridge.poll.url: "http://127.0.0.1:8787"`.
- Plugin: `bridge.mode: "poll"`.
- Plugin: `bridge.secret`: a chave exibida pelo comando privado `/bridge chave`.

Depois de alterar o `config.yml`, reinicie o servidor ou use `/dk reload`.

**Um mundo single-player vanilla não carrega plugins Paper.** Para testar o plugin localmente, rode um pequeno servidor Paper no Windows e entre nele pelo Minecraft usando `localhost`. Quando o bot e o Paper estiverem no mesmo PC, o endereço `127.0.0.1` funciona para o teste.

### Quando o bot for para uma VPS

A hospedagem Minecraft continuará consultando o bot. Publique a API do bot por HTTPS usando um proxy reverso ou serviço equivalente. O plugin deve apontar para a URL HTTPS pública, sem acrescentar `/plugin/v1`. Não exponha a API em HTTP aberto na internet.

Consulte [docs/PLUGIN-INTEGRATION.md](docs/PLUGIN-INTEGRATION.md) para os passos e [docs/PLUGIN-IMPLEMENTATION-HANDOFF.md](docs/PLUGIN-IMPLEMENTATION-HANDOFF.md) para o trabalho que falta no plugin.

### Kits no Minecraft

No servidor Paper, o administrador cria os kits usando uma Shulker Box preenchida e o comando do plugin:

```text
/dk create Kit_Ferro
/dk create Kit_Dima
```

O nome usado no cadastro da loja precisa ser igual ao identificador criado no plugin. O plugin atual aceita letras, números, `_` e `-`, com até 32 caracteres.

## Comandos administrativos

| Comando | Função |
|---|---|
| `/configurar` | Configura os canais e a equipe |
| `/pix` | Configura os dados Pix |
| `/kit adicionar` | Cadastra um produto com preço, descrição e imagem |
| `/kit listar` | Lista produtos da loja |
| `/kit remover` | Remove um produto da loja |
| `/bridge status` | Mostra estado da API, kits recebidos e Supabase |
| `/bridge chave` | Exibe em privado a chave para configurar o plugin |
| `/bridge regenerar` | Cria uma nova chave e invalida a anterior |

## Supabase (opcional)

O arquivo local `data/state.json` continua sendo o backup principal. Quando Supabase estiver configurado, o bot sincroniza um snapshot da configuração, dos tickets abertos e das compras em preparação.

1. Execute `supabase/001_asthen_bot_state.sql` no SQL Editor do seu projeto.
2. No `.env`, preencha `SUPABASE_URL` com a URL base do projeto e `SUPABASE_SECRET_KEY` com a chave secreta `sb_secret_...`.
3. O nome da tabela padrão é `asthen_bot_state`. Pode ser alterado por `SUPABASE_TABLE`.

O bot também aceita as variáveis antigas `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_KEY`. Para chaves novas `sb_secret_...`, o código envia a chave no cabeçalho `apikey`, não como JWT no cabeçalho Bearer. Nunca coloque essa chave no GitHub nem em mensagens públicas.

## Verificação do projeto

```bash
npm install
npm run check
npm run check:commands
npm test
```

O GitHub Actions executa essas verificações nas atualizações da branch principal.

## Segurança

- Nunca publique `.env`, tokens ou chaves.
- A chave `DKB_SECRET` é diferente do token do Discord e da chave Supabase.
- `/bridge chave` e `/bridge regenerar` são restritos a administradores/quem tem Gerenciar servidor e respondem em privado.
- A chave do plugin deve ser transmitida somente por configuração privada.
- Em uma VPS, use HTTPS na rota pública da API.
