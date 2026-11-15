# Comandos do ASTHEN BOT 2.9.0

## Quem pode usar

- **`/kit`:** somente membros com a permissão Discord **Administrador**.
- **`/configurar` e `/bridge status`:** administradores ou membros com **Gerenciar servidor**.
- **Ações de pedidos:** administradores ou membros com o cargo da equipe configurado em `/configurar`.

## Configurar canais

~~~text
/configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe
~~~

| Campo | Para que serve |
|---|---|
| `suporte` | Publica o painel de atendimento. |
| `loja` | Publica o botão que abre o catálogo. |
| `logs` | Recebe registros privados de aprovação, recusa e fechamento. |
| `compradores` | Recebe avisos de compras confirmadas. |
| `equipe` | Cargo autorizado a confirmar/recusar pagamentos, repetir entregas e fechar tickets. |

## Gerenciar kits

### Primeiro: criar o kit real no Minecraft

Use o comando de criação do Plugin-ASTHEN dentro do servidor Paper. Por exemplo, nas versões que usam o comando `/dk create`:

~~~text
/dk create Kit_Ferro
~~~

O plugin guarda os itens do kit e envia a lista ao bot. Aguarde a sincronização; confira com `/bridge status`.

### `/kit criar`

Cadastra na loja do Discord um kit real que já foi recebido do plugin.

1. Escolha um kit ainda não cadastrado comercialmente.
2. Preencha o nome que o cliente verá.
3. Informe o preço em reais, por exemplo `19,90`.
4. Escreva uma descrição curta e útil.
5. Cole um link HTTPS para a imagem, se tiver.

O nome técnico do plugin não é alterado. A imagem é opcional.

**Esse comando não cria os itens dentro do Minecraft.** Ele apenas configura a apresentação comercial de um kit que já existe no plugin.

### `/kit listar`

Mostra o nome comercial, preço, nome original do plugin, estado do kit no Minecraft e situação do cadastro da loja.

### `/kit editar`

1. Selecione um kit.
2. Escolha o campo que deseja alterar.
3. Preencha o novo valor.

Campos disponíveis: nome exibido, preço, descrição, imagem HTTPS e disponibilidade comercial.

### `/kit remover`

Marca o produto como indisponível para novas compras. Não apaga o cadastro do bot, a linha do Supabase, os itens no Minecraft ou os pedidos antigos.

Se o plugin desativar ou remover um kit, o bot também o mantém visível como indisponível. Para permitir a compra novamente, o kit precisa existir e estar ativo no plugin.

## Integração

### `/bridge status`

Mostra:
- se a API local está online;
- quantos pedidos aguardam resposta;
- quantos kits chegaram do plugin;
- quando a lista de kits foi recebida pela última vez;
- se o Supabase está configurado e quando sincronizou pela última vez.

A chave `DKB_SECRET` nunca é mostrada no Discord. Copie-a diretamente do `.env` local do bot e configure o mesmo valor em `bridge.secret` no `config.yml` do plugin.

## Pagamento

Não existe comando `/pix`. A chave e o QR Code ficam na própria mensagem de pagamento. A equipe confere o comprovante manualmente antes de aprovar o pedido.
