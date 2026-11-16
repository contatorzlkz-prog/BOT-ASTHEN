# ASTHEN BOT 2.15.0 — Contrato técnico com Plugin-ASTHEN 1.2.0 / 1.3.0 + BOT-ASTHEN 2.15.0

Este documento descreve a integração atualmente esperada entre o bot Discord e o plugin Minecraft. O Plugin-ASTHEN 1.2.0 já implementa o contrato de preço, disponibilidade e entrega em Shulker Box. Não reescreva o plugin nem duplique no bot as responsabilidades que pertencem ao Minecraft.

## 1. Responsabilidade de cada projeto

**Plugin-ASTHEN (Paper):**
- Cria e armazena os kits reais e seus ItemStacks.
- Define preço em reais e controla ativação/desativação.
- Envia `price`, `price_cents` e `for_sale` ao bot.
- Valida plataforma Java/Bedrock e executa a entrega no inventário.
- Entrega o kit em uma Shulker Box e mantém entregas pendentes quando o inventário está cheio.

**ASTHEN BOT (Discord):**
- Exibe o catálogo, nome comercial, descrição e imagem.
- Lê o preço oficial em centavos e respeita `for_sale`.
- Abre ticket, apresenta Pix, registra a decisão da equipe e solicita entrega.
- Mantém o identificador `request_id` para impedir duplicidade.

O bot não cria, modifica ou serializa itens do Minecraft. O preço também não pode ser editado pelo Discord.

## 2. Requisitos de rede e chave compartilhada

- O bot executa a API HTTP local em `127.0.0.1:8787`.
- O plugin executa dentro de um servidor Paper em outro computador ou host.
- O plugin usa modo `poll` e inicia conexões HTTPS de saída para o endereço público que encaminha ao bot.
- O segredo precisa ser idêntico nos dois lados: `DKB_SECRET` no `.env` do bot e `bridge.secret` no `config.yml` do plugin.

O bot gera `DKB_SECRET` uma vez e o mantém no arquivo `.env`. Use esse valor como referência e copie-o localmente para `bridge.secret`. Nunca publique ou envie o segredo em mensagens, prints, tickets ou no GitHub.

Para teste entre computadores, use um túnel HTTPS direcionado a `http://127.0.0.1:8787`. Não use localhost no computador Minecraft para tentar alcançar o PC do bot.

## 3. Rotas HTTP

Todas as rotas exigem:

~~~http
Authorization: Bearer <DKB_SECRET>
~~~

### Buscar pedidos

~~~http
GET /plugin/v1/pull?limit=5
~~~

Sem pedido, o bot responde HTTP 204. Com pedidos, retorna uma lista contendo `request_id`, `player`, `platform` e `kit`.

### Devolver resultado

~~~http
POST /plugin/v1/result
Content-Type: application/json
~~~

O plugin devolve o objeto final com `request_id`, `final: true`, `success`, `status`, `player`, `platform`, `kit` e `message`.

### Sincronizar catálogo

~~~http
POST /plugin/v1/kits
Content-Type: application/json
~~~

O plugin envia a lista completa de kits ao iniciar, depois de alterações e periodicamente. O bot reconcilia a lista sem apagar os registros comerciais antigos.

### Long Polling — BOT-ASTHEN 2.15.0 (suporte do plugin previsto na 1.3.0)

O GET tradicional continua disponível:

~~~http
GET /plugin/v1/pull?limit=5
~~~

O BOT-ASTHEN 2.15.0 também aceita:

~~~http
GET /plugin/v1/pull?limit=5&wait_ms=20000
~~~

- O bot aceita wait_ms de até 25.000 ms; o plugin deve usar 20.000 ms.
- Se houver pedido, o bot responde HTTP 200 com {"requests":[...]}.
- Se não houver pedido até o fim do tempo, responde HTTP 204 sem corpo.
- HTTP 204 é fila vazia normal, não falha.
- O plugin deve configurar timeout HTTP superior à espera; valor recomendado: 35 segundos.
- O BOT-ASTHEN 2.15.0 continua compatível com o plugin 1.2.0, que não envia wait_ms.
- A economia de consultas só acontece quando o plugin 1.3.0 ou posterior implementa Long Polling.
- O prompt completo está em [prompt completo do Plugin-ASTHEN 1.3.0](../prompts/PLUGIN-ASTHEN-1.3.0-CORRECOES.md).

## 4. Contrato de preço e disponibilidade — versão 1.2.0

Exemplo de kit ativo, com preço e disponível para venda:

~~~json
{
  "name": "Kit_Ferro",
  "enabled": true,
  "items": 12,
  "price": 29.9,
  "price_cents": 2990,
  "for_sale": true
}
~~~

Exemplo de kit sem preço:

~~~json
{
  "name": "Kit_Sem_Preco",
  "enabled": true,
  "items": 8,
  "price": null,
  "price_cents": null,
  "for_sale": false
}
~~~

