# Prompt para atualizar o Plugin-ASTHEN — Long Polling 1.3.0

Este documento contém instruções para o agente que vai alterar o repositório **ElbsxS1/Plugin-ASTHEN**. A versão 1.3.0 ainda não está implementada só porque este prompt existe.

Copie o prompt inteiro a partir de **INÍCIO DO PROMPT**.

---

# INÍCIO DO PROMPT

Atualize o plugin DiscordKitBridge / Plugin-ASTHEN para a versão **1.3.0**, implementando Long Polling real compatível com **BOT-ASTHEN 2.12.0** e melhorando a tentativa de entrega automática de kits que ficaram pendentes por inventário cheio.

## Etapa 1 — Diagnóstico obrigatório

Antes de editar, leia a estrutura e os arquivos relevantes para compreender a arquitetura completa. Examine especialmente:

- src/main/java/br/asthen/kitbridge/api/PollClient.java
- src/main/java/br/asthen/kitbridge/DiscordKitBridge.java
- src/main/resources/config.yml
- src/main/java/br/asthen/kitbridge/core/DeliveryService.java
- src/main/java/br/asthen/kitbridge/kit/PendingStore.java
- src/main/java/br/asthen/kitbridge/listener/PlayerListener.java
- pom.xml, README.md, TESTING.md e todos os testes.

Confirme a versão, Java e Paper usados. Apresente um diagnóstico breve dos arquivos e do fluxo atual antes de alterar. Não reescreva o projeto, não remova recursos e não invente testes/builds.

## Etapa 2 — Contrato do BOT-ASTHEN 2.12.0

O bot mantém sua API local em 127.0.0.1:8787. O plugin continua fazendo somente conexões de saída. Um túnel HTTPS encaminha até a API do bot; não abra porta de entrada no servidor Minecraft.

Todas as rotas mantêm Authorization: Bearer <bridge.secret>. O segredo do plugin precisa ser exatamente o DKB_SECRET do bot, copiado localmente. Nunca coloque credenciais do bot ou do túnel no código, logs ou repositório.

O bot atualizado aceita:

**GET /plugin/v1/pull?limit=5&wait_ms=20000**

- limit aceita 1 a 20 e tem padrão 5.
- wait_ms é opcional; com ele, o servidor mantém o GET aberto até chegar um pedido ou o prazo expirar.
- O máximo aceito pelo bot é 25.000 ms; o valor recomendado é 20.000 ms.
- Quando uma compra é aprovada, o bot acorda imediatamente um GET /pull que esteja aguardando.
- Com pedidos: HTTP 200 com {"requests":[...]}.
- Sem pedidos até o fim do prazo: HTTP 204 sem corpo.
- Sem wait_ms: comportamento antigo, 204 imediato se a fila estiver vazia.
- Clientes antigos continuam compatíveis.

Outras rotas que não podem quebrar:
- POST /plugin/v1/result — resultado do pedido.
- POST /plugin/v1/kits — catálogo com name, enabled, items, price, price_cents e for_sale.

Preserve autenticação, formatos JSON, códigos HTTP, lease/reentrega, request_id e outbox.

**Cuidado com KIT_PENDING:** o bot resolve e remove a solicitação quando recebe o primeiro resultado com final: true. Não tente enviar um segundo resultado terminal para o mesmo request_id depois de KIT_PENDING. A fila local do PendingStore continua responsável pela entrega pendente. Uma notificação posterior no Discord exigiria mudança coordenada no bot, fora deste prompt.

## Etapa 3 — Long Polling no plugin

Altere PollClient.java, DiscordKitBridge.java e config.yml.

Adicione configurações compatíveis com arquivos antigos. Use como referência:

~~~yaml
bridge:
  poll:
    url: "https://ENDERECO-HTTPS-DO-TUNEL"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 35
    long-poll:
      enabled: true
      wait-seconds: 20
~~~

Requisitos técnicos:

1. Long Polling deve vir ativado por padrão em instalações novas.
2. wait-seconds usa 20 por padrão e deve ser limitado a no máximo 25 segundos.
3. http-timeout deve ser pelo menos 5 a 10 segundos maior que wait-seconds. Padrão recomendado: 35 segundos.
4. Com Long Polling ativado, PollClient deve enviar limit e wait_ms=wait-seconds*1000 no GET.
5. Com Long Polling desativado, não envie wait_ms e preserve o modo antigo usando interval-seconds.
6. pollOnce() é bloqueante: execute apenas em tarefa assíncrona, nunca na thread principal do Paper.
7. Preserve busy ou proteção equivalente para nunca haver duas chamadas pull simultâneas.
8. Quando o bot responder 200, processe normalmente os pedidos e envie os resultados pelo fluxo atual.
9. Quando o bot responder 204, isso significa apenas que a espera terminou sem pedidos; não é falha.
10. A próxima chamada deve iniciar rapidamente, voltando a aguardar no servidor. Não crie polling rápido concorrente enquanto o Long Poll está aberto.
11. Pode usar tarefa assíncrona agendada a cada 1 segundo com busy evitando sobreposição, ou um agendador assíncrono encadeado. Escolha a solução mais simples e estável; não crie 20 tarefas por segundo.
12. Preserve backoff exponencial, outbox, flush de resultados, sincronização periódica de kits (KITS_SYNC_MS), reload e shutdown.
13. Uma conexão encerrada, cancelada ou com erro deve liberar busy e permitir retry.
14. Não gere logs de sucesso/204 a cada ciclo nem faça retry em loop apertado.
15. Se o bot atualizado estiver indisponível, o plugin deve se recuperar sem travar o Paper.

