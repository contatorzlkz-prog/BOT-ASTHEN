# Integração do ASTHEN BOT 2.13.0 (candidato) com Plugin-ASTHEN 1.2.0 / 1.3.0

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

### No PC do bot — Tailscale Funnel (recomendado para testes entre dois Windows)

1. Instale o Tailscale no PC que executa o BOT-ASTHEN: https://tailscale.com/download/windows
2. Entre no tailnet da conta Tailscale.
3. Inicie o BOT-ASTHEN e confira a API em http://127.0.0.1:8787.
4. Abra PowerShell como Administrador e padronize o nome da máquina:

~~~powershell
tailscale set --hostname=asthen-bot
~~~

5. Ative o Funnel em segundo plano:

~~~powershell
tailscale funnel --bg 8787
~~~

6. Copie o endereço completo exibido, no formato https://asthen-bot.NOME-DO-TAILNET.ts.net.
7. Confira com tailscale funnel status.

Fechar o PowerShell não encerra o Funnel porque --bg mantém a configuração no serviço Tailscale. O BOT-ASTHEN, porém, precisa continuar rodando. Se fechar o processo do bot, o túnel fica ativo, mas a API não responde. O PC também precisa permanecer ligado e conectado.

O servidor Paper do amigo não precisa instalar Tailscale: ele acessa a URL pública HTTPS normalmente.

Para o Plugin-ASTHEN 1.2.0, mantenha o polling tradicional:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "COLE_LOCALMENTE_O_MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://asthen-bot.NOME-DO-TAILNET.ts.net"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
~~~

Quando o Plugin-ASTHEN 1.3.0 com Long Polling estiver instalado, troque para wait-seconds: 20 e http-timeout: 35 conforme o prompt de implementação. Não adicione a seção long-poll ao plugin 1.2.0 esperando que ela funcione.

### Migração para VPS sem trocar o hostname

A URL pode ser reutilizada se a VPS entrar no mesmo tailnet e receber o nome asthen-bot. O nome deve ser liberado no dispositivo antigo antes da VPS assumir:

1. Pare o bot antigo e remova a publicação antiga do Funnel com tailscale funnel reset.
2. Renomeie o PC Windows antigo para asthen-windows, pelo painel Tailscale ou usando tailscale set --hostname=asthen-windows.
3. Instale o Tailscale na VPS e entre no mesmo tailnet.
4. Na VPS, execute sudo tailscale set --hostname=asthen-bot.
5. Configure o bot na VPS para iniciar e escutar em 127.0.0.1:8787.
6. Ative sudo tailscale funnel --bg 8787 e confira tailscale funnel status.

Se o nome DNS do tailnet não mudar, a URL completa será novamente https://asthen-bot.NOME-DO-TAILNET.ts.net. Pode haver indisponibilidade durante a transferência. Não tente manter dois dispositivos com o nome asthen-bot ao mesmo tempo: nomes de máquinas são únicos no tailnet.

Guia completo: [TÚNEL HTTPS](TUNNEL-SETUP.md).

### Entrega quando o jogador está offline ou com inventário cheio

No plugins/DiscordKitBridge/config.yml, ajuste estas opções:

~~~yaml
kits:
  require-online: false

delivery:
  pending-if-inventory-full: true
~~~

require-online: false é obrigatório para permitir que a compra aprovada seja enfileirada quando o jogador estiver offline. Quando ele entrar, o PlayerListener tenta entregar automaticamente. Se o inventário ainda estiver cheio, o plugin mantém o kit pendente e envia uma mensagem para liberar espaço e usar /dk claim. O plugin atual não tenta novamente a cada slot liberado sem o comando; a próxima entrada também dispara a tentativa automática.

Depois de alterar o arquivo, execute /dk reload se a versão do plugin oferecer recarga de configuração, ou reinicie o servidor.

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

**Long Polling:** o BOT-ASTHEN 2.12.0 e a proposta 2.13.0 aceitam o parâmetro opcional `wait_ms` em GET /plugin/v1/pull. O plugin 1.2.0 não envia esse parâmetro e continua no polling tradicional. O plugin 1.3.0 deve enviar `wait_ms=20000`, aceitar HTTP 204 como resposta normal e usar timeout HTTP de pelo menos 30 segundos (configuração recomendada: 35 segundos).

Todas as rotas usam:

~~~http
Authorization: Bearer <DKB_SECRET>
~~~

