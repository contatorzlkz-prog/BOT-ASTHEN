# ASTHEN BOT 2.7.0 — Handoff técnico para a IA atualizar o Plugin-ASTHEN

Este documento é a especificação de integração para a pessoa e para a IA que vão modificar o código Java do plugin. Leia o documento inteiro antes de alterar arquivos. O objetivo é adaptar o plugin existente ao contrato do bot, preservando os sistemas que já funcionam.

**Não reescreva o plugin do zero.** O transporte poll já existente deve ser adaptado, não substituído.

## 1. Arquitetura obrigatória: computadores diferentes

- **PC do dono do bot:** ASTHEN BOT e API HTTP local em 127.0.0.1:8787.
- **PC/host do Minecraft:** servidor Paper e Plugin-ASTHEN.
- **Conexão:** o plugin inicia conexões HTTPS de saída para a URL pública do túnel/proxy do bot.
- **Teste:** pode ser Paper local no PC do amigo. Não é necessária host Minecraft pública para o primeiro teste.

No PC do amigo, 127.0.0.1 aponta para o próprio PC do amigo, não para o computador que executa o bot. Portanto, a configuração do plugin precisa receber a URL HTTPS do túnel.

## 2. Chave de integração: gerada uma vez pelo bot

O ASTHEN BOT cria uma chave aleatória forte somente quando DKB_SECRET ainda não existe. Salva o valor em .env. Nas inicializações seguintes e nas atualizações normais do bot, o mesmo valor é reaproveitado.

O administrador usa /bridge chave para ver a chave em resposta privada e cola esse mesmo valor em bridge.secret no config.yml do plugin.

### Comportamento que precisa ser corrigido no plugin atual

No DiscordKitBridge.java, o método resolveSecret() atual procura DKB_SECRET/bridge.secret e gera um token novo quando o campo está vazio. Essa geração automática deve ser removida para a integração com o ASTHEN BOT.

Comportamento esperado:

- Ler bridge.secret e validar mínimo de 32 caracteres.
- Não criar, substituir ou reescrever a chave automaticamente.
- Campo vazio ou inválido: desativar somente a comunicação com o bot, exibir uma mensagem clara no console e continuar carregando os demais recursos locais do plugin.
- Nunca registrar o conteúdo do segredo em logs ou mensagens.
- A mesma chave deve ser usada no header Authorization: Bearer ....

O bot não tem comando de regeneração nesta versão. A chave só muda se o administrador remover/substituir manualmente DKB_SECRET no .env; nesse caso, o plugin também terá de receber o novo valor.

## 3. Configuração de rede

### No PC do dono do bot

No .env:

~~~env
DKB_HOST=127.0.0.1
DKB_PORT=8787
~~~

1. Inicie o ASTHEN BOT e confirme que a API está ativa em http://127.0.0.1:8787.
2. Inicie INICIAR-TUNEL.bat, que executa cloudflared tunnel --url http://127.0.0.1:8787.
3. Copie a URL HTTPS https://....trycloudflare.com mostrada pelo Cloudflare.
4. Mantenha o bot e o túnel ligados durante o teste.

A URL Quick Tunnel é temporária; muda quando o túnel é recriado. É destinada a testes, não produção. Não abra a porta 8787 diretamente no roteador nem exponha HTTP aberto.

### No PC/host do amigo

No plugins/DiscordKitBridge/config.yml:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "CHAVE_COPIADA_DO_COMANDO_bridge_chave"
  poll:
    url: "https://ENDERECO-HTTPS-DO-TUNEL"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
~~~

Use somente a URL base HTTPS, sem acrescentar /plugin/v1. Não use localhost na URL do plugin para tentar alcançar o PC do dono do bot.

O modo poll é obrigatório para esta arquitetura. Não crie um servidor HTTP público dentro do plugin e não peça porta de entrada no PC do amigo.

## 4. Contrato HTTP implementado no bot

Todas as rotas exigem:

~~~http
Authorization: Bearer <bridge.secret>
~~~

### 4.1 Buscar pedidos

~~~http
GET /plugin/v1/pull?limit=5
~~~

Sem pedidos, o bot responde 204 No Content. Com pedidos:

~~~json
{
  "requests": [
    {
      "request_id": "id-unico-do-pedido",
      "player": "NickMinecraft",
      "platform": "java",
      "kit": "Kit_Ferro"
    }
  ]
}
~~~

