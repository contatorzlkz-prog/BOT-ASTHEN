# Supabase — ASTHEN BOT 2.9.0

O Supabase é opcional. Quando configurado, o bot mantém um snapshot de dados e uma tabela normalizada para os kits de cada servidor Discord.

## 1. Criar as tabelas

No painel do Supabase, abra **SQL Editor**.

### Projeto novo

Abra o arquivo [`supabase/SETUP.sql`](../supabase/SETUP.sql), copie todo o conteúdo e execute. Esse único script cria:

- `public.asthen_bot_state`: uma linha com `id = 'main'` e o snapshot do estado do bot.
- `public.asthen_bot_kits`: uma linha por kit e servidor Discord.

O script usa `IF NOT EXISTS` e pode ser executado novamente sem recriar as tabelas.

### Projeto que já tinha a tabela de kits

Se você já executou os arquivos 001 e 002 de uma versão anterior, execute [`supabase/003_asthen_bot_kit_catalog_status.sql`](../supabase/003_asthen_bot_kit_catalog_status.sql). Essa migração adiciona os campos novos sem apagar os registros existentes.

Os arquivos separados também continuam disponíveis:
- `001_asthen_bot_state.sql`
- `002_asthen_bot_kits.sql`
- `003_asthen_bot_kit_catalog_status.sql`

## 2. Configurar o .env

Use a URL base do projeto, sem `/rest/v1` nem `/v1` no final:

~~~env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
SUPABASE_KITS_TABLE=asthen_bot_kits
~~~

O bot também reconhece as variáveis antigas `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_KEY`. A Secret API Key deve ficar somente no computador/servidor onde o bot roda.

## 3. O que cada tabela guarda

### asthen_bot_state

Guarda uma cópia do estado completo do bot, incluindo configurações dos servidores, tickets e compras em preparação.

### asthen_bot_kits

Guarda o catálogo por servidor Discord:

| Coluna | Conteúdo |
|---|---|
| `guild_id` | ID do servidor Discord. |
| `kit_id` | ID interno e estável do catálogo do bot. |
| `plugin_name` | Identificador exato recebido do Plugin-ASTHEN. |
| `display_name` | Nome apresentado ao cliente. |
| `description` | Descrição comercial editada no Discord. |
| `price` | Preço configurado para a loja. |
| `image_url` | URL HTTPS da imagem comercial. |
| `plugin_enabled` | Informa se o kit está ativo no Minecraft. |
| `store_configured` | Informa se os dados comerciais já foram cadastrados. |
| `manually_unavailable` | Registra bloqueio manual de novas compras. |
| `missing_from_plugin` | Marca kits que deixaram de aparecer na lista do plugin. |
| `item_count` | Quantidade de itens reportada pelo plugin. |
| `updated_at` | Última atualização da linha. |

## 4. Como a sincronização funciona

- Cada alteração é salva primeiro em `data/state.json`.
- O bot envia o snapshot para `asthen_bot_state` e faz upsert dos kits em `asthen_bot_kits`.
- Quando o plugin envia a lista completa por `POST /plugin/v1/kits`, o bot importa os kits novos.
- A sincronização preserva nome comercial, preço, descrição, imagem e estado de cadastro.
- O estado recebido do plugin fica separado da disponibilidade comercial definida pela equipe.
- Se um kit deixar de aparecer na lista do plugin, ele continua armazenado e visível como indisponível. O bot não apaga registros antigos de kits ou pedidos.
- Se a equipe usar `/kit remover`, o produto fica indisponível para compras futuras, mas os dados são preservados.
- Quando o Supabase está indisponível, o arquivo local continua sendo usado e o bot tenta sincronizar novamente.

O Plugin-ASTHEN é a origem dos itens reais no Minecraft. O bot não cria os itens dentro do jogo.

## 5. Cabeçalhos e chaves

Para uma chave `sb_secret_...`, o bot envia a credencial no cabeçalho `apikey`, sem tratá-la como JWT no cabeçalho `Authorization`. Chaves antigas `service_role` continuam sendo enviadas como Bearer JWT.

Uma Secret API Key tem acesso administrativo. Use-a somente no backend do bot. Nunca a coloque no GitHub, em páginas públicas, prints ou mensagens.

## 6. Diagnóstico

- **401/403:** confira a URL base e se a credencial é uma Secret API Key ou uma chave antiga `service_role`.
- **404 / tabela não encontrada:** confira se o SQL foi executado e se os nomes em `SUPABASE_TABLE` e `SUPABASE_KITS_TABLE` estão corretos.
- **PGRST125 / Invalid path specified:** retire `/rest/v1` e `/v1` do final da URL.
- **Sem conexão:** confira a rede e o estado do projeto. O bot continua usando o backup local.

O comando `/bridge status` mostra se o Supabase está configurado e apresenta a última sincronização ou o aviso mais recente.

Nunca compartilhe o conteúdo do `.env` ao pedir ajuda.
