# PROMPT — Plugin-ASTHEN 1.3.1: persistência antes da entrega e Bridge única

Você vai atualizar **somente o repositório Plugin-ASTHEN** para uma versão corretiva 1.3.1. Leia o projeto inteiro antes de alterar qualquer coisa. Não reescreva o plugin, não remova recursos existentes e não mude o contrato de entrega sem necessidade.

Repositório-alvo: https://github.com/ElbsxS1/Plugin-ASTHEN  
Bot compatível: https://github.com/contatorzlkz-prog/BOT-ASTHEN  
Fonte oficial do código Node.js da Bridge: `contatorzlkz-prog/BOT-ASTHEN/bot-integration/asthen-bridge.js`.

## Objetivos obrigatórios

### 1. Tornar a criação do request_id durável antes de qualquer entrega

Problema observado:
- `RequestStore.register()` insere o registro em memória e chama `markDirty()`.
- `markDirty()` agenda a gravação em uma thread separada.
- `DeliveryService.submit()` pode agendar o processamento no Paper antes de a gravação do novo request_id terminar.
- Uma queda abrupta nessa janela pode fazer o servidor esquecer um pedido que já começou a ser processado; o bot pode reenviar o mesmo request_id depois do reinício.

Corrija a ordem para que **nenhuma entrega possa começar sem que o request_id esteja confirmado no disco**.

Implementação esperada:
1. Adicione um método explícito em `RequestStore`, por exemplo `registerDurably(KitRequest req)`, que:
   - seja sincronizado para impedir duas inserções simultâneas do mesmo request_id;
   - verifique primeiro se o request_id já existe e, se existir, devolva o registro existente com `duplicate=true`;
   - insira o novo `RequestRecord`;
   - grave o snapshot usando `Atomic.write(...)` e só retorne `duplicate=false` depois que a gravação terminar com sucesso;
   - se a gravação falhar, remova do mapa somente o registro recém-inserido e propague `IOException`;
   - não transforme falha de disco em sucesso silencioso.
2. Refatore a gravação interna de `RequestStore` para compartilhar a serialização entre a gravação síncrona obrigatória e o salvamento assíncrono existente. O caminho durável precisa propagar a exceção; o caminho assíncrono pode continuar registrando o aviso como hoje.
3. Em `DeliveryService.submit()`, use `registerDurably()` **antes** de:
   - colocar a solicitação em `running`;
   - agendar qualquer tarefa na thread principal;
   - executar `game.find()`, `game.give()` ou qualquer outra operação no Paper.
4. Se a gravação durável falhar:
   - não agende processamento;
   - não chame `game.give()`;
   - devolva um resultado final `INTERNAL_ERROR` com uma mensagem clara sobre a impossibilidade de registrar o pedido com segurança;
   - registre o erro no log.
5. Preserve o comportamento atual de idempotência: request_id já conhecido nunca pode iniciar outra entrega; pedidos duplicados em andamento continuam compartilhando/recebendo o resultado original.
6. A gravação durável não deve acontecer dentro da thread principal do Bukkit. `submit()` é chamado pela thread de I/O da Bridge/API; mantenha a persistência antes de despachar para `mainThread`.

Não tente criar uma transação fictícia entre filesystem e inventário: isso não existe. O objetivo desta mudança é garantir que a identidade do pedido esteja persistida antes de tocar no inventário. Se o processo cair depois da entrega e antes de salvar o estado final, a recuperação deve continuar conservadora: nunca entregar automaticamente uma segunda vez; manter o estado para reconciliação administrativa.

### 2. Testes obrigatórios de durabilidade

Adicione testes JDK-only na suíte existente para demonstrar:

- Um request_id recém-registrado por `registerDurably()` já está no arquivo antes de o método retornar.
- Abrir um segundo `RequestStore` sobre o mesmo arquivo reconhece o mesmo request_id como duplicado.
- Registrar duas vezes o mesmo request_id concorrentemente resulta em exatamente um registro novo e uma resposta duplicada.
- Simular falha de escrita no arquivo temporário faz `registerDurably()` lançar `IOException`.
- Com a falha de escrita ativa, submeter um pedido a `DeliveryService` retorna `INTERNAL_ERROR` e o jogo falso registra **zero** entregas.
- Após uma falha de escrita, retirar o bloqueio e enviar novamente o pedido permite registrar e processar normalmente, sem ter entregue nada durante a falha anterior.

