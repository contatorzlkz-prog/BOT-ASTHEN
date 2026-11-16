# Supabase — ASTHEN BOT 2.14.0

Para iniciar o bot e controlar o limite semanal da loja, o projeto precisa de três tabelas e uma função SQL. A lista de kits não é gravada em uma tabela separada: ela chega do Plugin-ASTHEN, fica dentro do snapshot `asthen_bot_state.payload` e também é salva localmente em `data/state.json`.

## 1. O que executar no Supabase

1. Abra o projeto no Supabase.
2. Entre em **SQL Editor** e crie uma consulta nova.
3. Abra `supabase/SETUP.sql` neste repositório, copie o arquivo inteiro e cole no SQL Editor.
4. Execute uma única vez e confira se aparece sucesso.

O script é idempotente: usa `CREATE TABLE IF NOT EXISTS` e `CREATE OR REPLACE FUNCTION`, sem apagar registros. Pode ser executado novamente se precisar atualizar a estrutura.

Ele cria somente:

| Objeto | Para que serve |
|---|---|
| `asthen_bot_state` | Snapshot de configurações, kits sincronizados, tickets e compras em preparação. |
| `asthen_bot_weekly_stock` | Quantidade reservada de cada kit por servidor e semana. |
| `asthen_bot_stock_reservations` | Registro idempotente das reservas por pedido. |
| `reserve_asthen_weekly_kit_stock(...)` | Reserva uma unidade de forma atômica, sem ultrapassar o limite de 10. |

**Não crie manualmente `asthen_bot_kits` para esta versão.** O bot 2.14.0 não usa essa tabela. Se ela existir de uma versão antiga, pode permanecer no banco: o bot simplesmente não a consulta nem tenta gravar nela.

## 2. O que colocar no `.env`

Preencha somente estas três linhas para usar os nomes padrão:

~~~env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=sb_secret_SUA_CHAVE
SUPABASE_TABLE=asthen_bot_state
~~~

`SUPABASE_URL` é a URL base do projeto, sem `/rest/v1` no final. Use uma Secret API Key no backend do bot; não coloque essa chave em páginas públicas, no Discord ou no GitHub.

`SUPABASE_TABLE` é opcional quando o nome padrão `asthen_bot_state` é utilizado. O bot também reconhece `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_KEY` por compatibilidade, mas prefira `SUPABASE_SECRET_KEY`.

Não precisa configurar `SUPABASE_KITS_TABLE`. Essa variável deixou de ser utilizada.

## 3. O que acontece quando o Minecraft está offline

O bot pode iniciar e manter Discord, tickets, configuração e painel mesmo sem o plugin conectado. O catálogo mostra um único **Kit Demonstração**, que serve somente para visualizar o fluxo da loja. Ele não cria compra, ticket de pagamento, reserva de estoque, Pix ou entrega.

Quando o Plugin-ASTHEN conectar e enviar a lista, o demo desaparece e o catálogo passa a mostrar os kits reais sincronizados do Minecraft. Não é necessário cadastrar o kit novamente pelo Discord.

Para aprovar compras reais, o Supabase precisa estar disponível porque o estoque semanal é reservado no banco. A falha do plugin, por si só, não deve provocar chamadas à tabela de estoque enquanto só existir o demo.

## 4. Limite semanal

Cada kit tem até 10 unidades por semana, por servidor Discord. A semana começa no domingo às 00:00 no fuso `America/Sao_Paulo`. A reserva só acontece quando a equipe aprova o pagamento; abrir catálogo ou ticket não consome unidade.

A função SQL garante que duas aprovações simultâneas não reservem a mesma última unidade. O `request_id` do ticket evita descontar duas vezes quando a aprovação é repetida.

## 5. Diagnóstico

- HTTP 404 ao consultar estoque: execute novamente `supabase/SETUP.sql`.
- RPC não encontrada: confirme se `public.reserve_asthen_weekly_kit_stock` existe.
- Permissão negada: confira a Secret API Key do backend e não use chave pública `anon`.
- HTTP 400 ao salvar kits: a versão 2.14.0 não grava mais numa tabela separada `asthen_bot_kits`; atualize o bot e confira se o `.env` contém a URL base e a chave corretas.
- Bot sem plugin: o estado local continua em `data/state.json`; o catálogo usa o demo visual até a primeira sincronização.

Não apague `asthen_bot_state`, `asthen_bot_weekly_stock` ou `asthen_bot_stock_reservations` se quiser preservar os dados e o histórico de reservas. Nunca compartilhe o `.env` ao pedir ajuda.
