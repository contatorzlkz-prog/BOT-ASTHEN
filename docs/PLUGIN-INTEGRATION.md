# Integração do ASTHEN BOT 2.10.0 com o Plugin-ASTHEN 1.2.0

A integração usa o modo poll: o plugin faz as conexões de saída para buscar pedidos e devolver resultados. O servidor Minecraft não precisa aceitar conexões de entrada.

## 1. Arquitetura

- O ASTHEN BOT executa a API local em 127.0.0.1:8787 no computador do dono do bot.
- O Plugin-ASTHEN executa dentro do servidor Paper, que pode estar em outro computador ou host.
- O plugin consulta uma URL HTTPS pública que encaminha as chamadas até a API do bot.
- A chave de autenticação é gerada uma vez pelo bot e fica em DKB_SECRET no .env.

## 2. Chave estável da integração

1. Inicie o bot uma vez para gerar e salvar `DKB_SECRET` no `.env`.
2. No computador do bot, abra o `.env` e copie o valor de `DKB_SECRET`.
3. No computador do Minecraft, coloque exatamente o mesmo valor em `bridge.secret` no `config.yml` do plugin.
4. Não envie o segredo por Discord, chat, prints ou repositórios.

A chave é criada somente quando DKB_SECRET ainda não existe. Ela permanece igual quando o bot é atualizado, desde que o arquivo .env seja preservado. Não existe comando de regeneração nesta versão.

O plugin ainda gera uma chave própria se `bridge.secret` estiver vazio. Por isso, preencha manualmente esse campo com o valor de `DKB_SECRET` do bot. Não é preciso publicar nem enviar o segredo.

## 3. Testar com computadores diferentes

Não é preciso hospedar o servidor Minecraft publicamente para o primeiro teste. O responsável pelo plugin pode iniciar um servidor Paper local no próprio Windows. Um mundo single-player vanilla não carrega plugins Paper; é necessário iniciar Paper localmente, mas não é preciso publicar o servidor nem contratar hospedagem.

### No PC do bot

No .env:

~~~env
DKB_HOST=127.0.0.1
DKB_PORT=8787
~~~

