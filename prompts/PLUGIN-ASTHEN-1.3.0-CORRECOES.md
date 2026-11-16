# PROMPT — Correções completas do Plugin-ASTHEN 1.3.0

**Repositório:** https://github.com/ElbsxS1/Plugin-ASTHEN  
**Bot correspondente:** https://github.com/contatorzlkz-prog/BOT-ASTHEN  
**Base auditada:** Plugin 1.2.0, Paper 26.3, Java 25  
**Alvo:** Plugin-ASTHEN 1.3.0, compatível com BOT-ASTHEN 2.13.0 e retrocompatível com o polling antigo.

> Este prompt está hospedado no repositório BOT-ASTHEN porque a integração GitHub usada para esta auditoria tem acesso de leitura, mas não de escrita, no repositório Plugin-ASTHEN. O código do plugin não foi alterado por esta publicação.

---

## INÍCIO DO PROMPT

Você vai corrigir e evoluir o projeto **ElbsxS1/Plugin-ASTHEN**, plugin Java/Paper chamado DiscordKitBridge.

O alvo é uma atualização confiável para a versão **1.3.0**. Não faça uma reescrita. Preserve a arquitetura existente sempre que ela estiver correta e corrija as falhas comprovadas abaixo.

O plugin é responsável por cadastrar kits reais a partir de Shulker Boxes, guardar itens e metadados em arquivos locais, entregar a Shulker Box a jogadores Java e Bedrock, impedir entregas duplicadas, manter kits pendentes quando o jogador está offline ou sem espaço e comunicar-se com BOT-ASTHEN pela bridge autenticada.

O BOT-ASTHEN 2.12.0 já aceita Long Polling, mas a integração coordenada de atualização posterior de status será concluída no BOT-ASTHEN 2.13.0. Consulte o prompt irmão no repositório do bot e o contrato conjunto em prompts/INTEGRACAO-ASTHEN-COMPLETA.md.

### 1. Diagnóstico obrigatório

Antes de editar:
1. Leia todo o repositório e o histórico recente.
2. Confirme a versão real do pom.xml, Paper API, Java, configuração, comandos e testes.
3. Leia pelo menos:
   - DiscordKitBridge.java
   - api/PollClient.java
   - api/ApiServer.java
   - core/DeliveryService.java
   - core/RequestStore.java
   - core/RequestRecord.java
   - core/Status.java
   - kit/PendingStore.java
   - kit/KitStorage.java
   - kit/KitData.java
   - kit/KitManager.java
   - listener/PlayerListener.java
   - bukkit/BukkitGame.java
   - bukkit/KitSerializer.java
   - bukkit/PlatformManager.java
   - commands/KitCommand.java
   - config.yml, plugin.yml, README.md, TESTING.md e TestMain.java.
4. Apresente um diagnóstico objetivo com bug confirmado, risco, arquivos envolvidos e teste que provará a correção.
5. Se o código atual já tiver corrigido algum item, não reimplemente. Registre a evidência e teste a regressão.

Não altere o repositório BOT-ASTHEN neste trabalho, a menos que esteja em uma branch autorizada e que você também tenha recebido o prompt do bot. Não invente endpoints que não existam na versão do bot em execução.

### 2. Contrato HTTP com o BOT-ASTHEN

Toda conexão usa Authorization: Bearer <DKB_SECRET>. O segredo deve ser igual ao DKB_SECRET do bot. Nunca registre o valor em logs.

Rotas existentes:
- GET /plugin/v1/pull?limit=5
- POST /plugin/v1/result
- POST /plugin/v1/kits

O BOT-ASTHEN 2.12.0 aceita o parâmetro opcional:

~~~http
GET /plugin/v1/pull?limit=5&wait_ms=20000
~~~

Comportamento:
- limit: de 1 a 20.
- wait_ms: opcional; o bot limita a espera máxima a 25.000 ms.
- HTTP 200: retorna {"requests":[...]}.
- HTTP 204: fila vazia após a espera; resposta normal, não é falha.
- Sem wait_ms: mantém o comportamento antigo, retornando 204 imediatamente quando a fila está vazia.

