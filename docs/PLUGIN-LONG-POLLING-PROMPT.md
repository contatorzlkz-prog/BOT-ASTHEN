# Prompt de implementação — Plugin-ASTHEN 1.3.0 / Long Polling

Este documento é um handoff para atualizar o repositório **ElbsxS1/Plugin-ASTHEN**. Ele não significa que a versão 1.3.0 já foi implementada. O código do plugin continua na versão 1.2.0 até que as alterações sejam feitas, testadas e publicadas no próprio repositório do plugin.

O bot correspondente é **BOT-ASTHEN 2.12.0**, no repositório contatorzlkz-prog/BOT-ASTHEN.

Copie todo o conteúdo entre INÍCIO DO PROMPT e FIM DO PROMPT para o agente de programação que terá acesso ao repositório Plugin-ASTHEN.

---

# INÍCIO DO PROMPT

Você vai atualizar o repositório **ElbsxS1/Plugin-ASTHEN**, projeto Java/Paper chamado DiscordKitBridge, da versão 1.2.0 para 1.3.0.

O objetivo principal é implementar Long Polling real, compatível com BOT-ASTHEN 2.12.0, sem quebrar clientes antigos, e melhorar a retirada automática de kits que ficaram pendentes porque o inventário estava cheio.

Não comece escrevendo código. Primeiro leia o projeto e apresente o diagnóstico. Depois implemente em etapas pequenas, rode as verificações e relate somente resultados reais.

## 1. Diagnóstico obrigatório antes de editar

Leia os arquivos completos e os testes existentes. Examine especialmente:

- pom.xml
- src/main/resources/config.yml
- src/main/java/br/asthen/kitbridge/DiscordKitBridge.java
- src/main/java/br/asthen/kitbridge/api/PollClient.java
- src/main/java/br/asthen/kitbridge/core/DeliveryService.java
- src/main/java/br/asthen/kitbridge/core/DeliveryOptions.java
- src/main/java/br/asthen/kitbridge/core/RequestStore.java
- src/main/java/br/asthen/kitbridge/kit/PendingStore.java
- src/main/java/br/asthen/kitbridge/listener/PlayerListener.java
- comandos, classes de configuração, testes, README.md e TESTING.md.

Confirme no próprio repositório:
- versão atual do plugin;
- versão de Java configurada;
- versão da API Paper;
- como o transporte atual agenda pollOnce();
- como o timeout HTTP é aplicado;
- como busy, backoff, outbox, sincronização do catálogo, reload e shutdown funcionam;
- como /dk claim, PlayerJoinEvent e PendingStore funcionam.

Apresente um resumo curto do fluxo atual e dos riscos antes de modificar. Não presuma que a documentação antiga esteja correta quando o código mostrar outra coisa.

## 2. Contrato real do BOT-ASTHEN 2.12.0

O bot mantém a API local em 127.0.0.1:8787. O plugin faz conexões HTTPS de saída para o endereço público do túnel. Não abra uma porta de entrada no servidor Minecraft e não mude a API do bot neste trabalho.

Todas as rotas continuam exigindo:

~~~http
Authorization: Bearer <DKB_SECRET>
~~~

O segredo em bridge.secret precisa ser idêntico ao DKB_SECRET do .env do bot. Copie-o localmente. Nunca coloque segredo, token de túnel ou credencial de VPS no código, logs, documentação pública ou commit.

### Pull com Long Polling

O BOT-ASTHEN 2.12.0 aceita:

~~~http
GET /plugin/v1/pull?limit=5&wait_ms=20000
~~~

Contrato:
- limit aceita de 1 a 20; padrão 5.
- wait_ms é opcional.
- O bot aceita até 25.000 ms por requisição.
- O valor recomendado para o plugin é wait_ms=20000.
- Se já houver pedidos na fila, o bot responde imediatamente.
- Se não houver pedidos, mantém a conexão aberta até um pedido chegar ou o prazo terminar.
- Com pedido: HTTP 200 e JSON {"requests":[...]}.
- Sem pedido até o fim do prazo: HTTP 204 sem corpo.
- Sem wait_ms: comportamento antigo, com HTTP 204 imediato quando a fila está vazia.
- O bot aceita clientes antigos sem wait_ms; não quebre essa compatibilidade.

