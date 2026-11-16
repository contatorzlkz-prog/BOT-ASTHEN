# PROMPT — Correções de confiabilidade do BOT-ASTHEN 2.13.0

**Repositório:** https://github.com/contatorzlkz-prog/BOT-ASTHEN  
**Plugin correspondente:** https://github.com/ElbsxS1/Plugin-ASTHEN  
**Base auditada:** BOT-ASTHEN 2.12.0, Node.js 22+, Discord.js 14  
**Alvo:** BOT-ASTHEN 2.13.0, compatível com Plugin-ASTHEN 1.2.0 e 1.3.0.

## INÍCIO DO PROMPT

Você vai corrigir o BOT-ASTHEN. Não reescreva o projeto e não altere o comportamento comercial sem necessidade. Primeiro leia o código real, depois implemente por fases, com testes e migração segura.

O bot cuida da loja Discord, tickets, aprovação manual de pagamentos, estoque semanal transacional no Supabase e bridge HTTP local em 127.0.0.1:8787.

### 1. Diagnóstico e regras

Leia:
- src/store.js
- src/interactions.js
- src/tickets.js
- src/supabase.js
- src/index.js
- src/bridge.js
- bot-integration/asthen-bridge.js
- src/ui.js
- todos os testes;
- scripts .bat, scripts Linux, workflows, README, CHANGELOG e SQL.

Confirme a versão e o estado real antes de editar. O estado auditado foi 2.12.0. Se já houver correção posterior, valide em vez de duplicar.

Trabalhe em branch e PR. Não publique diretamente em main sem autorização. Nunca solicite nem publique .env, DISCORD_TOKEN, DKB_SECRET, chaves Pix, chaves secretas do Supabase ou tokens de túnel.

### 2. CRÍTICO — Isolar os testes do armazenamento real

**Bug confirmado:** src/store.js define dataDir relativo ao próprio arquivo de produção (../data). test/store-kits.test.js importa funções reais como updateGuildConfig() e syncPluginKits(), que chamam saveStore(). Isso escreve em data/state.json real. O INSTALAR.bat executa npm test.

Corrija antes de qualquer outra funcionalidade:
1. Introduza injeção/configuração explícita do diretório de dados, sem alterar a pasta padrão da instalação.
2. Cada teste de store deve usar diretório temporário isolado, criado por node:os/node:fs e removido no finally.
3. Não permita que npm test escreva, renomeie ou apague data/state.json, .env, snapshots reais ou tabelas Supabase.
4. Adicione guarda em teste que falhe se o caminho de dados estiver fora do diretório temporário.
5. Torne os testes paralelos seguros: cada teste recebe armazenamento independente ou usa fixture isolada.
6. O processo de teste deve ter Supabase desabilitado e não fazer requests de rede.
7. Faça um teste explícito: crie um data/state.json sentinela em ambiente temporário, rode os testes e confirme que o conteúdo não mudou.

Não resolva o problema simplesmente desabilitando os testes no instalador. Os testes devem continuar sendo executados, mas isolados.

### 3. CRÍTICO — Não sobrescrever dados quando state.json está corrompido

**Bug confirmado:** loadStore() captura erro de JSON, cria estado vazio e em seguida chama saveStore(). Isso pode substituir o arquivo que não conseguiu ler. Se Supabase estiver ativo, a inicialização pode acabar sincronizando um estado vazio por cima do backup remoto.

Corrija:
- diferenciar arquivo inexistente de arquivo inválido;
- arquivo inexistente em instalação nova pode iniciar estado vazio;
- arquivo inválido deve ser preservado, copiado para nome de recuperação com timestamp e impedir sobrescrita automática;
- não sincronizar estado vazio ao Supabase por causa de falha de parse;
- tentar restore remoto somente se o snapshot remoto for validado integralmente e a política de recuperação for segura;
- se não for possível provar qual cópia é válida, interromper inicialização com mensagem clara e instruções de backup/recovery;
- validar a estrutura de guilds, tickets e purchaseDrafts, não apenas JSON.parse;
- fazer gravações atômicas e preservar uma cópia anterior válida.

Crie testes para JSON inválido, JSON truncado, estrutura incompatível, arquivo ausente e restore remoto.

### 4. Alta — Fila de entregas persistente na Bridge

**Bug confirmado:** bot-integration/asthen-bridge.js guarda waiting em um Map de memória. Após reiniciar o processo, os pedidos aguardando o plugin desaparecem. O ticket pode continuar approved/QUEUED sem existir uma solicitação na fila.