- GET /plugin/v1/pull?limit=5: busca pedidos. Sem pedidos, responde HTTP 204.
- O BOT-ASTHEN 2.12.0 também aceita GET /plugin/v1/pull?limit=5&wait_ms=20000: mantém a conexão aberta por até 20 segundos, acordando-a imediatamente quando um pedido chega. O bot aceita no máximo 25.000 ms e retorna 204 quando o prazo termina sem pedidos. O plugin 1.2.0 continua compatível, mas só a versão 1.3.0 com suporte a Long Polling enviará wait_ms.
- POST /plugin/v1/result: recebe resultado final de entrega.
- POST /plugin/v1/kits: recebe a lista completa dos kits do plugin, incluindo `name`, `enabled`, `items`, `price`, `price_cents` e `for_sale`.
- POST /plugin/v1/delivery-update: disponível na proposta BOT-ASTHEN 2.13.0 para registrar a transição posterior `KIT_PENDING` → `KIT_DELIVERED`. Exige `request_id` previamente conhecido e não reserva estoque novamente. O Plugin-ASTHEN 1.2.0 ainda não chama essa rota.

A API do bot envia request_id, player, a plataforma escolhida pelo cliente (java ou bedrock) e o identificador exato do kit. O plugin continua responsável por entregar os itens.

### Fila persistente e status posterior — proposta 2.13.0

A proposta 2.13.0 mantém os pedidos de entrega em data/bridge-queue.json. Preserve toda a pasta data/ ao atualizar o bot. Se o processo reiniciar, os pedidos sem resultado voltam a ser oferecidos ao plugin usando o mesmo request_id.

Quando o plugin responde KIT_PENDING, esse é o resultado final inicial. Depois que o jogador retirar o kit, o Plugin-ASTHEN 1.3.0 poderá enviar POST /plugin/v1/delivery-update com o mesmo request_id e status KIT_DELIVERED. O bot valida a transição e atualiza o ticket. Não envie um segundo resultado final por POST /plugin/v1/result.

Essa atualização posterior exige os dois lados atualizados: BOT-ASTHEN 2.13.0 e Plugin-ASTHEN 1.3.0. Com Plugin-ASTHEN 1.2.0, a entrega inicial continua funcionando, mas o Discord não recebe a mudança posterior de KIT_PENDING para KIT_DELIVERED.

## 6. Fluxo de compra

1. O cliente escolhe um kit e confirma a prévia.
2. Informa o nick do Minecraft.
3. O bot abre o ticket com QR Pix, chave, valor e instrução compacta para anexar o comprovante.
4. Um membro autorizado da equipe confere o comprovante e confirma o pagamento.
5. O bot solicita a entrega ao plugin com o nick e a plataforma Java ou Bedrock escolhida pelo cliente.
6. Se o jogador estiver offline e kits.require-online: false, o plugin guarda o kit como pendente e tenta entregá-lo automaticamente quando ele entrar.
7. Se o inventário estiver cheio, delivery.pending-if-inventory-full: true mantém o kit pendente; o servidor pede para liberar espaço e usar /dk claim.
8. O plugin devolve o resultado. O comprador recebe uma mensagem clara e a equipe recebe detalhes técnicos. Em caso de timeout, o bot tenta novamente uma vez com o mesmo request_id.

O mesmo request_id deve ser reutilizado em uma repetição de entrega para evitar duplicidade.

## 7. Supabase

Em uma instalação nova, execute todo o arquivo supabase/SETUP.sql. Em um banco que já usa 2.10.0, execute supabase/005_asthen_bot_weekly_kit_stock.sql. Se estiver vindo da 2.7.0, aplique 003, 004 e 005 nessa ordem. Consulte SUPABASE.md.

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


## 8. Long Polling — BOT-ASTHEN 2.12.0

O bot agora aceita o parâmetro opcional wait_ms em GET /plugin/v1/pull. Exemplo: /plugin/v1/pull?limit=5&wait_ms=20000.

- Com wait_ms, o bot deixa a requisição HTTP aguardando por até 20 segundos.
- Quando a equipe aprova uma compra, a fila acorda o pull imediatamente e responde HTTP 200 com os pedidos.
- Quando nada chega, retorna HTTP 204 ao final do tempo.
- O limite do bot é 25 segundos por pull.
- A rota antiga sem wait_ms continua funcionando, então o plugin 1.2.0 não quebra.

Para ativar a economia de consultas, atualize também o plugin para a versão 1.3.0 conforme o [prompt de implementação](PLUGIN-LONG-POLLING-PROMPT.md). O prompt propõe wait-seconds: 20 e http-timeout: 35. O plugin 1.2.0 continua usando polling tradicional até ser atualizado.

## 9. Endereço público fixo

Veja [TUNNEL-SETUP.md](TUNNEL-SETUP.md) para tunnel.to Registered Free e Cloudflare Tunnel. O bot continua em 127.0.0.1:8787; somente o hostname HTTPS configurado no plugin muda conforme o provedor do túnel.