Para a integração posterior do KIT_PENDING, o contrato coordenado do BOT-ASTHEN 2.13.0 adicionará:

~~~http
POST /plugin/v1/delivery-update
Authorization: Bearer <DKB_SECRET>
Content-Type: application/json
~~~

Corpo esperado:

~~~json
{
  "request_id": "ticket-123",
  "status": "KIT_DELIVERED",
  "player": "Jogador",
  "platform": "java",
  "kit": "Kit_Ferro",
  "message": "Kit entregue após retirada da pendência",
  "updated_at": "2026-11-15T20:00:00.000Z"
}
~~~

Não envie uma atualização de sucesso antes de a retirada estar confirmada. O endpoint aceita apenas request_id que o bot já conhece e transições permitidas. A atualização é idempotente.

**Regra crítica:** KIT_PENDING continua sendo o resultado final inicial enviado uma única vez em POST /plugin/v1/result. Quando o kit for efetivamente retirado depois, não envie um segundo resultado final em /plugin/v1/result, pois o pedido inicial já foi concluído. Use POST /plugin/v1/delivery-update somente quando o BOT-ASTHEN 2.13.0 estiver instalado. Para bot 2.12.0 ou anterior, não tente chamar um endpoint inexistente.

### 3. Long Polling real no PollClient

A versão 1.2.0 ainda agenda pollOnce() periodicamente e não envia wait_ms. Implemente Long Polling configurável sem quebrar o modo antigo.

Configuração desejada para instalações novas:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: ""
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

Requisitos:
1. long-poll.enabled: true nas instalações novas.
2. wait-seconds padrão 20, limitado a 25 segundos.
3. Quando ativo, enviar wait_ms=wait-seconds*1000.
4. http-timeout precisa ser maior que a espera do servidor; padrão recomendado 35 segundos para espera de 20.
5. connect-timeout separado, padrão 10 segundos.
6. Configuração existente não é sobrescrita por saveDefaultConfig(). Detecte timeout antigo menor que o necessário, ajuste o timeout efetivo em memória e emita um aviso claro e único explicando a atualização manual.
7. Com Long Polling desativado, não envie wait_ms e mantenha interval-seconds.
8. HTTP 204 é sucesso normal. Não contar como falha e não gerar log de erro.
9. HTTP 200 continua pela pipeline existente.
10. Não bloquear a thread principal em nenhuma conexão HTTP.
11. Uma única requisição pull pode ficar ativa por instância. busy deve ser liberado por finally, inclusive em interrupção e erro.
12. No Long Polling, depois de 200 ou 204, agendar a próxima espera rapidamente, sem aguardar mais um intervalo fixo de 3 segundos.
13. Não criar uma tarefa periódica que desperte enquanto uma conexão de Long Polling ainda está bloqueada.
14. Backoff exponencial apenas em falhas reais de rede/HTTP, com limites.
15. /dk reload e onDisable precisam cancelar futuras execuções e impedir callbacks antigos de iniciar outra cadeia.
16. Preservar sincronização do catálogo a cada 5 minutos, markKitsDirty, outbox, logs e shutdown.
17. Evitar logs repetidos de 204 e mensagens por ciclo sem utilidade.

A cadeia de polling deve ser simples, única e observável. Não faça paralelismo por jogador nem uma requisição Long Poll por jogador.

### 4. Outbox persistente e resposta HTTP

Atualmente, os resultados que falham no POST /plugin/v1/result ficam numa Map em memória no PollClient. Se o servidor reiniciar antes do próximo reenvio, o resultado pode ser perdido.

Corrija:
- persistir os resultados aguardando confirmação do bot em arquivo JSON no diretório de dados do plugin;
- usar gravação atômica e validação do arquivo;
- só remover um resultado depois de o bot confirmar a aceitação;
- reenviar com o mesmo request_id e corpo idempotente;
- limitar o lote por ciclo e aplicar backoff;
- restaurar a fila depois de reinício;
- nunca fazer um catch transformar falha de leitura em outbox vazia;
- manter arquivo corrompido preservado e emitir aviso acionável.