Implemente fila persistente, usando armazenamento local atômico independente do snapshot geral:
- diretório/arquivo dedicado sob data/;
- request_id único e idempotente;
- payload de jogador, plataforma e kit;
- guild_id/ticket_id para associar a solicitação ao ticket;
- estado (QUEUED, LEASED, WAITING_RESULT, KIT_PENDING, KIT_DELIVERED, FAILED, RECONCILIATION_REQUIRED ou equivalente);
- timestamps de criação/atualização;
- lease e contagem de tentativas;
- deadline/timeout;
- resultado final conhecido e mensagem;
- recuperação na inicialização.

Regras:
1. Persistir a solicitação antes de disponibilizá-la ao plugin.
2. Pull continua usando lease para não entregar o mesmo pedido a dois consumidores simultâneos.
3. Se o lease expirar, pedido não concluído volta à fila com o mesmo request_id.
4. Se o bot reiniciar, os pedidos não concluídos são recuperados.
5. pendingPulls são sockets transitórios e não devem ser persistidos.
6. Salvar resultado antes de confirmar ao plugin que ele foi aceito.
7. Resultado repetido com o mesmo request_id e mesmo estado deve ser idempotente.
8. Não apagar pedido ainda pendente, leased, com timeout ambíguo ou em reconciliação.
9. A retenção só pode limpar registros terminais após período documentado; nunca apagar pedidos não resolvidos.
10. A gravação corrompida deve preservar o arquivo e não se transformar em fila vazia.
11. Bot e plugin não devem manter cópias contraditórias sem regra de autoridade definida.

A fila em disco deve continuar sendo a fonte de verdade mesmo que uma Promise de deliverKit() desapareça quando o processo reiniciar. Na inicialização, reconciliar os tickets aprovados e os registros da fila; não gerar request_id novo quando a solicitação anterior ainda é válida.

### 5. Contrato de atualização posterior de KIT_PENDING

Hoje o plugin envia um resultado final KIT_PENDING quando o jogador está offline ou com inventário cheio. O bot conclui a Promise e remove a entrada de espera. Mais tarde, o plugin pode entregar o kit, mas o ticket no Discord não fica sabendo.

Adicione endpoint novo e autenticado:

~~~http
POST /plugin/v1/delivery-update
Authorization: Bearer <DKB_SECRET>
Content-Type: application/json
~~~

Payload:

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

Requisitos:
- somente request_id conhecido e vinculado a uma entrega;
- só aceitar transições permitidas, principalmente KIT_PENDING para KIT_DELIVERED;
- não permitir que plugin invente request_id nem altere preço/estoque/ticket de outro servidor;
- repetir o mesmo update deve retornar sucesso idempotente;
- gravar a atualização antes do HTTP 2xx;
- achar ticket pelo request_id persistido, não apenas por channelId em memória;
- atualizar o estado salvo do ticket e a mensagem/Embed de entrega no canal privado;
- se o canal tiver sido apagado, preservar o histórico e registrar o motivo;
- notificar o comprador e/ou equipe de forma clara, sem spam;
- nunca marcar entregue antes de receber atualização autenticada válida;
- não reabrir nem alterar pagamento já aprovado;
- não reservar novamente estoque.

POST /plugin/v1/result continua recebendo o primeiro resultado final. KIT_PENDING fecha a espera inicial. Atualizações posteriores usam exclusivamente o endpoint novo. Não transforme o resultado inicial em duas Promises concorrentes.

### 6. Long Polling e compatibilidade

O BOT 2.12.0 já aceita GET /plugin/v1/pull?limit=5&wait_ms=20000, com máximo 25.000 ms:
- com pedido: HTTP 200 e {"requests":[...]};
- sem pedido até o prazo: HTTP 204;
- sem wait_ms: comportamento antigo, HTTP 204 imediato se vazio.

Preserve esse contrato e:
- valide números e limites sem aceitar NaN/valores negativos;
- limite conexões de Long Poll e limpe waiter em close/abort/shutdown;
- não segure conexão além de maxLongPollMs;
- acordar imediatamente o waiter quando uma nova entrega aprovada entra na fila;
- suportar polling antigo sem wait_ms;
- manter autenticação Bearer e respostas sem cache;
- não bloquear o event loop;
- adicionar métricas/estado para longPollCount, queue count, idade do pedido mais antigo, expirados e retries;
- proteger contra cliente abrindo muitas conexões Long Poll simultâneas;
- não entregar o mesmo item a duas conexões antes do lease.

### 7. Alta — Bloquear tentativas simultâneas e IDs novos indevidos

