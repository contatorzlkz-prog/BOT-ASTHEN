# PROMPT MESTRE — Atualização coordenada ASTHEN BOT + Plugin

Use este prompt quando um agente de programação tiver acesso aos dois repositórios. O objetivo é corrigir confiabilidade, pendências, duplicidade, persistência, Long Polling e atualização de status entre Discord e Minecraft.

## Repositórios e versões-alvo

- BOT: https://github.com/contatorzlkz-prog/BOT-ASTHEN — base auditada 2.12.0; alvo 2.13.0.
- Plugin: https://github.com/ElbsxS1/Plugin-ASTHEN — base auditada 1.2.0; alvo 1.3.0.

Prompts detalhados:
- prompts/BOT-ASTHEN-2.13.0-CORRECOES.md
- prompts/PLUGIN-ASTHEN-1.3.0-CORRECOES.md

Leia os dois antes de implementar. Este documento define a ordem e o contrato compartilhado. Siga os requisitos detalhados nos prompts individuais; se houver conflito, pare e explique em vez de improvisar.

## Regras obrigatórias

1. Primeiro abra os dois repositórios e confira os SHAs/versões atuais. Não confie cegamente no resumo desta auditoria.
2. Faça branches separadas e PRs revisáveis. Não altere main diretamente sem autorização.
3. Não solicite nem publique .env, tokens, DKB_SECRET, chave Pix, chave secreta Supabase, tokens de túnel ou credenciais.
4. Não apague nem substitua dados reais, pedidos, kits, reservas ou histórico durante testes/migração.
5. Testes não podem usar Supabase de produção nem arquivos de instalação real.
6. Não alegue teste de Paper/Floodgate/Discord real sem executar esse ambiente.
7. Não reescreva toda a arquitetura. Corrija as causas e mantenha contratos compatíveis.
8. Não implemente exactly-once como promessa sem tratar a fronteira entre persistência em disco e alteração do inventário.
9. O endpoint de status posterior deve ser idempotente e autenticado.

## Diagnóstico confirmado na base auditada

### BOT-ASTHEN 2.12.0
- test/store-kits.test.js importa src/store.js, e chamadas de atualização escrevem em data/state.json da instalação.
- INSTALAR.bat executa npm test; portanto, o teste precisa ser isolado antes de o instalador continuar seguro.
- loadStore() pode criar estado vazio e sobrescrever data/state.json quando falha ao ler/interpretar o arquivo.
- bot-integration/asthen-bridge.js mantém waiting em memória; pedidos podem desaparecer ao reiniciar o bot.
- retryApprovedDelivery() pode iniciar nova tentativa com ID novo sem trava por ticket suficientemente forte.
- flushSupabaseSync() retorna cedo quando há sincronização em andamento; shutdown precisa aguardar o flush real.
- ManageGuild pode ser aceito pela autorização mas não ter overwrite explícito para visualizar canal privado.
- menus de catálogo cortam a lista em 25 opções.
- fechamento de ticket exclui canal depois de delay e não gera transcrição nessa função.

### Plugin-ASTHEN 1.2.0
- PollClient não envia wait_ms; usa polling fixo.
- outbox de respostas do plugin é uma Map em memória.
- PendingStore.list() transforma erros de leitura em lista vazia.
- claim() entrega e depois remove pendência; falha na remoção pode permitir repetição.
- auto-claim acontece no join e manualmente, não ao liberar espaço.
- jogador offline usa chave de nome/plataforma porque não há UUID conhecido.
- o plugin não tem endpoint/contrato de atualização posterior da entrega após KIT_PENDING.
- tab completion aplica discordkitbridge.list a sugestões de subcomandos que têm permissões próprias.
- pedidos em andamento são convertidos para estado de erro na recuperação; revisar sem reentregar de forma insegura.

Se algum item já foi resolvido no HEAD atual, registrar evidência e rodar o teste correspondente.

## Ordem de execução

### Fase 0 — Contrato e plano
- Ler os dois repositórios completos.
- Mapear o fluxo atual: aprovação → reserva semanal → job de entrega → pull → execução no Paper → resultado → atualização do ticket.
- Criar matriz de estados com transições permitidas.
- Definir arquivos persistentes, migrações e limites de retenção.
- Apresentar diagnóstico e plano antes da alteração principal.