O plugin deve validar os campos sem alterar request_id.

### 4.2 Devolver resultado

~~~http
POST /plugin/v1/result
Content-Type: application/json
~~~

Enviar o objeto final produzido pelo plugin, mantendo request_id, final: true, success, status, player, platform, kit e message. Exemplo:

~~~json
{
  "request_id": "id-unico-do-pedido",
  "final": true,
  "success": true,
  "status": "KIT_DELIVERED",
  "player": "NickMinecraft",
  "platform": "java",
  "kit": "Kit_Ferro",
  "message": "Kit entregue."
}
~~~

### 4.3 Sincronizar kits

O plugin deve enviar a lista completa de kits sempre que mudar e ao iniciar/recarregar:

~~~http
POST /plugin/v1/kits
Content-Type: application/json
~~~

~~~json
{
  "kits": [
    {
      "name": "Kit_Ferro",
      "enabled": true,
      "items": 12
    },
    {
      "name": "Kit_Dima",
      "enabled": true,
      "items": 18
    }
  ]
}
~~~

O código atual do PollClient já possui o envio de POST /plugin/v1/kits após carregar ou alterar o catálogo. Preserve esse comportamento. Confirme no código que a lista enviada é completa, não apenas os kits novos. O bot usa a lista completa para importar kits novos e detectar exclusões.

## 5. Fluxo de kits: plugin é a origem dos itens

- Administrador cria itens dentro de uma Shulker Box e usa /dk create <nome>.
- O plugin salva o kit real e envia a lista atualizada para /plugin/v1/kits.
- O bot importa o identificador e cria um registro comercial inicialmente sem preço, descrição ou imagem.
- No Discord, administrador usa /kit editar para escolher nome exibido, preço, descrição ou imagem HTTPS.
- O nome de exibição não altera o identificador que o bot envia ao plugin.
- Quando o administrador exclui o kit no plugin, a lista completa seguinte deixa de conter o identificador; o bot remove sua entrada do catálogo e do Supabase.
- /kit remover no Discord só oculta o produto da loja; não apaga itens no Minecraft.

Não implementar cadastro de itens dentro do bot. O bot não envia listas de ItemStack nem arquivos de kit.

## 6. Idempotência e segurança

Preserve o histórico de request_id já existente. A mesma compra repetida precisa devolver o resultado original e nunca entregar o mesmo kit duas vezes.

- Timeout ou resposta perdida: reutilizar o mesmo request_id.
- Não criar outro identificador automaticamente depois de uma resposta perdida.
- Nunca informar sucesso se o kit não foi entregue nem ficou guardado como pendente.
- As chamadas HTTP precisam continuar assíncronas e não bloquear a thread principal do Paper.
- Nunca registrar a chave em logs, stack traces ou respostas REST.

## 7. O que preservar

- /dk create, /dk delete, /dk list, /dk info, /dk preview, /dk give, /dk toggle, /dk claim e /dk reload.
- Armazenamento dos kits e histórico de solicitações.
- Entrega atômica, validação Java/Bedrock e Floodgate.
- Fila de itens pendentes.
- Logs locais e proteção contra duplicidade.

## 8. Critérios e roteiro de teste

1. Chave ausente/inválida não é gerada nem substituída pelo plugin.
2. Chave do bot é aceita e autentica a API.
3. Plugin no segundo computador conecta à URL HTTPS do túnel.
4. Ao criar um kit com /dk create Kit_Teste, o bot recebe a lista e o kit aparece em /kit listar.
5. Administrador usa /kit editar para definir preço, descrição, nome exibido e imagem.
6. O produto aparece no catálogo depois de ter preço e estar habilitado.
7. Excluir o kit no plugin remove a entrada do catálogo depois da próxima sincronização.
8. Aprovar compra de teste entrega exatamente um kit e devolve KIT_DELIVERED ou KIT_PENDING.
9. Reenviar o mesmo request_id não duplica a entrega.
10. Testar chave incorreta, túnel offline, bot offline, jogador offline, kit inexistente e inventário cheio.

## 9. Entrega da IA

Devolver o código-fonte atualizado, config.yml de exemplo sem segredo, lista de classes alteradas e resultados dos testes. Não incluir .env, chaves reais, IPs privados ou dados de jogadores.