**Risco confirmado:** retryApprovedDelivery() permite que mais de uma interação acione processApprovedDelivery(). O modo new gera novo request_id. Chamadas simultâneas podem criar IDs diferentes para uma mesma compra, e o preventDuplicate do plugin não identifica IDs diferentes como a mesma transação.

Corrija:
- lock por ticket/channelId para impedir aprovação/entrega/retry simultâneos;
- estado de tentativa persistido antes de iniciar o envio;
- um único request_id ativo por tentativa;
- timeout/rede: repetir com o mesmo request_id;
- gerar novo request_id somente depois de falha terminal confirmada e com ação administrativa explícita;
- nunca criar nova tentativa para KIT_PENDING ou KIT_DELIVERED;
- se resultado estiver ambíguo, exigir reconciliação, não gerar novo ID;
- botões ficam desabilitados/atualizados enquanto uma tentativa está ativa;
- lock deve ser liberado por finally e recuperado após reinício;
- não permitir que duas aprovações reservem ou entreguem a mesma compra duas vezes.

Crie testes com cliques concorrentes de duas interações, timeout, reenvio com mesmo ID, falha terminal e KIT_PENDING.

### 8. Estoque semanal e pagamento

Preserve o mecanismo atual:
- estoque de 10 unidades por kit/servidor/semana;
- semana inicia domingo 00:00 em America/Sao_Paulo;
- reserva por RPC atômica no Supabase;
- chave idempotente por ticket;
- reserva ocorre na aprovação, não na criação do ticket;
- falha do Supabase/migração deve impedir aprovação sem reserva;
- repetir aprovação com o mesmo ticket não desconta unidade novamente.

Verifique que:
- validação de staff ocorre antes da operação;
- reserva e alteração orderStatus têm uma ordem segura;
- se o bot cair depois da reserva mas antes de salvar o ticket, a aprovação pode ser retomada com a mesma chave de reserva;
- falhas de entrega não devolvem estoque automaticamente sem política de reembolso aprovada;
- não exista caminho alternativo que aprove pagamento sem reservar estoque.

Atualize testes de concorrência do banco/RPC com identificadores iguais e diferentes. Não altere o SQL sem migração compatível e documentada.

### 9. Permissões dos tickets

**Inconsistência auditada:** a regra isStaff() aceita administradores, membros com ManageGuild e/ou cargo de equipe conforme o código; createPrivateTicket() concede acesso pelo overwrite ao comprador, cargo configurado e bot. ManageGuild sozinho não ignora permissões de canal (ao contrário de Administrator), então um membro autorizado no código pode não conseguir visualizar o ticket privado.

Corrija definindo uma única política:
- ou equipe = cargo configurado + administradores;
- ou suportar explicitamente ManageGuild adicionando overwrite individual seguro aos membros autorizados.
- Não conceder ViewChannel a @everyone.
- Não abrir todos os tickets a todos os moderadores sem decisão explícita.
- A checagem de autorização e a visibilidade real do canal precisam corresponder.
- Verificar que bot, comprador e equipe conseguem ler/escrever/anexar arquivos.
- Atualizar /configurar e mensagens quando o cargo de equipe não existir.

Crie testes para administrador, ManageGuild, cargo da equipe, usuário comum, cargo removido e configuração sem staffRoleId.

### 10. Supabase, restauração e encerramento

O Supabase é obrigatório para reserva do estoque semanal, mas o snapshot/backup local tem comportamento separado. Mantenha essa distinção clara na documentação.

Audite e corrija:
- pushSnapshot() retorna false imediatamente quando já há sincronização em andamento e marca syncQueued;
- flushSupabaseSync() pode não esperar o trabalho já em andamento;
- src/index.js faz await flushSupabaseSync() e depois process.exit(0), podendo encerrar antes da sincronização concorrente terminar;
- loadStore() não pode sincronizar estado vazio depois de erro de leitura;
- o snapshot local deve continuar fonte de recuperação quando Supabase falhar;
- restore remoto não deve substituir estado local válido;
- writes devem ser serializados e snapshots não podem sobrescrever uma versão mais nova;
- shutdown deve parar de aceitar novas entregas, concluir ou persistir os jobs, fechar a bridge, aguardar o flush por prazo definido e só então encerrar;
- timeout de shutdown deve registrar o que não foi sincronizado e deixar dados locais íntegros;
- lidar com múltiplos sinais sem rodar shutdown em paralelo.