1. Inicie o bot com INICIAR.bat.
2. Confira no console: [Asthen Bridge] API ativa em http://127.0.0.1:8787.
3. Baixe o cloudflared para Windows 64-bit pela [página oficial](https://developers.cloudflare.com/tunnel/downloads/).
4. Renomeie o arquivo para cloudflared.exe e coloque-o na pasta do bot.
5. Execute INICIAR-TUNEL.bat.
6. Copie a URL https://....trycloudflare.com que aparecer no console.

A URL Quick Tunnel é temporária e muda quando o túnel é criado novamente. Mantenha o bot e a janela do túnel abertos durante o teste. É uma solução para testes, não para produção. [Documentação do Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/).

### No PC/host do Minecraft

No plugins/DiscordKitBridge/config.yml:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "COLE_LOCALMENTE_O_MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://ENDERECO-HTTPS-DO-TUNEL"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
~~~

Use a URL HTTPS gerada pelo túnel, sem acrescentar /plugin/v1. Não use localhost ou 127.0.0.1 para chegar ao PC do dono do bot.

## 4. Kits: plugin como origem dos itens

O administrador cria o kit real no Minecraft usando o comando do Plugin-ASTHEN (por exemplo, `/dk create Kit_Ferro`, conforme a versão instalada). O plugin envia a lista completa em `POST /plugin/v1/kits` e o bot importa os novos identificadores.

Depois, um administrador do Discord pode:
- `/dk price <nome> <valor>` no Minecraft: definir o preço em reais. Use vírgula ou ponto, por exemplo `29,90`.
- `/dk price <nome> remover`: tirar o kit da venda sem apagar o kit nem seus itens.
- `/dk enable <nome>` e `/dk disable <nome>`: ativar/desativar o kit no servidor.
- `/kit criar` no Discord: cadastrar nome exibido, descrição e imagem HTTPS. O preço não é editado no bot.
- `/kit listar`: ver o estado, preço e disponibilidade sincronizados do Minecraft.
- `/kit editar`: alterar nome comercial, descrição, imagem ou bloqueio manual da loja.
- `/kit remover`: marcar o produto como indisponível no Discord sem apagar seu cadastro, histórico ou o arquivo do Minecraft.

Todos os comandos `/kit` exigem a permissão **Administrador** no Discord.

**Separação importante:** o plugin é a fonte oficial dos itens, preço e estado de venda. `/kit criar` apenas configura a apresentação comercial no Discord; ele não altera os itens nem o preço do Minecraft.

Para apagar o kit real, use a função de exclusão do plugin. Quando a lista seguinte não contiver mais esse identificador, o bot mantém o produto no catálogo e marca como indisponível. Produtos antigos e pedidos não são apagados.

## 5. Contrato HTTP

Todas as rotas usam:

~~~http
Authorization: Bearer <DKB_SECRET>
~~~

- GET /plugin/v1/pull?limit=5: busca pedidos. Sem pedidos, responde HTTP 204.
- POST /plugin/v1/result: recebe resultado final de entrega.
- POST /plugin/v1/kits: recebe a lista completa dos kits do plugin, incluindo `name`, `enabled`, `items`, `price`, `price_cents` e `for_sale`.

A API do bot envia request_id, player, a plataforma escolhida pelo cliente (java ou bedrock) e o identificador exato do kit. O plugin continua responsável por entregar os itens.

## 6. Fluxo de compra

1. O cliente escolhe um kit e confirma a prévia.
2. Informa o nick do Minecraft.
3. O bot abre o ticket com QR Pix, chave, valor e instrução compacta para anexar o comprovante.
4. Um membro autorizado da equipe confere o comprovante e confirma o pagamento.
5. O bot solicita a entrega ao plugin com o nick e a plataforma Java ou Bedrock escolhida pelo cliente.
6. O plugin devolve o resultado. O comprador recebe uma mensagem clara e a equipe recebe detalhes técnicos. Em caso de timeout, o bot tenta novamente uma vez com o mesmo request_id.

O mesmo request_id deve ser reutilizado em uma repetição de entrega para evitar duplicidade.

## 7. Supabase

Em uma instalação nova, execute todo o arquivo [supabase/SETUP.sql](../supabase/SETUP.sql). Para quem atualizou o bot 2.9.0, execute [supabase/004_asthen_bot_plugin_sale_contract.sql](../supabase/004_asthen_bot_plugin_sale_contract.sql). Em bancos mais antigos que ainda não têm os campos da migração 003, execute 003 e depois 004. Consulte [SUPABASE.md](SUPABASE.md).

### Preço e disponibilidade — contrato do Plugin-ASTHEN 1.2.0

O plugin envia a lista completa com estes campos por kit:

~~~json
{
  "name": "Kit_Ferro",
  "enabled": true,
  "items": 12,
  "price": 29.9,
  "price_cents": 2990,
  "for_sale": true
}
~~~

- `price`: preço em reais, apenas para exibição/compatibilidade.
- `price_cents`: preço inteiro em centavos. O bot usa este campo para calcular o valor exato, sem depender de arredondamento de ponto flutuante.
- `for_sale`: verdadeiro somente quando o kit está ativo e tem preço.
- Sem preço: `price` e `price_cents` vêm como `null`, e `for_sale` vem como `false`.
- Desativado: `enabled` e `for_sale` vêm como `false`.

O bot atualiza o preço quando recebe a lista do plugin. Se o plugin retirar o preço ou enviar `for_sale: false`, o produto fica indisponível e o preço antigo não é mantido como preço de venda. Descrição, nome comercial e imagem definidos no Discord são preservados.

### Entrega em Shulker Box

O Plugin-ASTHEN 1.2.0 monta uma única Shulker Box na mesma cor da caixa usada para cadastrar o kit, com o nome técnico do kit e os itens nos mesmos slots do original. Kits antigos que não guardavam a cor usam a caixa roxa padrão.

A Shulker Box ocupa um único slot do inventário. Se não houver espaço, o plugin guarda o kit completo como pendente, sem entregar só parte dos itens. O jogador pode usar `/dk claim` ou receber a pendência ao entrar, conforme a configuração do plugin. O bot informa essa condição no ticket.

**Verificação do Plugin-ASTHEN 1.2.0 em 15/11/2026:** o GitHub Actions executou os 67 testes JDK-only (67 passaram, 0 falharam) e concluiu `mvn package` com `BUILD SUCCESS` contra a dependência Paper configurada. Consulte [o build 43659388395](https://github.com/ElbsxS1/Plugin-ASTHEN/actions/runs/43659388395).

Isso confirma os testes automatizados e a compilação, mas não executa um servidor Minecraft. A montagem, abertura, cor, slots e retirada da Shulker Box ainda precisam de teste dentro de um servidor Paper real.