Outras rotas obrigatórias:
- POST /plugin/v1/result: recebe o resultado do request_id.
- POST /plugin/v1/kits: recebe o catálogo completo, incluindo name, enabled, items, price, price_cents e for_sale.

Preserve Authorization Bearer, payloads, códigos HTTP, request_id, lease/reentrega, idempotência e fluxo atual de resultados.

### Regra crítica de KIT_PENDING

O BOT-ASTHEN remove a solicitação de espera quando recebe o primeiro resultado final com final: true. Portanto, se o plugin responder KIT_PENDING porque o jogador está offline ou com inventário cheio, NÃO envie um segundo resultado final para o mesmo request_id quando o kit for posteriormente retirado do PendingStore.

A entrega posterior continua sendo responsabilidade do PendingStore no plugin. Uma futura notificação posterior no Discord exigiria um contrato novo e uma mudança coordenada no bot; não tente improvisar isso nesta atualização.

## 3. Implementar Long Polling no plugin

Atualize PollClient.java, DiscordKitBridge.java, as classes de configuração e src/main/resources/config.yml.

Adicione estas opções:

~~~yaml
bridge:
  poll:
    url: "https://URL-PUBLICA-DO-TUNEL"
    interval-seconds: 3
    max-per-poll: 5
    connect-timeout: 10
    http-timeout: 35
    long-poll:
      enabled: true
      wait-seconds: 20
~~~

Significado:
- interval-seconds: intervalo usado somente no modo de polling antigo, quando Long Polling estiver desativado.
- max-per-poll: máximo de pedidos solicitados por GET.
- connect-timeout: limite para estabelecer a conexão HTTP.
- http-timeout: timeout total de cada requisição HTTP; precisa ser maior do que a espera do servidor.
- long-poll.enabled: ativa ou desativa o parâmetro wait_ms.
- long-poll.wait-seconds: duração da espera no bot.

Requisitos:
1. Para instalações novas, Long Polling deve vir ativado por padrão.
2. wait-seconds deve ter padrão 20 e ser limitado a 25 segundos.
3. O plugin calcula wait_ms = wait-seconds * 1000 e envia o parâmetro no GET apenas quando Long Polling estiver ativo.
4. O timeout HTTP efetivo precisa ser no mínimo wait-seconds + 10 segundos. Para 20 segundos, usar 35 segundos.
5. Não reutilize cegamente http-timeout: 10 de uma configuração antiga. Como Bukkit não substitui automaticamente um config.yml que já existe, detecte timeout menor que o necessário, ajuste o timeout efetivo em memória e registre um aviso único e claro dizendo que o administrador deve atualizar o arquivo. Não deixe o plugin falhar a cada pull por timeout prematuro.
6. Use connect-timeout separado, com padrão de 10 segundos, para que uma falha ao conectar não consuma todo o prazo do Long Polling.
7. Com Long Polling desativado, não envie wait_ms e preserve o comportamento antigo baseado em interval-seconds.
8. HTTP 204 é resultado normal: fila vazia, não falha. Não aumente o contador de falhas nem registre erro.
9. HTTP 200 deve continuar processando a lista requests pela pipeline atual.
10. Outras respostas HTTP inesperadas devem continuar usando o tratamento de falhas apropriado.
11. Mantenha uma única requisição pull em andamento por instância do plugin. busy ou proteção equivalente precisa cobrir toda a requisição, inclusive exceções e cancelamentos.
12. Depois de um 200 ou 204 bem-sucedido, em Long Polling, inicie a próxima espera rapidamente, sem aguardar um novo intervalo de 3 segundos. Prefira agendamento assíncrono encadeado de uma única próxima execução, em vez de uma tarefa periódica que desperta a cada segundo enquanto a requisição está aberta.
13. No polling antigo, interval-seconds continua sendo respeitado.
14. Backoff exponencial só deve ser aplicado em falhas reais de rede/HTTP. Preserve limites e logs sem criar loop apertado.
15. pollOnce() e toda operação de rede são bloqueantes ou assíncronas fora da thread principal do Paper. Nunca bloqueie a thread principal.
16. Processamento de ItemStack, inventário e eventos Bukkit continua na thread principal conforme a arquitetura atual.
17. Uma resposta encerrada, cancelada ou com erro deve liberar o estado busy e permitir nova tentativa.
18. Reload e shutdown não podem deixar várias cadeias de polling ativas. Cancele tarefas futuras, invalide callbacks antigos e não agende uma próxima execução depois de stopTransport/onDisable.
19. Preserve flush da outbox, sincronização periódica do catálogo (KITS_SYNC_MS), marcação de kits como dirty, reload e shutdown.
20. Não gere um log a cada HTTP 204. Mantenha logs úteis e limitados.