Use o padrão de testes já existente em `TestMain.java` e `Tests130.java` (`Env`, `FakeGame`, `blockWrites()`, `unblockWrites()`). Não dependa de servidor Paper real para estes testes.

### 3. Remover a implementação duplicada e desatualizada da Bridge

O arquivo `bot-integration/asthen-bridge.js` dentro do Plugin-ASTHEN é uma implementação antiga. Ela não tem a fila persistente, a recuperação de jobs nem o protocolo atual de eventos/long-polling do BOT-ASTHEN 2.16+.

Faça o seguinte:
- Remova do Plugin-ASTHEN a cópia legada `bot-integration/asthen-bridge.js` e a pasta, caso fique vazia.
- Remova do README do plugin a instrução para copiar esse arquivo para o BOT-ASTHEN.
- Não copie a implementação atual do bot para dentro do plugin. O código Node deve ter uma única fonte oficial: `contatorzlkz-prog/BOT-ASTHEN/bot-integration/asthen-bridge.js`.
- No README do plugin, explique que o BOT-ASTHEN já inclui a Bridge e que basta configurar `DKB_SECRET`, `DKB_HOST`/`DKB_PORT` e a URL HTTPS no plugin.
- Atualize o requisito do bot para Node.js 22+ (o pacote atual declara `engines.node >=22`).
- Mantenha no Plugin-ASTHEN somente a documentação do contrato HTTP: `GET /plugin/v1/pull`, `POST /plugin/v1/result`, `POST /plugin/v1/kits` e `POST /plugin/v1/events`.
- Atualize `docs/BOT-INTEGRATION-1.3.0.md` para descrever o BOT-ASTHEN atual, sem dizer que o usuário precisa editar/copiar código do bot manualmente.

### 4. Compatibilidade do protocolo

Verifique contra o código atual do BOT-ASTHEN:
- Autenticação `Authorization: Bearer <DKB_SECRET>`.
- Long polling usa `wait_ms` de até 25.000 ms e aceita `204` como resposta normal.
- Resultado final só é confirmado após o bot responder `2xx` com `{"success":true}`.
- Eventos posteriores usam `POST /plugin/v1/events`, com evento idempotente para `KIT_PENDING -> KIT_DELIVERED`.
- Em timeout de rede, o bot reutiliza o mesmo request_id.
- Nunca introduza uma rota de comandos arbitrários.

Não altere a Bridge atual do BOT-ASTHEN a partir deste repositório.

### 5. Versão, documentação e validação

- Atualize a versão Maven/plugin para `1.3.1` (incluindo `pom.xml`, `plugin.yml` filtrado e textos de instalação que exibem a versão).
- Atualize README e CHANGELOG para explicar a persistência obrigatória antes da entrega e a remoção da Bridge legada.
- Atualize os documentos de teste e migração.
- Execute `./scripts/run-tests.sh` e `mvn -B -ntp package` com JDK 25.
- Corrija todos os testes e erros de compilação que surgirem; não reduza nem desative testes para obter build verde.
- Crie uma branch e um Pull Request para revisão. Não faça force-push na `main`.

## Limites e honestidade dos testes

A suíte JDK-only prova a lógica de persistência e idempotência, mas não valida inventário, eventos Bukkit ou Floodgate. Não afirme que o plugin foi testado dentro do Minecraft se isso não aconteceu.

Depois do build, documente um teste manual em Paper real:
1. iniciar o servidor e criar/registrar um kit;
2. fazer uma entrega Bedrock e uma Java compatível;
3. interromper o servidor em uma cópia de teste durante o processamento e reiniciar;
4. reenviar o mesmo request_id;
5. confirmar que não houve segunda entrega e que o pedido interrompido aparece para reconciliação;
6. verificar long polling e a atualização posterior `KIT_PENDING -> KIT_DELIVERED`.

## Resultado esperado

Entregue um PR pequeno, focado e revisável, contendo:
- persistência síncrona confirmada antes de qualquer entrega;
- testes de falha de escrita e idempotência;
- remoção da Bridge antiga duplicada;
- README, CHANGELOG, integração e instruções atualizadas;
- build e testes passando.

Não faça mudanças de interface, não reformule comandos, não altere o formato dos kits e não mexa no fluxo de Shulker Box.