Classifique respostas:
- 2xx: aceito; remover da outbox.
- 401/403: erro de autenticação; preservar a resposta, registrar aviso claro e evitar loop de alta frequência.
- 408/429/5xx/rede: preservar e tentar novamente com backoff.
- 404: não descartar silenciosamente. Registrar estado de reconciliação, porque pode indicar pedido desconhecido/expirado ou incompatibilidade de versões. Definir a política com o contrato atual do bot e documentá-la.
- Outra resposta definitiva: classificar e preservar evidência suficiente para diagnóstico.

O sucesso de envio só pode ser registrado quando houver confirmação HTTP válida.

### 5. PendingStore: corrupção, recuperação e integridade

**Bug confirmado:** PendingStore.list() captura qualquer exceção e devolve List.of(). Isso pode fazer uma fila ilegível parecer vazia e esconder kits comprados que estão guardados.

Corrija:
1. Distinguir arquivo inexistente de arquivo corrompido/ilegível.
2. Arquivo inexistente = fila vazia.
3. Arquivo inválido = erro de integridade explícito, log com caminho/identificador não sensível, preservar o arquivo original e impedir que a fila seja tratada como vazia.
4. Criar cópia de recuperação/quarentena com nome e data antes de qualquer reparo.
5. Nunca apagar pendências automaticamente só porque uma leitura falhou.
6. Gravações devem continuar atômicas.
7. Validar estrutura, versão do formato, request_id, kit, slots e conteúdo antes de carregar.
8. Uma pendência deve continuar contendo snapshot completo do kit, sem depender do cadastro original.
9. Limitar tamanho e número de entradas de forma segura, sem remover kits ainda não entregues.

**Risco confirmado na retirada:** claim() entrega o item ao inventário e depois remove a entrada do arquivo. Se a gravação da remoção falhar, a pendência continua e uma nova tentativa pode entregar a mesma caixa novamente.

Implemente um protocolo de retirada recuperável:
- desenhe o estado da entrada (PENDING, CLAIMING, DELIVERY_RECONCILIATION_REQUIRED ou equivalente);
- grave a intenção antes da alteração no inventário;
- dê a cada caixa uma identidade de entrega estável, preferencialmente um marcador PDC namespaced no ItemMeta, que permita detectar uma caixa já entregue;
- antes de repetir uma retirada interrompida, procure o marcador/identidade nos locais suportados e reconcilie o estado;
- se não for possível provar que a caixa não foi entregue, não entregue novamente automaticamente; preserve a pendência e apresente procedimento de reconciliação para a equipe;
- se a retirada for confirmada, grave o estado concluído/tombstone antes de limpar a entrada;
- torne a reconciliação idempotente.

Não prometa exatamente-uma-vez absoluto atravessando ao mesmo tempo o armazenamento em disco e a mutação do inventário sem um protocolo que trate crash no meio. Documente claramente como o plugin evita duplicação e como o administrador resolve um caso ambíguo.

Crie testes para erro de leitura, arquivo corrompido, falha de gravação, crash simulado em cada etapa, repetição do claim, reconciliação após reinício, marcador já presente e preservação de snapshot após edição ou remoção do kit original.

### 6. Auto-claim quando o jogador libera espaço

Hoje as pendências são tentadas no PlayerJoinEvent (depois de 60 ticks) e no /dk claim. O listener de clique/arrasto atual existe apenas para proteger o preview.

Adicione:

~~~yaml
delivery:
  pending-if-inventory-full: true
  prevent-duplicate: true
  auto-claim-when-space-freed: true
~~~

Quando ativo:
- detectar eventos que podem liberar espaço no inventário, usando somente eventos existentes na versão Paper alvo;
- avaliar InventoryClickEvent, InventoryDragEvent, InventoryCloseEvent, PlayerDropItemEvent, PlayerItemConsumeEvent, BlockPlaceEvent e PlayerItemBreakEvent quando forem apropriados;
- ignorar eventos cancelados;
- observar o resultado final e tentar no próximo tick;
- debounce por UUID para impedir várias tentativas no mesmo tick;
- antes de tentar, verificar jogador online e existência de pendência;
- reutilizar exatamente a lógica de /dk claim;
- não entregar parcialmente;
- se continuar sem espaço, manter a pendência e não repetir em loop;
- não fazer varredura periódica de todos os jogadores;
- limpar referências/tarefas do debounce no quit, reload e disable;
- preservar a tentativa automática no join e o comando manual.