getSupabaseStatus() deve distinguir:
- chave/projeto configurado;
- conexão real recente;
- backup geral sincronizado;
- estoque semanal disponível;
- última sincronização e último erro.

Não exiba segredo ao administrador no Discord.

### 11. Tickets, transcrição e histórico

archiveAndDeleteTicket() marca o ticket fechado, espera e apaga o canal; não gera transcrição nessa função.

Defina comportamento explícito:
- ou renomear o método se ele apenas fecha e apaga;
- ou implementar transcrição segura antes de excluir.

Se implementar transcrição:
- armazenar somente dados necessários;
- limitar acesso ao canal privado de logs/equipe;
- preservar conteúdo e anexos conforme permissões e limites Discord;
- definir retenção e exclusão;
- nunca publicar comprovante Pix em canal público;
- preservar histórico estruturado de decisão, valor, kit, request_id, tentativas, responsáveis e timestamps;
- não armazenar segredos nem dados bancários desnecessários.

Não transforme uma melhoria de histórico em coleta indiscriminada de mensagens.

### 12. Catálogo do Discord

O Discord limita String Select a 25 opções por menu. makeCatalogMenu() atualmente corta a lista com slice(0, 25), enquanto o armazenamento pode guardar até 200 kits.

Implemente paginação ou navegação por categoria/busca:
- nenhum kit válido pode desaparecer silenciosamente depois do 25º;
- manter indisponíveis identificáveis, mas sem permitir compra;
- respeitar limites de 25 opções e 100 caracteres por rótulo/descrição;
- preservar nomes amigáveis e preço exato em centavos;
- testar 0, 1, 25, 26, 50, 200 kits;
- suportar IDs customizados sem colisão e expiração segura de estado temporário.

### 13. Instalação e reprodutibilidade

- Adicione e mantenha package-lock.json.
- Use npm ci no CI e no instalador quando lockfile existir.
- O instalador pode executar npm run check, npm run check:commands e npm test, desde que todos os testes estejam isolados.
- Nunca substituir .env, data/state.json, fila persistente ou backups durante atualização.
- Se Node for incompatível, informar o requisito sem apagar dados.
- Fornecer script/guia de backup antes de atualizar.
- Scripts Windows e Linux devem usar o mesmo comportamento de preservação de dados.
- Não colocar Cloudflare/Tailscale/tunnel.to tokens nos scripts versionados.

### 14. Testes obrigatórios

Acrescente testes para:
1. npm test nunca altera armazenamento da instalação.
2. cada teste usa diretório isolado.
3. state.json inválido é preservado, não sobrescrito.
4. restore do Supabase não apaga estado local válido.
5. fila Bridge persiste antes de responder ao Pull.
6. pedido lease expirado volta à fila com mesmo request_id.
7. pedido e resultado sobrevivem ao restart.
8. resultado duplicado é idempotente.
9. Long Poll acorda imediatamente, expira em 204 e limpa waiter no close.
10. limite de conexões Long Poll é respeitado.
11. endpoint delivery-update só aceita request_id conhecido.
12. KIT_PENDING pode evoluir para KIT_DELIVERED uma vez.
13. update repetido não duplica mensagens nem altera estoque.
14. dois retries simultâneos para o mesmo ticket não criam IDs novos.
15. timeout repete com mesmo request_id.
16. falha terminal permite nova tentativa com autorização explícita.
17. estoque concorrente não ultrapassa limite e usa chave idempotente.
18. ManageGuild/staff/admin têm visibilidade de ticket equivalente à autorização.
19. fechamento de ticket preserva o histórico definido.
20. catálogo com 200 kits continua navegável.
21. Supabase flush aguarda sincronização em andamento.
22. shutdown não encerra com job ainda não persistido.
23. todos os testes antigos continuam passando.

Execute:
- npm ci;
- npm run check;
- npm run check:commands;
- npm test;
- testes de integração da bridge;
- GitHub Actions.

Não use as credenciais reais do usuário nos testes. Não conecte ao Supabase de produção.

### 15. Versionamento e entrega

Atualize para 2.13.0 apenas quando os critérios forem cumpridos:
- package.json;
- VERSION.txt;
- CHANGELOG.md;
- README;
- documentação de instalação e Supabase;
- release ZIP e CI.

Inclua instrução de migração de 2.12.0 para 2.13.0. Preserve .env, data/state.json, filas e histórico. Nunca apague dados para “limpar” a instalação.

Não declare corrigido antes dos testes. Não invente resultados. Abra PR com diagnóstico, lista de arquivos, migrações, testes executados, resultados reais e riscos restantes.

## FIM DO PROMPT
