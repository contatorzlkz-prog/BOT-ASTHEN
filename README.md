# ASTHEN BOT

Bot de Discord para atendimento privado e gerenciamento de uma loja de kits de Minecraft. O projeto oferece painéis de suporte e loja, fluxo de pedidos com Pix, ferramentas administrativas e armazenamento local com sincronização opcional pelo Supabase.

## O que faz

- Abre tickets privados por departamento usando menus nativos do Discord.
- Exibe o catálogo de kits por menu de seleção, sem uma sequência de botões de compra.
- Mostra detalhes do kit em uma resposta privada e coleta o nick do Minecraft.
- Cria o canal do pedido após a confirmação dos dados e apresenta o Pix e as instruções de pagamento.
- Permite que administradores confirmem, recusem ou encerrem pedidos.
- Registra decisões e fechamentos nos canais de log configurados.
- Atualiza os painéis existentes quando o bot inicia.
- Salva as alterações localmente e sincroniza um snapshot atual no Supabase, quando configurado.

## Requisitos

- Node.js 22 ou superior.
- Aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications).
- Permissões do bot: View Channels, Send Messages, Read Message History, Embed Links, Attach Files e Manage Channels.
- Escopos OAuth2: `bot` e `applications.commands`.

O Message Content Intent não é necessário.

## Instalação

### Windows 10/11

1. Extraia o projeto.
2. Execute `INSTALAR.bat` para instalar as dependências.
3. Execute `INICIAR.bat`.
4. Na primeira inicialização, informe o token do bot e o Application ID no terminal.
5. Configure o Supabase quando solicitado ou continue usando somente o armazenamento local.

O assistente cria o arquivo `.env` automaticamente. As credenciais ficam no computador onde o bot é executado.

### Linux

```bash
bash setup-linux.sh
./start-linux.sh
```

A primeira inicialização também cria o `.env` de forma interativa.

## Configuração no Discord

Depois que o bot estiver online, use `/configurar` para definir os canais de suporte, loja, logs e compradores, além do cargo da equipe.

Comandos administrativos:

- `/configurar`: configura canais e equipe.
- `/pix`: define a chave Pix e as instruções de pagamento.
- `/kit listar`: exibe o catálogo.
- `/kit preco`: define o preço de um kit marcado como “A definir”.
- `/kit adicionar`: cadastra um kit.
- `/kit remover`: remove um kit.

## Kits iniciais

| Kit | Preço |
|---|---:|
| Keep | R$ 125,00 |
| Ferro | R$ 15,00 |
| Dima | R$ 25,00 |
| Netherita | R$ 30,00 |
| Elytra | A definir |
| Construção | A definir |

Elytra e Construção ficam indisponíveis para compra até que um administrador defina seus preços.

## Armazenamento e Supabase

O arquivo `data/state.json` é atualizado localmente antes de qualquer sincronização remota. O Supabase é opcional e guarda somente o snapshot atual do estado; não é usado como histórico de tickets encerrados.

Para ativar a integração:

1. Execute `supabase/001_asthen_bot_state.sql` no SQL Editor do projeto Supabase.
2. Informe a Project URL e a Secret API Key `sb_secret_...` durante a configuração inicial.
3. Use a URL base do projeto. O bot normaliza URLs que terminam em `/rest/v1` ou `/v1`.

Consulte [docs/SUPABASE.md](docs/SUPABASE.md) para detalhes sobre a sincronização e o backup local.

## Estrutura

- `src/`: comandos, menus, tickets, loja, integrações e inicialização.
- `assets/`: imagens estáticas usadas pelo bot.
- `supabase/`: SQL para criar a tabela de estado.
- `docs/`: instruções de instalação, comandos e banco de dados.
- `data/`: backup local gerado durante a execução.

## Verificação

```bash
npm install
npm run check
npm run check:commands
```

Os testes automatizados verificam a normalização da URL do Supabase. O workflow do GitHub Actions também valida sintaxe e definições dos comandos.

## Segurança

Nunca publique o arquivo `.env`. Ele contém o token do Discord e a chave secreta do Supabase. Não compartilhe esses valores nem os coloque em issues, prints ou commits.