Não crie tarefas concorrentes para cada ciclo, não crie 20 tarefas por segundo e não faça polling rápido em paralelo com uma conexão Long Poll aberta.

## 4. Pendências por jogador offline e inventário cheio

Preserve:
- kits.require-online: false permite colocar na fila o kit comprado quando o jogador está offline.
- delivery.pending-if-inventory-full: true salva o kit completo quando não existe espaço.
- PendingStore guarda um snapshot completo do kit no momento do pedido.
- /dk claim continua funcionando.
- a tentativa automática já existente no PlayerJoinEvent continua funcionando.
- a remoção da pendência ocorre somente depois da entrega integral bem-sucedida.

### Padrão para novas instalações

Para instalações novas, altere o padrão de kits.require-online para false, porque uma compra aprovada precisa poder ficar pendente até o jogador entrar.

Atenção: instalações existentes já têm config.yml salvo. saveDefaultConfig não substitui arquivos existentes; não afirme que atualizar o JAR altera automaticamente kits.require-online. Documente que o administrador deve mudar explicitamente para false no próprio config.yml e usar /dk reload ou reiniciar.

### Auto-claim quando o inventário liberar espaço

Adicione a opção:

~~~yaml
delivery:
  pending-if-inventory-full: true
  prevent-duplicate: true
  auto-claim-when-space-freed: true
~~~

Quando a opção estiver ativa:
- Detecte ações que podem liberar espaço: InventoryClickEvent, InventoryDragEvent, InventoryCloseEvent, PlayerDropItemEvent, PlayerItemConsumeEvent, BlockPlaceEvent e PlayerItemBreakEvent.
- Inspecione a API Paper 26.3 real e use apenas eventos existentes e adequados.
- Ignore eventos cancelados.
- Use prioridade apropriada para observar o resultado final do evento e agende a tentativa para o próximo tick.
- Antes de tentar, confirme que o jogador está online e que existe pelo menos uma pendência.
- Resolva a plataforma com o mecanismo atual do plugin (Floodgate/Java/Bedrock).
- Reutilize a mesma lógica de /dk claim. Não duplique regras de entrega.
- Use debounce por UUID para impedir múltiplas tentativas no mesmo tick.
- Se o inventário continuar cheio, mantenha a pendência e não repita em loop.
- Não faça varredura contínua de jogadores.
- Não entregue item parcialmente, não jogue itens no chão e não remova o snapshot antes da entrega integral.
- Preserve o PlayerJoinEvent e o comando /dk claim como alternativas.

## 5. Compatibilidade obrigatória

Não regredir:
- comandos /dk existentes, incluindo create/list/info/preview/give/claim/price/enable/disable/toggle/reload/delete, conforme os comandos realmente existentes;
- preview protegido contra retirada de itens;
- suporte Java/Bedrock, Floodgate/Geyser e prefixo configurável;
- autenticação Bearer e validação de payload;
- rate limit, limite de corpo, timeout, logs e segurança;
- RequestStore, PendingStore, persistência e snapshots;
- entrega em Shulker Box com cor, nome, lore, encantamentos, durabilidade, metadados e slots originais;
- catálogo, preço em centavos e status de venda;
- proteção contra duplicidade e request_id repetido;
- respostas HTTP e compatibilidade do bot 2.12.0.

Não adicionar token tunnel.to, token Tailscale, token Cloudflare, credencial de VPS ou domínio pessoal aos arquivos do plugin.

Não alterar o contrato do bot. Se identificar algo que só possa ser resolvido com mudança no bot, documente a limitação e não faça uma alteração unilateral.

