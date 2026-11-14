# Integração com o Plugin-ASTHEN

A integração usa o modo `poll`: o plugin Minecraft inicia as conexões e consulta a API hospedada pelo bot. Assim, o servidor Minecraft não precisa aceitar conexões de entrada. Para uma hospedagem separada, publique a porta do bot por um túnel/proxy HTTPS.

## 1. Preparar o plugin

1. Instale o Plugin-ASTHEN no servidor Paper e reinicie.
2. Abra `plugins/DiscordKitBridge/config.yml`.
3. Mantenha `bridge.enabled: true` e `bridge.mode: "poll"`.
4. Na primeira execução, o plugin gera um segredo forte em `bridge.secret`. Copie esse valor.
5. Defina `bridge.poll.url` com a URL base HTTPS do bot, sem acrescentar `/plugin/v1`.
6. Execute `/dk reload` depois de alterar a configuração.

O plugin consulta estes endpoints no bot:
- `GET /plugin/v1/pull`: busca pedidos aprovados.
- `POST /plugin/v1/result`: devolve o resultado da entrega.
- `POST /plugin/v1/kits`: sincroniza a lista de kits ativos.

Todas as chamadas usam `Authorization: Bearer <segredo>`.

## 2. Configurar o bot

Na primeira inicialização, responda à configuração de Plugin-ASTHEN e cole o valor de `bridge.secret`. O bot grava o segredo no `.env` local como `DKB_SECRET`. Não use a chave do Supabase nesse campo.

Por padrão, a API do bot escuta somente em `127.0.0.1:8787`. Se o plugin estiver em outro host, crie um túnel/proxy HTTPS apontando para essa porta e use a URL pública resultante em `bridge.poll.url`. Não exponha a porta sem autenticação/TLS.

## 3. Cadastrar kits

Os kits são criados no servidor Minecraft a partir de uma Shulker Box preenchida:

```text
/dk create Kit_Ferro
/dk create Kit_Dima
/dk create Kit_Netherita
/dk create Kit_Elytra
/dk create Kit_Construcao
```

Use exatamente os identificadores acima (ou os nomes que você decidiu cadastrar) e mantenha cada nome dentro das regras do plugin: letras, números, `_` e `-`, até 32 caracteres.

Depois que o plugin enviar a lista de kits ao bot, configure a apresentação comercial no Discord:

```text
/kit configurar
```

Selecione o kit sincronizado e informe preço, descrição e imagem. Preço, descrição e imagem ficam no bot; os itens reais ficam no plugin em `plugins/DiscordKitBridge/kits/`.

## 4. Fluxo de compra

1. O cliente escolhe um kit no menu da loja.
2. O bot mostra a prévia e coleta o nick Java.
3. O cliente confirma os dados e recebe um canal privado de pagamento.
4. Um administrador verifica o comprovante e confirma o pagamento.
5. Só depois da confirmação, o bot envia ao plugin o nick, a plataforma Java, o nome exato do kit e um identificador único do pedido.
6. O plugin valida jogador/kit e entrega os itens no inventário. O resultado retorna ao ticket do Discord.

Resultados comuns:
- `KIT_DELIVERED`: itens entregues.
- `KIT_PENDING`: inventário cheio; plugin guardou o kit para `/dk claim`.
- `PLAYER_OFFLINE`, `KIT_NOT_FOUND`, `KIT_DISABLED` ou `PLATFORM_MISMATCH`: entrega não realizada; o bot mostra a razão.

O identificador do pedido é idempotente. Se houver timeout ou perda de resposta, a nova tentativa reutiliza o mesmo identificador para evitar uma segunda entrega.

## 5. Kits e recursos não implementados

O plugin atual entrega o conteúdo salvo na Shulker Box. Ele ainda não implementa o efeito KeepInventory ao morrer. Portanto, não anuncie nem venda o Kit Keep como proteção contra perda de inventário até que esse recurso seja implementado e testado no plugin.

## 6. Supabase

Supabase é separado da bridge Minecraft. Ele guarda o snapshot de estado do bot; não transporta comandos de entrega. O segredo `DKB_SECRET` não deve ser salvo no Supabase. Para a configuração do banco, consulte [SUPABASE.md](SUPABASE.md).