A execução de inventário deve continuar na thread principal. Não faça leitura/gravação de inventário em executor assíncrono.

### 7. Identidade de jogador offline e plataforma

O padrão atual kits.require-online: true recusa jogador offline. Com false, o kit fica pendente por nome normalizado e plataforma porque ainda não há UUID.

Melhore sem associar a compra à pessoa errada:
- não use busca aproximada nem correspondência parcial de nick;
- se Floodgate disponibilizar método oficial para resolver UUID/nome, confirme a API real antes de utilizar;
- preserve o par plataforma + nome normalizado;
- trate alteração de nick como situação de reconciliação, não como autorização para entregar a outra pessoa;
- ofereça comando administrativo seguro para listar e diagnosticar pendências sem expor dados sensíveis;
- mantenha kits.require-online configurável e não mude silenciosamente arquivos de configuração existentes;
- novas instalações podem usar false como padrão somente depois que os testes de recuperação por nome/plataforma estiverem aprovados.

### 8. Idempotência e RequestStore

O RequestStore atual mantém histórico persistente com limite de 5.000 registros e retenção de 7 dias. Transições não terminais não são persistidas em todas as atualizações. Ao reiniciar, pedidos em andamento são convertidos em INTERNAL_ERROR.

Melhore:
- persistir os pontos de controle necessários para recuperar uma solicitação;
- preservar o histórico e o request_id;
- não descartar registros associados a kits pendentes ou reconciliação;
- manter idempotência ao receber o mesmo request_id;
- garantir que request_id duplicado nunca crie outra pendência;
- a chave de preventDuplicate deve considerar plataforma, nick normalizado e kit;
- distinguir um pedido realmente novo de uma repetição de transporte;
- em interrupção ambígua durante entrega, não reenviar automaticamente sem reconciliar o inventário;
- manter a retenção configurável para registros terminais e não aplicar limite que apague estados não resolvidos.

Não altere o significado dos status atuais sem atualizar o contrato e os testes do BOT-ASTHEN.

### 9. Caixa, metadados e inventário

Preserve tudo que já funciona:
- conteúdo de cada slot;
- encantamentos;
- nomes, lore, atributos, durabilidade e data components;
- cor/material da Shulker Box;
- nome do kit na caixa;
- entrega de uma única Shulker Box;
- teste de espaço antes de entregar;
- rollback do inventário se a inserção falhar.

A versão atual salva o material/cor da Shulker Box e recria a caixa com o nome do kit. Ela não persiste todo o Meta original da caixa externa. Decida e documente a regra desejada:
- preservar também nome, lore, encantamentos e demais metadados da caixa original quando for seguro; ou
- deixar explícito que somente a cor e os itens internos são preservados e o nome externo sempre será o nome do kit.

Não sacrificar a integridade dos itens internos por causa da aparência da caixa.

### 10. Segurança e comandos

Preserve e teste:
- Bearer authentication com comparação constante;
- validação estrita de request_id, nick, plataforma e nome de kit;
- proteção contra path traversal;
- limites de corpo e rate limit do modo server;
- API server em loopback por padrão;
- alerta sobre HTTP público sem TLS;
- não executar comandos recebidos pela API;
- suporte Floodgate por API oficial/reflexão sem confiar somente em prefixo;
- permissões reais dos comandos.

Corrija o tab completion: hoje a sugestão de kits de vários subcomandos exige discordkitbridge.list, mesmo quando o usuário possui a permissão específica give, price, preview ou delete. A sugestão deve obedecer à permissão real do subcomando sem revelar comandos ou nomes para quem não tem autorização.

Mantenha /dk create, delete, list, info, preview, give, price, enable, disable, toggle, claim, reload e help.

### 11. Configuração e documentação

