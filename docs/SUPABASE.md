# Supabase — ASTHEN BOT 2.7.0

O Supabase é opcional para iniciar o bot. Quando configurado, o ASTHEN mantém um backup do estado e uma tabela normalizada para os kits da loja.

## 1. Criar as tabelas

No painel do Supabase, abra **SQL Editor** e execute os arquivos nesta ordem:

1. supabase/001_asthen_bot_state.sql — cria a linha de snapshot do bot.
2. supabase/002_asthen_bot_kits.sql — cria o catálogo de kits por servidor Discord.

A tabela asthen_bot_state armazena uma linha com id = main e um JSON do estado completo.

A tabela asthen_bot_kits armazena uma linha por kit e servidor, incluindo o identificador original recebido do plugin, nome exibido ao cliente, preço, descrição, link da imagem, estado de habilitação, quantidade de itens e horário da última atualização.

## 2. Configurar o .env

Use a URL base do projeto, sem /rest/v1 nem /v1 no final:

~~~env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
SUPABASE_KITS_TABLE=asthen_bot_kits
~~~

O bot também reconhece as variáveis antigas SUPABASE_SERVICE_ROLE_KEY e SUPABASE_KEY. A chave secreta precisa ficar somente no computador/servidor onde o bot roda.

## 3. Como a sincronização funciona

- Cada alteração é salva primeiro em data/state.json.
- O bot envia o snapshot para asthen_bot_state e sincroniza as linhas de asthen_bot_kits.
- Quando o plugin envia a lista completa por POST /plugin/v1/kits, o bot importa kits novos.
- Nome de exibição, preço, descrição e imagem editados pelo Discord são preservados quando o plugin envia a mesma lista novamente.
- Quando um kit some da lista enviada pelo plugin, sua linha normalizada é removida do catálogo e da tabela Supabase.
- Se o administrador usar /kit remover, o produto fica oculto da loja, mesmo que o plugin continue reportando o kit.
- Quando o Supabase está indisponível, o arquivo local é mantido e o bot tenta sincronizar novamente com intervalo progressivo.

O catálogo sincronizado tem como origem os arquivos reais de kits do Plugin-ASTHEN. O bot não cria itens dentro do Minecraft.

## 4. Cabeçalhos e chaves

Para uma chave sb_secret_..., o bot envia a credencial no cabeçalho apikey, sem tratá-la como JWT no cabeçalho Authorization. Chaves antigas service_role continuam sendo enviadas como Bearer JWT.

Uma Secret API Key tem acesso administrativo. Use-a somente no backend do bot. Nunca coloque essa chave no GitHub, prints ou mensagens.

## 5. Diagnóstico

- 401/403: confira a URL base e se a credencial é uma Secret API Key ou uma chave antiga service_role.
- 404 / tabela não encontrada: confira se os dois arquivos SQL foram executados e se os nomes em SUPABASE_TABLE e SUPABASE_KITS_TABLE estão corretos.
- PGRST125 / Invalid path specified: retire /rest/v1 e /v1 do final da URL.
- Sem conexão: confira a rede e o estado do projeto. O bot continua usando o backup local.

O comando /bridge status mostra se o Supabase está configurado e apresenta a última sincronização ou o aviso mais recente.

Nunca compartilhe o conteúdo do .env ao pedir ajuda.