O timeout do cliente precisa ser maior que o tempo de espera do servidor. Não defina timeout de conexão/requisição menor que o wait configurado.

## Etapa 4 — Pendências por inventário cheio

Preserve o comportamento atual:

- kits.require-online: false permite criar pendência quando o jogador estiver offline.
- delivery.pending-if-inventory-full: true guarda o kit inteiro se não houver espaço.
- Não entregue parte do kit, não jogue itens no chão e não remova a pendência antes da entrega integral.
- PendingStore mantém persistência e snapshot original do kit.
- /dk claim continua funcionando.

Adicione opção configurável:

~~~yaml
delivery:
  pending-if-inventory-full: true
  prevent-duplicate: true
  auto-claim-when-space-freed: true
~~~

Com auto-claim-when-space-freed ativo, tente entregar a pendência depois que o inventário puder ter liberado espaço. Considere InventoryClickEvent, InventoryDragEvent, InventoryCloseEvent, PlayerDropItemEvent, PlayerItemConsumeEvent, BlockPlaceEvent e PlayerItemBreakEvent, mas inspecione a API Paper real antes de escolher os eventos.

- Ignore eventos cancelados.
- Verifique primeiro se existe pendência.
- Agende a tentativa para o próximo tick, na thread principal, depois de o inventário ser atualizado.
- Use debounce por UUID para impedir múltiplas tentativas no mesmo tick.
- Reutilize a lógica do comando /dk claim.
- Se ainda estiver cheio, mantenha a pendência.
- Não faça polling contínuo nem varredura de todos os jogadores.
- Preserve a tentativa já existente no PlayerJoinEvent.

## Etapa 5 — Compatibilidade obrigatória

Não regredir:
- comandos /dk existentes, preview, claim, price, ativação/desativação e reload;
- Java/Bedrock, Floodgate/Geyser e prefixo configurável;
- autenticação Bearer, validação de payload, rate limit, limite de corpo, timeout e logs;
- entrega exatamente uma vez no jogo e proteção contra pedidos repetidos;
- RequestStore, PendingStore e persistência;
- Shulker Box com cor, nome, lore, encantamentos, durabilidade, metadados e slots preservados;
- catálogo, preços em centavos e status de venda.

Não adicione token tunnel.to, token Cloudflare, credencial de VPS ou URL secreta no plugin. Ele só precisa da URL HTTPS e bridge.secret.

## Etapa 6 — Testes obrigatórios

Adicione testes para:
1. GET contém wait_ms=20000 quando ativado.
2. GET não contém wait_ms quando desativado.
3. 200 com vários pedidos continua funcionando.
4. 204 de expiração é fila vazia, não erro.
5. Timeout HTTP é maior que wait-seconds.
6. Falha de rede libera busy e permite retry.
7. Nunca há duas chamadas pull simultâneas.
8. Resultados continuam em /plugin/v1/result.
9. Outbox continua reenviando depois de falha.
10. Catálogo continua sincronizando.
11. KIT_PENDING, reinício e claim continuam íntegros.
12. Auto-claim após liberar espaço não duplica itens.
13. Inventário ainda cheio preserva a pendência.
14. Eventos cancelados não causam entrega.

Não acrescente dependências desnecessárias. Se precisar, crie abstrações pequenas para injetar cliente HTTP ou relógio.

## Etapa 7 — Documentação e entrega

- Atualize pom.xml para 1.3.0.
- Atualize config.yml, README e TESTING.md.
- Documente dependência do BOT-ASTHEN 2.12.0 para Long Polling.
- Exemplos devem usar wait-seconds: 20 e http-timeout: 35.
- Explique que interval-seconds só controla o polling antigo quando Long Polling estiver desativado.
- Execute mvn clean test e mvn clean package com JDK/Paper corretos.
- Separe claramente compilação/testes automatizados de teste real em Paper. Não diga que Shulker foi testada no jogo se não iniciou um servidor real.
- Informe arquivos alterados, testes aprovados/falhos, comandos executados e caminho do JAR.
- Se Paper 26.3 ou JDK 25 não estiver disponível, informe a limitação. Não invente sucesso.
- Não faça commit se o build estiver quebrado.

## Critérios de aceite

A atualização só está pronta quando o plugin aguarda até 20 segundos sem consultas vazias frequentes, recebe o pedido imediatamente quando o bot o aprova, não sofre timeout prematuro, recupera-se de falhas/reloads sem duplicação e preserva todas as garantias de entrega e persistência.

Comece lendo o repositório e apresentando o diagnóstico. Implemente em mudanças pequenas, rode os testes e relate somente resultados reais.

# FIM DO PROMPT
