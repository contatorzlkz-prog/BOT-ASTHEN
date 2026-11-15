# Supabase — ASTHEN BOT 2.11.0

O Supabase é obrigatório para aprovar vendas na versão 2.11.0, pois o limite semanal precisa ser protegido por uma transação no banco. O estado geral também continua sincronizado com asthen_bot_state, com cópia local em data/state.json.

## 1. Criar as tabelas e funções

No painel do Supabase, abra SQL Editor.

### Projeto novo

Execute o arquivo completo supabase/SETUP.sql. Ele cria:
- public.asthen_bot_state: snapshot de configurações, tickets e compras em preparação.
- public.asthen_bot_kits: catálogo e apresentação dos kits por servidor Discord.
- public.asthen_bot_weekly_stock: unidades reservadas por kit e semana.
- public.asthen_bot_stock_reservations: registro idempotente de cada compra aprovada.
- A função public.reserve_asthen_weekly_kit_stock(...), usada para reservar uma unidade sem ultrapassar o limite.

### Projeto existente

- Projeto na 2.10.0: execute 005_asthen_bot_weekly_kit_stock.sql.
- Projeto na 2.9.0: execute 004_asthen_bot_plugin_sale_contract.sql e depois 005_asthen_bot_weekly_kit_stock.sql.
- Projeto vindo da 2.7.0: se ainda não aplicou os campos das versões anteriores, execute 003_asthen_bot_kit_catalog_status.sql, depois 004_asthen_bot_plugin_sale_contract.sql e por último 005_asthen_bot_weekly_kit_stock.sql.

As migrações usam IF NOT EXISTS e podem ser repetidas. Não apague as linhas de catálogo ou o snapshot existente.

## 2. Configurar o .env

Use a URL base, sem /rest/v1 nem /v1 no final:

~~~env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
SUPABASE_KITS_TABLE=asthen_bot_kits
~~~

A chave secreta fica somente no computador/servidor onde o bot roda. O backend a envia no cabeçalho apikey; nunca a coloque em páginas públicas ou no Discord. Também são reconhecidas as variáveis antigas SUPABASE_SERVICE_ROLE_KEY e SUPABASE_KEY.

## 3. Como funciona o estoque semanal

Cada kit tem 10 unidades por semana, por servidor Discord. A semana começa no domingo às 00:00 e termina no sábado às 23:59:59, no fuso America/Sao_Paulo (horário de Brasília).

- O catálogo consulta o saldo atual no Supabase e mostra quantas unidades restam.
- A prévia e a revisão da compra também mostram o saldo.
- Abrir um ticket ou enviar um comprovante não consome estoque.
- A unidade é reservada somente quando a equipe confirma o pagamento.
- A função SQL faz a reserva atomicamente. Compras concorrentes não ultrapassam 10.
- O mesmo ticket usa sempre a mesma chave de reserva; repetir uma aprovação ou reiniciar o bot não desconta uma segunda unidade.
- Na virada de domingo, o bot usa uma nova data week_start. Não é necessário agendar uma tarefa para zerar contadores.

As tabelas mantêm o histórico de reservas; não apague asthen_bot_weekly_stock nem asthen_bot_stock_reservations enquanto quiser preservar os registros.

Se o Supabase estiver desligado, sem a migração 005 ou sem a função RPC, o bot impede a aprovação do pagamento. Isso evita confirmar uma compra que não tenha consumido uma unidade do estoque corretamente.

## 4. O que cada tabela guarda

### asthen_bot_state
Snapshot geral do bot, incluindo configurações, tickets, pedidos e compras em preparação.

### asthen_bot_kits
Catálogo do Discord: nome comercial, descrição, preço sincronizado do plugin, imagem, disponibilidade e identificador técnico.

### asthen_bot_weekly_stock
Uma linha por servidor, kit e domingo de início da semana. reserved_count nunca pode ultrapassar weekly_limit (10).

### asthen_bot_stock_reservations
Uma linha por ticket aprovado. A chave única (guild_id, request_id) evita descontar duas vezes o mesmo pedido.

## 5. Diagnóstico

- HTTP 404 ao consultar estoque: execute a migração 005.
- RPC não encontrada: confira se reserve_asthen_weekly_kit_stock foi criada no schema public.
- Permissão negada: confira se o bot está usando uma chave secreta de backend com permissão service_role.
- Estoque não diminui após criar ticket: isso é esperado; a unidade só é reservada quando a equipe confirma o pagamento.
- Bot reiniciou: os saldos continuam no Supabase; o identificador do ticket mantém a reserva idempotente.

Nunca compartilhe o conteúdo do .env ao pedir ajuda.
