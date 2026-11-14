# ASTHEN BOT 2.6.0 — Guia de implementação para o Plugin-ASTHEN

Este documento é destinado à pessoa que vai ajustar o código Java do Plugin-ASTHEN. O objetivo é fazer o plugin funcionar com a API que já foi adicionada ao ASTHEN BOT 2.6.0.

**Não é necessário criar outra API no plugin.** O transporte já existente em modo `poll` deve ser mantido e adaptado para usar a chave que nasce no bot.

## 1. Objetivo final

A compra deve seguir este fluxo:

1. Cliente escolhe um produto na loja do Discord.
2. Bot apresenta a prévia com nome, preço, descrição e imagem.
3. Cliente pode trocar de kit ou confirmar.
4. Cliente informa o nick Java.
5. Bot abre um ticket privado contendo a prévia e os dados de pagamento.
6. A equipe confere o comprovante e aprova o pagamento.
7. O bot envia somente os dados necessários para a entrega: `request_id`, nick, plataforma Java e nome exato do kit.
8. O plugin valida a solicitação, entrega o conteúdo salvo para o jogador e devolve o resultado ao bot.

O plugin continua sendo o responsável por armazenar os itens reais dos kits e fazer a entrega dentro do Minecraft.

## 2. Mudança principal: o bot gera a chave

### Comportamento atual que precisa mudar

No código atual de `DiscordKitBridge.java`, o método `resolveSecret()` tenta ler `DKB_SECRET` ou `bridge.secret`, mas gera uma nova chave e grava em `config.yml` quando os valores estão vazios ou fracos.

Esse comportamento deve ser removido para a integração com o bot. A chave oficial deve vir do ASTHEN BOT.

### Comportamento esperado

- O ASTHEN BOT cria uma chave aleatória forte na primeira inicialização.
- O bot salva a chave no `.env`, na variável `DKB_SECRET`.
- Um administrador usa `/bridge chave` no Discord para visualizar o valor em uma resposta privada.
- O administrador cola esse mesmo valor em `bridge.secret` no `plugins/DiscordKitBridge/config.yml`.
- O plugin não cria nem substitui a chave automaticamente.
- Se `bridge.secret` estiver vazio ou não tiver pelo menos 32 caracteres, o plugin deve desativar somente a comunicação da bridge e registrar uma mensagem clara no console. Não deve iniciar o transporte com chave vazia.
- A chave nunca deve ser escrita em logs, mensagens públicas, respostas REST ou arquivos fora da configuração.

Quando o administrador executa `/bridge regenerar`, o bot troca a chave imediatamente e invalida a anterior. O plugin deve receber o novo valor no `config.yml` e ser recarregado.

### Exemplo da configuração que o plugin deve aceitar

```yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "CHAVE_COPIADA_DO_COMANDO_bridge_chave"
  poll:
    url: "http://127.0.0.1:8787"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
```

O modo `poll` deve continuar como padrão.

## 3. Endereço da API e direção da conexão

### Teste local no Windows

No primeiro teste, o bot Node e um servidor Paper devem estar na mesma máquina Windows:

- Bot: `DKB_HOST=127.0.0.1`
- Bot: `DKB_PORT=8787`
- Plugin: `bridge.poll.url: "http://127.0.0.1:8787"`

O plugin faz a conexão de saída. Não abra uma porta de entrada no servidor Minecraft para essa integração.

**Importante:** um mundo single-player vanilla não carrega plugins Paper. Para testar no próprio PC, inicie um servidor Paper local e entre nele pelo Minecraft usando `localhost`. Isso continua sendo um teste local, sem VPS.

### Futuro uso com VPS

Quando o bot for para uma VPS:

- O Node deve ficar atrás de um proxy reverso ou túnel que forneça HTTPS.
- O plugin usa a URL HTTPS pública desse proxy como `bridge.poll.url`.
- A URL é a base do bot, sem o sufixo `/plugin/v1`.
- Por padrão, mantenha o Node em `127.0.0.1:8787` e faça o proxy encaminhar para essa porta local. Se a infraestrutura usar container/rede separada e exigir bind `0.0.0.0`, restrinja o acesso por firewall e mantenha HTTPS na entrada pública.
- Não envie a chave por HTTP aberto na internet.

Não altere o modo para `server` para tentar resolver o acesso remoto. O modo correto para essa arquitetura é `poll`.

## 4. Contrato HTTP já implementado no bot

Todas as rotas exigem:

```http
Authorization: Bearer <bridge.secret>
```

A chave do header precisa ser igual ao valor de `DKB_SECRET` no bot e `bridge.secret` no plugin.

### 4.1 Buscar pedidos

```http
GET /plugin/v1/pull?limit=5
```

Resposta sem pedidos:

- HTTP `204 No Content`.

Resposta com pedidos:

```json
{
  "requests": [
    {
      "request_id": "identificador-unico-do-pedido",
      "player": "NickJava",
      "platform": "java",
      "kit": "Kit_Ferro"
    }
  ]
}
```