## 6. Testes obrigatórios

Amplie a suíte atual sem remover os testes existentes. Sempre que possível, use o servidor HTTP de teste já disponível no JDK, sem adicionar dependências grandes.

Long Polling:
1. Quando ativado, GET envia wait_ms=20000.
2. Quando desativado, GET não envia wait_ms.
3. HTTP 200 com vários pedidos continua funcionando.
4. HTTP 204 é fila vazia normal e não aumenta falhas.
5. Timeout efetivo é maior que wait-seconds.
6. Uma falha de rede libera busy e permite retry com backoff.
7. Nunca há duas chamadas pull simultâneas.
8. Após 200 e 204, a próxima espera começa sem atraso de interval-seconds no modo Long Polling.
9. Reload/shutdown não cria uma segunda cadeia nem deixa uma cadeia antiga reagendar.
10. POST de resultado continua usando /plugin/v1/result.
11. Outbox continua reenviando resultados após falhas.
12. Catálogo continua sendo sincronizado em /plugin/v1/kits.

Entrega:
13. Jogador offline com kits.require-online=false gera KIT_PENDING e recebe ao entrar.
14. Jogador offline com kits.require-online=true mantém o comportamento configurado.
15. Inventário cheio gera KIT_PENDING sem entregar parte dos itens.
16. Ao liberar espaço, auto-claim entrega uma única vez.
17. Se continuar cheio, a pendência permanece.
18. Eventos cancelados não iniciam auto-claim.
19. Dois eventos seguidos não duplicam tentativa/entrega.
20. /dk claim continua funcionando.
21. Restart mantém as pendências e snapshots originais.
22. KIT_PENDING envia somente um resultado final ao bot.

Execute também toda a suíte atual, não apenas os novos testes.

## 7. Configuração, documentação e versão

- Atualize pom.xml para 1.3.0.
- Atualize src/main/resources/config.yml com os novos padrões.
- Atualize README.md, TESTING.md e a documentação de configuração.
- Documente que Long Polling 1.3.0 exige BOT-ASTHEN 2.12.0 ou superior.
- Documente a diferença entre interval-seconds (polling antigo) e wait-seconds (Long Polling).
- Inclua exemplo com wait-seconds: 20 e http-timeout: 35.
- Explique que config.yml existente não é sobrescrito automaticamente.
- Explique como configurar kits.require-online: false em instalações existentes.
- Não coloque uma URL pessoal real no repositório; use https://URL-PUBLICA-DO-TUNEL como placeholder.

## 8. Build, teste real e entrega

- Use o JDK configurado no projeto (atualmente Java 25) e Paper API definida no pom.xml (atualmente Paper 26.3).
- Execute mvn clean test e mvn clean package.
- Verifique o conteúdo do JAR final em target/.
- Separe claramente: testes automatizados, compilação Maven e teste manual em servidor Paper real.
- Não afirme que a Shulker Box ou os eventos foram testados dentro do jogo se um servidor Paper real não foi iniciado.
- Informe os arquivos alterados, resultados de cada comando, testes que passaram/falharam, caminho do JAR e limitações.
- Não invente números de testes, builds, logs ou resultados.
- Não faça commit se algum teste/build estiver quebrado. Se tudo passar, apresente o resumo antes de publicar o commit.

## Critérios de aceite

A atualização só está pronta quando:
- o plugin fica aguardando o bot por até 20 segundos sem consultas vazias frequentes;
- uma compra aprovada acorda o pull que já está aguardando;
- a próxima espera começa rapidamente sem aguardar o intervalo antigo;
- não há timeout prematuro nem polling duplicado;
- reload, shutdown e falhas de rede são tratados;
- pendências de offline e inventário cheio continuam persistentes;
- auto-claim não duplica itens;
- todos os testes e a compilação passam;
- o teste em Paper real é declarado separadamente.

Comece pelo diagnóstico e só depois implemente.

# FIM DO PROMPT

---

Após concluir, atualize o número da versão, o changelog e a documentação no próprio repositório ElbsxS1/Plugin-ASTHEN. Este documento é somente a especificação, não uma confirmação de que o código foi atualizado.