### Fase 1 — Proteger dados e testes do bot
Implementar primeiro:
- diretório de dados injetável para testes;
- testes isolados em diretório temporário;
- guardas que impedem escrita em data/ real;
- recuperação segura de state.json corrompido;
- snapshots Supabase não podem ser sobrescritos com estado vazio devido a erro de parse;
- npm ci com lockfile e CI reprodutível.

Critério: npm test e o instalador não modificam dados reais.

### Fase 2 — Fila persistente e idempotente do bot
- Persistir pedido de entrega antes de disponibilizar ao plugin.
- Persistir estado, request_id, payload, lease, tentativas, timestamps e relação ticket/guild.
- Recuperar após reboot com o mesmo request_id.
- Reoferecer após lease expirar.
- POST /plugin/v1/result persiste resultado antes do HTTP 2xx.
- Resultado repetido idêntico é idempotente.
- Timeout/erro de transporte não gera novo request_id.
- pendingPulls são conexões transitórias, não filas persistentes.

### Fase 3 — Endpoint de atualização posterior
Adicionar ao bot:

~~~http
POST /plugin/v1/delivery-update
Authorization: Bearer <DKB_SECRET>
Content-Type: application/json
~~~

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

Regras:
- aceitar só request_id conhecido;
- transições permitidas: principalmente KIT_PENDING → KIT_DELIVERED;
- validar campos e limitar tamanho;
- persistir atualização antes de responder 2xx;
- chamar handler interno para atualizar o ticket;
- idempotência para reenvio;
- nunca reservar estoque novamente;
- não aceitar alteração de preço, comprador, ticket, guild ou pagamento via esse endpoint.

O bot deve encontrar o ticket pelo deliveryRequestId persistido, atualizar status/Embed no canal privado, e registrar a atualização sem spam. Se o canal não existir mais, preservar estado e registrar a falha de notificação.

### Fase 4 — Plugin: pendências confiáveis
- PendingStore.list() não pode esconder corrupção como lista vazia.
- preservar/quarentenar arquivos inválidos.
- implementar protocolo de claim com write-ahead state e reconciliação de entrega.
- usar identidade estável de caixa/entrega (PDC ou mecanismo Paper equivalente) para detectar caixas já colocadas no inventário quando possível.
- se o estado for ambíguo, não duplicar automaticamente; deixar reconciliação administrativa.
- preservar snapshots e request_id.
- resolver pendência offline por nome/plataforma sem fuzzy matching.
- manter join e /dk claim.
- auto-claim por eventos relevantes, debounce, próximo tick, sem varredura contínua.

### Fase 5 — Long Polling e outboxes

Plugin:
- GET /plugin/v1/pull?limit=5&wait_ms=20000.
- bot limita wait a 25.000 ms.
- timeout HTTP total 35 s; connect timeout 10 s.
- HTTP 204 é vazio normal.
- uma única cadeia e uma requisição pull em andamento.
- próxima espera rápida após 200/204.
- cancelamento correto em reload/disable.
- resultados e delivery updates em outbox persistente; não remover antes de confirmação HTTP válida.

Bot:
- manter limite de wait de 25.000 ms;
- limpeza de conexões canceladas e shutdown;
- acordar pull imediatamente quando job é adicionado;
- lease e prevenção de dois pulls recebendo o mesmo job;
- status/contagem de jobs para /bridge status.

### Fase 6 — Recuperação e concorrência de compra/entrega
- lock por ticket para aprovação e retry;
- um request_id ativo por tentativa;
- timeout = repetir com mesmo ID;
- novo ID só após falha final confirmada e ação staff explícita;
- nunca criar novo ID se KIT_PENDING, KIT_DELIVERED ou estado ambíguo;
- reserva semanal idempotente por ticket, sem descontar duas vezes;
- pedidos pendentes não são apagados na retenção;
- reconciliação após reinício sem duplicar a caixa.

