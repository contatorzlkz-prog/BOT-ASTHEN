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

### Teste entre dois computadores (sem VPS Minecraft)

O dono do bot e o amigo que executa o plugin estão em computadores diferentes:
- PC do dono: ASTHEN BOT e API local em `127.0.0.1:8787`.
- PC do amigo: servidor Paper local e temporário, com o Plugin-ASTHEN.
- Internet: o plugin inicia conexões HTTPS para a URL pública do túnel que encaminha para a API do dono.

**Não use `127.0.0.1` na URL do plugin:** no PC do amigo, esse endereço aponta para o próprio PC dele, não para o bot.

No PC do dono do bot, mantenha no `.env`:

```env
DKB_HOST=127.0.0.1
DKB_PORT=8787
```

Para gerar esse endereço no Windows, o dono do bot deve:

1. Baixar o executável **Windows 64-bit** do [cloudflared na página oficial da Cloudflare](https://developers.cloudflare.com/tunnel/downloads/).
2. Renomear para `cloudflared.exe` e colocá-lo na pasta do bot.
3. Iniciar o ASTHEN BOT e confirmar no console que a API está ativa em `http://127.0.0.1:8787`.
4. Executar `INICIAR-TUNEL.bat` (ou rodar `cloudflared tunnel --url http://127.0.0.1:8787` em outra janela).
5. Copiar o endereço aleatório `https://....trycloudflare.com` exibido pelo Cloudflare e enviá-lo ao amigo.

O endereço Quick Tunnel é temporário, muda ao criar outro túnel e só responde enquanto `cloudflared` estiver aberto. É para teste, não produção. O bot e o túnel precisam ficar ligados durante a sessão. Não abra a porta 8787 no roteador nem exponha HTTP aberto.

No PC do amigo, use no `plugins/DiscordKitBridge/config.yml`:

```yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "COLE_AQUI_A_CHAVE_GERADA_PELO_BOT"
  poll:
    url: "https://ENDERECO-HTTPS-DO-TUNEL"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
```

Substitua a URL de exemplo pelo endereço HTTPS real do túnel. Use somente a URL base, sem o sufixo `/plugin/v1`.

O amigo inicia Paper localmente, instala o plugin nesse servidor e entra no mundo de teste usando `localhost`. **Um mundo single-player vanilla não carrega plugins Paper**; o teste exige Paper, mas não exige host pública ou VPS Minecraft.

O modo `poll` é obrigatório para este cenário: o plugin faz as requisições de saída. Não crie um servidor HTTP no plugin nem peça abertura de porta de entrada no PC do amigo.

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

## 8. Roteiro de teste entre os dois computadores

1. O dono inicia o ASTHEN BOT no Windows.
2. O dono inicia o túnel HTTPS encaminhando para `http://127.0.0.1:8787`.
3. O dono copia a chave com `/bridge chave` e compartilha com o amigo por canal privado.
4. O amigo inicia um servidor Paper local e temporário no próprio PC e instala o plugin atualizado.
5. O amigo configura `bridge.secret` com a chave recebida e `bridge.poll.url` com a URL HTTPS pública do túnel.
6. O amigo reinicia o Paper e confirma no console que o plugin conectou.
7. O amigo cria um kit de teste com `/dk create Kit_Teste`.
8. O dono confere a sincronização com `/bridge status` e cadastra `Kit_Teste` na loja.
9. Fazer uma compra de teste no Discord, informar o nick de um jogador conectado ao Paper e aprovar o pedido manualmente.
10. Confirmar que o plugin entrega o kit no servidor local e devolve o resultado ao ticket.
11. Testar chave errada, kit inexistente, jogador offline, inventário cheio, túnel desligado, bot desligado e reinicialização do Paper.
12. Repetir de forma controlada o mesmo `request_id` para confirmar que não existe entrega duplicada.

Durante o teste, o bot, o túnel e o Paper precisam permanecer ligados. Se o PC do dono desligar ou o túnel cair, o plugin não conseguirá consultar a API até a conexão voltar.

## 9. Entrega para revisão

Ao concluir:

- Envie os arquivos Java alterados e o `config.yml` atualizado.
- Inclua um resumo das classes alteradas.
- Informe os resultados dos testes e a versão do Paper/JDK usada.
- Não inclua `.env`, tokens, chaves reais, dados de servidor nem prints que revelem segredos.

A atualização do plugin só deve ser considerada concluída depois que o teste local de ponta a ponta passar.
