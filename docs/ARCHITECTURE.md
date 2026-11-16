# Arquitetura do ASTHEN BOT 2.14.0

## Componentes

| Parte | Responsabilidade |
|---|---|
| `src/` | Bot Discord, loja, comandos, tickets, pagamentos e aprovação manual. |
| `bot-integration/` | API HTTP, Long Polling e fila persistente de entregas. |
| Plugin-ASTHEN | Origem dos kits, itens, preço, disponibilidade e entrega no Minecraft. |
| `data/state.json` | Backup local de configurações, catálogo sincronizado e tickets. |
| `data/bridge-queue.json` | Fila local persistente de pedidos de entrega. |
| Supabase | Snapshot remoto e controle transacional do estoque semanal. |

## Origem dos dados

**Minecraft / Plugin-ASTHEN**
- Cria os kits e define seus itens.
- Define preço, ativação e disponibilidade de venda.
- Envia a lista completa ao bot em `POST /plugin/v1/kits`.
- Executa a entrega da Shulker Box e mantém pendências.

**Discord / BOT-ASTHEN**
- Importa automaticamente os kits recebidos do plugin.
- Permite editar somente nome exibido, descrição e imagem comercial.
- Mostra o catálogo, cria tickets e recebe a conferência manual dos pagamentos.
- Não cria kits e não altera o preço nem os itens reais do Minecraft.

## Sincronização dos kits

~~~text
Administrador cria o kit no Minecraft
              |
              v
Plugin envia POST /plugin/v1/kits
              |
              v
Bot reconcilia a lista no state.json
              |
              v
Kit aparece automaticamente na loja Discord
              |
              v
Administrador usa /kit editar (nome, descrição, imagem)
~~~

Quando o plugin ainda não conectou, a loja mostra um Kit Demonstração local. Ele serve apenas para visualizar a interface e não é persistido, não gera ticket, Pix, reserva de estoque ou entrega. A primeira sincronização real remove o demo.

Os kits são identificados pelo nome técnico do plugin. O nome comercial no Discord não altera esse identificador.

## Compra e entrega

1. O cliente seleciona um kit real disponível e confere a prévia.
2. Informa nick e escolhe Java ou Bedrock.
3. O bot abre um ticket privado com os dados Pix.
4. A equipe confere o comprovante e aprova o pedido.
5. O bot reserva uma unidade do estoque semanal no Supabase.
6. O bot envia `request_id`, jogador, plataforma e kit à Bridge.
7. O plugin consulta a fila e entrega uma Shulker Box com o kit.
8. Se o jogador estiver offline ou sem espaço, o plugin mantém a entrega pendente conforme sua configuração.
9. O bot atualiza o ticket com o resultado do plugin.

Timeout reutiliza o mesmo `request_id`. O plugin deve tratar esse identificador como idempotente para evitar duplicidade.

## Persistência da Bridge

A fila fica em `data/bridge-queue.json` e é gravada antes de entregar um pedido ao plugin. Após reinício, leases antigos são liberados e pedidos sem resultado voltam a ser consultados usando o mesmo `request_id`.

Resultados são persistidos antes da resposta HTTP de sucesso. `POST /plugin/v1/delivery-update` recebe a transição posterior autenticada de `KIT_PENDING` para `KIT_DELIVERED`, quando o plugin 1.3.0 implementar essa chamada.

Preserve toda a pasta `data/` ao atualizar o bot. Use somente uma instância do bot por diretório de dados.

## Supabase

O snapshot completo é salvo em `asthen_bot_state`, incluindo a lista de kits. Não existe mais gravação paralela numa tabela `asthen_bot_kits`.

O estoque usa `asthen_bot_weekly_stock`, `asthen_bot_stock_reservations` e a função `reserve_asthen_weekly_kit_stock(...)`. A reserva é atômica, limitada a 10 unidades por kit e servidor a cada semana, e idempotente por pedido.

Consulte `docs/SUPABASE.md` e execute `supabase/SETUP.sql` para criar a estrutura necessária.

## Segurança

- `DISCORD_TOKEN`, `DKB_SECRET` e `SUPABASE_SECRET_KEY` ficam somente no `.env`.
- O mesmo `DKB_SECRET` é configurado localmente em `bridge.secret` no plugin.
- A API local escuta em `127.0.0.1:8787` por padrão.
- O Supabase usa uma chave secreta de backend; nunca use chave pública `anon` para as operações do bot.
