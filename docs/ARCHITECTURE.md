# Arquitetura do ASTHEN BOT

## Partes do sistema

| Parte | Responsabilidade |
|---|---|
| Bot Discord (`src/`) | Comandos, painéis, catálogo comercial, tickets e aprovação manual. |
| Bridge HTTP (`bot-integration/`, `src/bridge.js`) | Recebe a lista completa de kits e mantém a fila de pedidos de entrega. |
| Plugin-ASTHEN | Cria e mantém os kits reais, informa quais estão ativos e executa as entregas no Minecraft. |
| Estado local (`data/state.json`) | Backup local de configurações, tickets e catálogo. |
| Supabase (opcional) | Backup remoto e tabela organizada para consultar os kits por servidor. |

## Quem é responsável por cada dado

**Plugin Minecraft**
- Identificador técnico e itens dentro do kit.
- Estado ativo/desativado no servidor.
- Preço oficial em centavos e regra `for_sale`.
- Entrega em uma Shulker Box com o nome do kit e os itens preservados.

**Bot Discord**
- Nome comercial exibido ao comprador.
- Descrição comercial e URL HTTPS da imagem.
- Bloqueio manual adicional da loja e fluxo de pagamento.
- Exibição do preço exato recebido em `price_cents` (não define o valor).

O bot não edita os itens do Minecraft. Um kit real nasce no plugin; o bot só o cadastra na loja depois de receber sua identificação pela bridge.

## Fluxo de cadastro

~~~text
Administrador cria kit no Paper
          |
          v
Plugin envia POST /plugin/v1/kits
          |
          v
Bot importa/atualiza o catálogo
          |
          v
Administrador usa /kit criar
          |
          v
Nome comercial + descrição + imagem (preço vem do plugin)
          |
          v
Produto aparece na loja do Discord
~~~

Para mudanças pontuais, use `/kit editar`. Para bloquear compras, use `/kit remover`. Um kit que some da lista ou fica desativado no plugin é mantido no catálogo como indisponível, sem apagar seus dados antigos.

## Fluxo de compra e entrega

1. O cliente seleciona o kit e confere a prévia.
2. Informa o nick e escolhe Java ou Bedrock.
3. O bot cria um ticket privado e exibe os dados Pix.
4. A equipe confere o comprovante manualmente.
5. Um administrador ou membro com o cargo de equipe aprova o pedido.
6. O bot envia `request_id`, jogador, plataforma e identificador técnico do kit à bridge.
7. O plugin consulta a fila, monta a Shulker Box do kit e entrega um único item ao jogador.
8. Se não houver espaço, o plugin guarda o kit completo como pendente; o jogador pode retirá-lo com `/dk claim`.
9. O bot informa o resultado no ticket e registra a decisão.

Em caso de timeout, o bot repete uma vez com o mesmo `request_id`. O plugin deve tratar esse identificador como idempotente para impedir uma segunda entrega da mesma compra.

## Bridge persistente — versão 2.13.0

A fila de entregas deixa de depender somente de uma Map em memória e passa a manter o diário local em data/bridge-queue.json. O pedido é salvo antes de ser oferecido ao plugin. O registro conserva request_id, payload, ticket/guild, status, lease, tentativas e resultado.

Quando o bot reinicia, leases do processo anterior são liberados para nova consulta pelo plugin com o mesmo request_id. Resultado final é salvo antes do HTTP 2xx. Arquivo corrompido impede a inicialização da Bridge e é preservado para recuperação, em vez de virar fila vazia.

O endpoint POST /plugin/v1/delivery-update recebe a transição autenticada de KIT_PENDING para KIT_DELIVERED. Ele só aceita request_id já conhecido e não reserva estoque novamente. A atualização do ticket é idempotente e pode ser reprocessada depois de um reinício.

A fila deve ser preservada junto com a pasta data/ ao atualizar ou mover o bot. Use apenas uma instância do bot por diretório de dados; não compartilhe o mesmo arquivo de fila entre processos simultâneos.

## Supabase e backup

O estado local é salvo primeiro em `data/state.json`. O Supabase recebe:
- `asthen_bot_state`: snapshot do estado.
- `asthen_bot_kits`: uma linha por kit e servidor Discord.

A tabela normalizada diferencia o estado recebido do plugin de disponibilidade e configuração comerciais. Kits antigos não são removidos quando o plugin deixa de reportá-los.

O Supabase é opcional. Sem conexão, o bot mantém o backup local e tenta sincronizar novamente.

## Segurança

- `DISCORD_TOKEN`, `DKB_SECRET` e `SUPABASE_SECRET_KEY` ficam apenas em `.env`.
- O mesmo `DKB_SECRET` é configurado localmente em `bridge.secret` no plugin.
- O segredo não aparece nos comandos ou nas mensagens do Discord.
- A API do bot fica por padrão em `127.0.0.1:8787`; conexões de outro computador precisam de um endereço HTTPS seguro, por exemplo um túnel temporário para testes.
- A chave secreta do Supabase é usada somente no backend do bot.