O limite solicitado é de 1 a 20. O plugin deve validar cada campo antes de processar.

### 4.2 Devolver o resultado

```http
POST /plugin/v1/result
Content-Type: application/json
```

O corpo é o resultado final produzido pelo próprio plugin. O campo `request_id` deve corresponder ao pedido recebido. O bot só encerra a solicitação quando o corpo final possuir:

```json
{
  "request_id": "identificador-unico-do-pedido",
  "final": true,
  "success": true,
  "status": "KIT_DELIVERED"
}
```

Não invente outro formato se o `ResponseHandler` do plugin já gerar o corpo correto. Preserve os campos de jogador, plataforma, kit, status e mensagem existentes no plugin.

O bot mantém a solicitação aguardando até receber o resultado com `final: true` ou até atingir o tempo limite.

### 4.3 Sincronizar a lista de kits

```http
POST /plugin/v1/kits
Content-Type: application/json
```

Formato esperado:

```json
{
  "kits": [
    {
      "name": "Kit_Ferro",
      "enabled": true,
      "items": 12
    }
  ]
}
```

O bot usa essa lista para diagnóstico em `/bridge status`. O cadastro comercial da loja continua separado: o administrador usa `/kit adicionar` para informar preço, descrição e imagem. O nome precisa ser idêntico ao kit real.

## 5. Regras de kits e jogadores

- Plataforma usada nesta etapa: `java`.
- Nick Java: 3–16 caracteres, letras, números e sublinhado.
- Nome do kit: de 1 a 32 caracteres, letras, números, `_` e `-`.
- O nome enviado pelo bot deve ser o identificador que o plugin usa para localizar o kit, não um nome comercial traduzido.
- Os itens reais continuam salvos pelo plugin em sua pasta de dados.
- Se o jogador estiver offline, o plugin deve devolver o status definido pela implementação atual; não deve declarar sucesso sem entregar ou guardar o kit.
- Se o inventário estiver cheio e o plugin suportar entrega pendente, devolver `KIT_PENDING` com a mensagem de retirada.
- Se o kit não existir ou estiver desativado, devolver o status de erro apropriado.

## 6. Idempotência e tentativas

O plugin atual já mantém histórico de `request_id` para impedir que uma solicitação repetida entregue o mesmo kit duas vezes. Preserve esse comportamento.

- Mesma solicitação reenviada: mesmo `request_id`.
- Resultado final que confirma que a entrega não ocorreu: o bot pode abrir uma nova tentativa com outro ID.
- Timeout ou resposta perdida: não crie outra entrega com um ID novo automaticamente. Reutilize o ID original.
- Persistência de histórico precisa continuar funcionando mesmo após reiniciar o servidor Paper.

Não remova o `RequestStore`, a validação de pedidos nem o processamento atômico já existente.

## 7. O que deve ser preservado no plugin

A atualização deve manter:

- Comando `/dk` e cadastro manual de kits.
- Armazenamento dos kits e carregamento ao iniciar.
- Entrega completa ou nenhuma entrega parcial.
- Verificação de jogador online, plataforma e kit.
- Fila de itens pendentes quando aplicável.
- Histórico de pedidos e proteção contra duplicidade.
- Logs de entrega sem registrar segredos.
- Modo `poll` assíncrono, sem bloquear a thread principal do Minecraft.

Não implementar o conteúdo dos kits no bot. O bot envia apenas a solicitação.

## 8. Roteiro de teste

Use um servidor Paper privado no Windows, sem cobrança real e sem publicar a chave:

1. Inicie o bot e confirme no console que a API está ativa na porta 8787.
2. No Discord, execute `/bridge chave` como administrador.
3. Cole a chave no `bridge.secret` do plugin.
4. Configure `bridge.poll.url: "http://127.0.0.1:8787"` e mantenha `mode: "poll"`.
5. Reinicie o Paper ou execute `/dk reload`.
6. Crie uma Shulker Box com poucos itens e registre `/dk create Kit_Teste`.
7. No Discord, execute `/bridge status` e confirme que o kit foi recebido.
8. Cadastre `Kit_Teste` com `/kit adicionar`, um preço de teste, uma descrição e um link HTTPS de imagem.
9. Faça um pedido de teste, informe um nick Java conectado ao Paper e use o ticket privado.
10. Como administrador, confirme o pedido de teste e verifique se os itens chegam ao jogador.
11. Reinicie o Paper e repita um pedido com o mesmo `request_id` em um teste controlado para conferir que ele não duplica a entrega.
12. Teste também: chave errada, chave vazia, kit inexistente, jogador offline, inventário cheio e bot temporariamente indisponível.

## 9. Entrega para revisão

Ao concluir:

- Envie os arquivos Java alterados e o `config.yml` atualizado.
- Inclua um resumo das classes alteradas.
- Informe os resultados dos testes e a versão do Paper/JDK usada.
- Não inclua `.env`, tokens, chaves reais, dados de servidor nem prints que revelem segredos.

A atualização do plugin só deve ser considerada concluída depois que o teste local de ponta a ponta passar.