Atualize config.yml, plugin.yml, README, TESTING e documentação:
- versão 1.3.0;
- requisitos Java/Paper reais;
- connect-timeout, http-timeout, Long Polling;
- configuração do auto-claim-when-space-freed;
- diferença entre polling antigo e Long Polling;
- bot mínimo recomendado: BOT-ASTHEN 2.13.0 para atualização posterior de pendências; Long Polling básico funciona com 2.12.0;
- arquivos de configuração existentes não são sobrescritos automaticamente;
- passo a passo de migração de 1.2.0 para 1.3.0;
- recuperação de arquivo pendente corrompido;
- política de reconciliação quando uma entrega for interrompida;
- URL-base do túnel sem /plugin/v1;
- não inserir URL pessoal, DKB_SECRET ou token de túnel em exemplos.

### 12. Testes e build

Amplie os testes existentes sem remover os 67 testes atuais.

Long Polling:
1. envia wait_ms=20000 quando ativo;
2. não envia wait_ms quando inativo;
3. aceita 200 com lista de pedidos;
4. trata 204 como vazio normal;
5. usa timeout de 35 s e connect timeout de 10 s;
6. não cria duas requisições pull simultâneas;
7. começa próxima espera rapidamente;
8. backoff somente em falhas reais;
9. reload cancela cadeia antiga;
10. disable cancela cadeia e callbacks;
11. resultado HTTP falho permanece na outbox persistente;
12. outbox sobrevive ao reinício.

Pendências:
13. arquivo ausente é fila vazia;
14. arquivo corrompido não vira lista vazia silenciosamente;
15. arquivo original é preservado e recuperável;
16. falha de gravação não causa reentrega automática;
17. retirada confirmada não duplica;
18. crash simulado durante claim exige reconciliação segura;
19. auto-claim no evento entrega uma vez;
20. eventos cancelados não tentam claim;
21. debounce evita chamadas repetidas;
22. inventário ainda cheio mantém a pendência;
23. /dk claim continua funcionando;
24. join continua funcionando;
25. jogador offline com require-online=false recebe ao entrar;
26. alteração de nick não faz associação ambígua;
27. Java e Bedrock não compartilham chave de pendência;
28. snapshot do kit sobrevive a edição/remoção.

Integração:
29. plugin 1.3.0 + bot 2.12.0 continuam no polling/Long Polling sem endpoint posterior;
30. plugin 1.3.0 + bot 2.13.0 envia atualização de KIT_PENDING para KIT_DELIVERED;
31. repetir a atualização é idempotente;
32. bot recusa request_id desconhecido;
33. DKB_SECRET incorreto não apaga outbox;
34. reiniciar plugin e bot durante entrega não cria duplicidade.

Execute:
- ./scripts/run-tests.sh;
- mvn clean test;
- mvn clean package;
- inspeção do JAR final;
- workflow GitHub Actions.

Separe claramente testes JDK-only, build Maven e teste em servidor Paper real. Não declare Floodgate, ShulkerBox, inventário, eventos ou comandos como testados dentro do jogo sem realmente usar um servidor Paper 26.3 e os cenários documentados.

### 13. Publicação

- Use branch de trabalho.
- Não faça commit em main sem revisão.
- Não publique JAR se houver teste falhando.
- Informe todos os arquivos alterados, resultados, limitações e migração.
- Não invente contagem de testes nem declare sucesso sem log real.
- Abra Pull Request para revisão.

### Critérios de aceite

A versão 1.3.0 só pode ser chamada de pronta se:
- Long Polling funcionar sem consultas vazias frequentes;
- não houver polling concorrente;
- outbox sobreviver a reinício;
- arquivo pendente corrompido não desaparecer como fila vazia;
- claim não entregar duplicado após falha de armazenamento;
- auto-claim funcionar sem loop;
- Java e Bedrock continuarem corretos;
- compra pendente atualizar o bot 2.13.0 depois da entrega;
- configuração antiga continuar migrável;
- todos os testes e o build passarem;
- o teste Paper real estiver claramente separado.

Comece pelo diagnóstico e implemente por fases pequenas. Não esconda falhas e não marque como concluído o que não foi testado.

## FIM DO PROMPT
