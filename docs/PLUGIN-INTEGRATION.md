# Integração do ASTHEN BOT com o Plugin-ASTHEN

A integração usa o modo `poll`. O bot mantém uma API HTTP e o plugin Minecraft inicia as conexões para buscar pedidos e enviar resultados. Assim, o servidor Minecraft não precisa aceitar conexões de entrada.

> **Estado do desenvolvimento:** o bot 2.6.0 já possui a API e gera a chave compartilhada. O código atual do Plugin-ASTHEN ainda gera a própria chave quando `bridge.secret` está vazio. Antes de usar a integração ponta a ponta, o plugin precisa ser atualizado para aceitar a chave gerada pelo bot. O roteiro exato está em [PLUGIN-IMPLEMENTATION-HANDOFF.md](PLUGIN-IMPLEMENTATION-HANDOFF.md).

## 1. Configurar a chave no bot

1. Inicie o bot. Na primeira inicialização, ele gera uma chave aleatória forte e grava em `DKB_SECRET` no arquivo `.env`.
2. No Discord, um administrador executa `/bridge chave`.
3. Copie a resposta privada. Essa é a chave que será colocada no plugin.
4. Não envie a chave em canais públicos, prints ou mensagens.

Para trocar a chave, use `/bridge regenerar`. Isso invalida imediatamente o valor antigo; depois, atualize o `bridge.secret` do plugin e recarregue-o.

A chave da integração não é o token Discord nem a chave Supabase.

## 2. Teste inicial com computadores diferentes

Não é necessário colocar o plugin em uma host pública do Minecraft. O bot roda no Windows do dono, enquanto o amigo inicia um servidor Paper local e temporário no próprio Windows dele.

Um mundo single-player vanilla não carrega plugins Paper. O teste precisa usar Paper local, mas não é necessário contratar host nem publicar esse servidor.

### No PC do dono do bot

No `.env`:

```env
DKB_HOST=127.0.0.1
DKB_PORT=8787
```

Inicie o bot. A API fica em `http://127.0.0.1:8787`. Configure um túnel/proxy HTTPS que encaminhe o endereço público para esse endereço local. Mantenha o bot e o túnel ligados durante o teste.

Não abra a porta 8787 diretamente no roteador e não exponha HTTP sem HTTPS.

### No PC do amigo

Instale o plugin no servidor Paper local e configure `plugins/DiscordKitBridge/config.yml`:

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

Troque a URL de exemplo pelo endereço HTTPS real do túnel. Use somente a URL base, sem o caminho `/plugin/v1`.

**Não use `127.0.0.1` ou `localhost` no plugin para apontar ao PC do dono do bot.** Esses endereços apontam para o PC do amigo. O plugin deve usar o endereço HTTPS público do túnel.

## 3. Gerar e compartilhar a chave

1. Um administrador executa `/bridge chave` no Discord.
2. O bot exibe a chave em uma resposta privada.
3. O dono do bot compartilha a chave com o amigo por um canal privado.
4. O amigo cola o valor em `bridge.secret` no `config.yml` do plugin.

A chave é gerada e guardada pelo bot em `DKB_SECRET`. O plugin não deve gerar uma chave diferente. A chave não é o token Discord nem a chave Supabase.

A versão atual do plugin ainda precisa ser ajustada para aceitar a chave gerada pelo bot. Consulte o documento de implementação para esse trabalho.

## 3. Criar o kit no Minecraft

Crie o conteúdo do kit em uma Shulker Box e cadastre-o no servidor Paper. Exemplo:

```text
/dk create Kit_Ferro
```

Use um nome de até 32 caracteres com letras, números, `_` ou `-`.

## 4. Cadastrar o mesmo produto na loja do Discord

No Discord, use `/kit adicionar` e informe:

- Nome exato do kit no plugin, como `Kit_Ferro`.
- Preço.
- Descrição.
- Link HTTPS da imagem (opcional).

O cadastro comercial no bot não cria nem altera os itens do plugin. Os itens reais continuam no kit do Minecraft. Os dois nomes precisam corresponder.

## 5. Confirmar que o plugin está se comunicando

Use `/bridge status` no Discord. A resposta mostra se a API local está online e quais kits foram enviados pelo plugin.

A lista enviada pelo plugin é usada para diagnóstico. O cadastro comercial da loja permanece no bot, para que o administrador defina preço, descrição e imagem.

## 6. Fluxo de compra

1. O cliente escolhe o kit.
2. O bot mostra a prévia privada com nome, preço, descrição e imagem, com os botões **Trocar kit** e **Confirmar kit**.
3. Ao confirmar, o cliente informa o nick Java no formulário.
4. Ao enviar o nick, o bot cria o ticket privado com a prévia do kit e as informações de pagamento.
5. A equipe confere o comprovante e confirma ou recusa o pagamento.
6. Só após a aprovação, o bot envia ao plugin o nick, `platform: "java"`, o nome exato do kit e um `request_id`.
7. O plugin executa a entrega e responde no ticket.

O plugin usa o identificador do pedido para impedir entregas duplicadas quando a mesma solicitação é reenviada.

## 7. Quando o bot for hospedado em VPS

A hospedagem Minecraft continuará usando o modo `poll`. Publique a API do bot por uma rota HTTPS e configure `bridge.poll.url` com a URL HTTPS pública, sem acrescentar `/plugin/v1`.

O padrão mais simples é deixar o Node escutando em `127.0.0.1:8787` na VPS e configurar um proxy reverso HTTPS para encaminhar à porta local. Não exponha a porta HTTP diretamente à internet.

## 8. Supabase

Supabase guarda o snapshot do estado do bot e é independente da API Minecraft. O segredo `DKB_SECRET` não deve ser colocado no banco. Consulte [SUPABASE.md](SUPABASE.md).