### Fase 7 — Permissões, catálogo e histórico
- alinhar isStaff() com visibilidade real dos tickets;
- ManageGuild sozinho precisa de overwrite individual ou não deve ser aceito como staff para esse ticket;
- catálogo acima de 25 itens precisa de paginação/navegação;
- histórico de ticket/entrega com request_id, decisão, responsável, datas e tentativas;
- se gerar transcrição antes de apagar ticket, respeitar acesso privado, retenção e minimização de dados;
- tab completion respeita permissão própria do subcomando;
- mensagens de status do Discord são atualizadas em vez de multiplicar mensagens sem necessidade.

## Contrato de integração final

| Operação | Endpoint | Regra |
|---|---|---|
| Pull | GET /plugin/v1/pull?limit=5&wait_ms=20000 | 200 com pedidos ou 204 vazio |
| Resultado inicial | POST /plugin/v1/result | Um resultado final por solicitação |
| Atualização posterior | POST /plugin/v1/delivery-update | Atualiza somente entrega previamente conhecida |
| Catálogo | POST /plugin/v1/kits | Snapshot completo e validado |

Todas as rotas protegidas usam Bearer DKB_SECRET.

### Sequência esperada de uma compra

1. Cliente abre ticket e informa nick/plataforma.
2. Equipe confere o pagamento.
3. Bot valida equipe e reserva unidade semanal usando chave idempotente do ticket.
4. Bot persiste um job com request_id único.
5. Plugin recebe o job pelo Long Polling.
6. Plugin valida jogador, plataforma, kit e request_id.
7. Se entrega na hora, envia KIT_DELIVERED no resultado inicial.
8. Se jogador offline ou inventário cheio, plugin persiste a pendência e envia KIT_PENDING uma única vez.
9. Quando a pendência é realmente entregue, plugin persiste a conclusão e envia POST /plugin/v1/delivery-update.
10. Bot valida request_id/estado, persiste e atualiza o ticket/Embed no Discord.
11. Reenvios do mesmo resultado/update não criam outra caixa, mensagem repetida ou reserva.

## Testes de ponta a ponta obrigatórios

- polling antigo continua funcionando com bot novo;
- Long Poll 20 s acorda instantaneamente quando compra é aprovada;
- 204 não é erro;
- timeout e reconnect não duplicam jobs;
- reiniciar bot com job em lease não perde a entrega;
- reiniciar plugin com resultado na outbox não perde resposta;
- KIT_PENDING atualiza Discord quando claim posterior conclui;
- atualizar duas vezes é idempotente;
- ticket fechado/deletado não apaga histórico de entrega;
- jogador Java e Bedrock validados separadamente;
- inventário cheio mantém pendência;
- auto-claim executa uma única vez quando espaço for liberado;
- arquivo pendente corrompido não some;
- crash no meio de claim exige reconciliação segura;
- estoque semanal nunca excede limite sob concorrência;
- testes do bot nunca tocam em dados reais;
- nenhum token/secreto aparece em logs, commits, artefatos ou mensagens.

## Publicação e migração

- Bot 2.13.0 deve manter compatibilidade com plugin 1.2.0 e polling antigo.
- Plugin 1.3.0 pode usar Long Polling no bot 2.12.0, mas atualização posterior de status exige bot 2.13.0.
- Publicar o bot 2.13.0 primeiro com endpoint novo retrocompatível.
- Depois publicar plugin 1.3.0.
- Não exigir que todos atualizem ao mesmo tempo sem uma mensagem de incompatibilidade clara.
- Documentar backup e migração preservando .env, data/state.json, fila persistente, kits, pedidos e configurações.
- Não sobrescrever config.yml existente sem migração explícita.
- Atualizar changelog, README, versões, releases e workflows.
- Não marcar como concluído sem teste real; abrir PRs separados nos dois repositórios.

## Entrega esperada

Forneça diagnóstico antes/depois, branches e PRs, contratos/estados documentados, arquivos alterados, migrações, resultados de todos os comandos de teste/build, evidência de teste real onde aplicável, limitações restantes e instruções de atualização e rollback.

Não invente resultados. Não apague dados para simplificar. Não faça merge automático.

## FIM DO PROMPT