O significado dos campos:
- `name`: identificador técnico, usado pelo bot ao solicitar a entrega.
- `enabled`: estado de ativação no Minecraft.
- `items`: quantidade de itens armazenados no kit.
- `price`: representação do preço em reais.
- `price_cents`: valor inteiro em centavos e fonte de precisão para o bot.
- `for_sale`: verdadeiro somente quando o kit está ativo e tem preço.

Comandos do plugin:
- `/dk price <nome> <valor>`: define ou altera o preço. Vírgula e ponto são aceitos; limite de R$ 999.999,99.
- `/dk price <nome> remover`: remove o preço e tira o kit da venda, sem apagar o kit nem os itens.
- `/dk enable <nome>`: ativa o kit.
- `/dk disable <nome>`: desativa o kit.
- `/dk toggle <nome>`: atalho para alternar a ativação.

O bot usa `price_cents` em vez de recalcular o valor a partir do decimal `price`. Quando recebe `price_cents: null` ou `for_sale: false`, deve limpar o preço de venda anterior e impedir novas compras. Nunca pode manter um preço antigo do Discord como substituto do preço removido no plugin.

O BOT-ASTHEN 2.15.0 não aplica bloqueio manual nem remove kits pelo Discord. O estado de venda vem exclusivamente de `enabled` e `for_sale` enviados pelo plugin.

## 5. Fluxo de cadastro comercial

1. Um administrador cria o kit real no Paper segurando a Shulker Box preenchida e usa `/dk create <nome>`.
2. Define o preço e a ativação no Minecraft, com os comandos do plugin.
3. O plugin envia a lista para `POST /plugin/v1/kits`.
4. O bot importa o kit automaticamente e ele aparece na loja Discord.
5. No Discord, um administrador usa `/kit editar` para definir nome exibido, descrição e imagem HTTPS; `/kit listar` confere o estado.
6. O identificador técnico recebido do plugin não deve ser alterado pelo nome comercial.

A sincronização precisa preservar os campos comerciais criados no Discord, mas substituir o preço e a disponibilidade de acordo com o contrato enviado pelo plugin.

## 6. Entrega em Shulker Box

O Plugin-ASTHEN 1.2.0:
- Armazena os dados originais dos itens nos slots da caixa cadastrada.
- Cria uma Shulker Box da mesma cor da caixa original, com o nome do kit.
- Coloca os itens nos mesmos slots originais e entrega a caixa como um único item.
- Requer um slot livre no inventário.
- Se a caixa não couber, guarda o kit completo como pendente; não entrega apenas parte dos itens.
- Permite retirar o kit pendente com `/dk claim` ou no evento de entrada, conforme configuração.

O bot deve considerar sucesso somente para `KIT_DELIVERED` ou `KIT_PENDING`. Para `KIT_PENDING`, informe que o jogador precisa retirar a Shulker Box. A mensagem de sucesso deve deixar claro que a entrega foi feita dentro de uma Shulker Box.

**Validação ainda pendente:** o build do GitHub Actions compila contra a dependência Paper real configurada no Maven, mas não prova o comportamento em jogo. A montagem, abertura da caixa, preservação dos slots e retirada com inventário cheio precisam ser testadas em um servidor Paper real.

## 7. Idempotência e segurança

- Cada compra possui um `request_id` único.
- Timeout ou resposta perdida: repetir com o mesmo `request_id`.
- Não gerar outro ID só porque a primeira chamada expirou.
- Nunca anunciar sucesso se o plugin não retornou `KIT_DELIVERED` ou `KIT_PENDING`.
- Não executar comandos arbitrários recebidos por HTTP.
- Não registrar o segredo em logs nem em mensagens do Discord.

## 8. Checklist de integração

- [ ] `DKB_SECRET` do bot é igual a `bridge.secret` no plugin.
- [ ] A URL HTTPS do túnel encaminha para a API do bot.
- [ ] O plugin sincroniza a lista completa de kits.
- [ ] `price_cents` é mostrado corretamente, inclusive em valores como 29,90.
- [ ] `/dk price <nome> remover` torna o produto indisponível no Discord.
- [ ] `/dk disable` bloqueia novas compras; `/dk enable` reabre quando existe preço.
- [ ] Um pagamento de teste gera uma única entrega.
- [ ] A Shulker Box chega com nome, cor e itens nos slots esperados.
- [ ] Com inventário cheio, o kit fica pendente e `/dk claim` entrega a caixa completa.
- [ ] Repetir o mesmo `request_id` não duplica a entrega.

## 9. Preservar em futuras alterações

- PIX fixo e QR Code do bot.
- Fluxo de tickets, aprovação manual e logs.
- Java/Bedrock e validação via Floodgate.
- Chave compartilhada estável.
- Catálogo histórico, pedidos e sincronização Supabase.
- Fila de entrega, repetição com o mesmo `request_id` e proteção contra duplicidade.
