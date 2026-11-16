# Guia do ASTHEN BOT

Guia operacional único para instalar, configurar e manter o bot. O contrato técnico da integração fica em [PLUGIN-INTEGRATION.md](PLUGIN-INTEGRATION.md); endereços HTTPS ficam em [TUNNEL-SETUP.md](TUNNEL-SETUP.md).

## 1. Instalar

### Windows

1. Extraia o ZIP.
2. Execute `INSTALAR.bat`.
3. Informe o token do bot e o Application ID.
4. Execute `INICIAR.bat`.

Requisito: Node.js 22 ou mais recente.

### Linux

~~~bash
bash linux/setup-linux.sh
bash linux/start-linux.sh
~~~

## 2. Canais do Discord

Use estes quatro nomes. O bot procura os canais automaticamente quando inicia ou reinicia; emoji e separadores não atrapalham a identificação. Quando encontra os nomes padrão, eles têm prioridade sobre IDs manuais antigos.

| Canal | Uso |
|---|---|
| `#atendimento` | Painel de suporte e tickets gerais. |
| `#kits` | Painel da loja e catálogo do Minecraft. |
| `#logs` | Registros administrativos, privado para equipe. |
| `#compradores` | Avisos de compras confirmadas. |

Configure também o cargo autorizado a revisar pagamentos:

~~~text
/configurar atendimento:#atendimento kits:#kits logs:#logs compradores:#compradores equipe:@Equipe
~~~

Os campos `atendimento` e `kits` são opcionais quando os canais já existem com esses nomes. `logs` é protegido contra visualização pública quando o bot o reconhece pela primeira vez; configure `equipe` para liberar o canal ao grupo responsável. Administradores continuam tendo acesso.

### Mensagens dos painéis

- Na primeira inicialização da 2.15.0, cada painel legado é atualizado uma vez para corrigir o layout e o texto. A versão do painel fica salva.
- Nas próximas inicializações, o bot procura a mensagem do próprio painel e preserva o conteúdo sem editar nem republicar.
- Se a mensagem tiver sido apagada, o bot publica outra.
- Se o ID local tiver sido perdido, procura os 50 envios mais recentes do próprio bot para evitar duplicar o painel.
- Sincronizar kits e editar nome/descrição/imagem não altera a mensagem fixa de `#kits`; o catálogo atualizado aparece quando alguém clica em **Abrir kits**.
- Para atualizar manualmente um painel depois de uma mudança de texto, execute `/configurar atendimento:#atendimento` ou `/configurar kits:#kits`.

## 3. Loja e kits

O **Plugin-ASTHEN é a única origem dos kits reais**. Crie o kit no Minecraft, configure preço e disponibilidade no plugin e aguarde a sincronização. Ele aparece automaticamente no catálogo.

No Discord, os únicos comandos de administração de kits são:

- `/kit listar`: mostra kits recebidos do Minecraft e o estado de venda.
- `/kit editar`: altera nome exibido, descrição e imagem HTTPS.

O Discord não cria kits, não altera seus itens, preço ou disponibilidade oficial. Para controlar o preço no Minecraft, use `/dk price Kit_Ferro 19,90`; sem preço ou com a venda desativada, o kit fica indisponível.

### Kit Demonstração

Enquanto não houver kits reais sincronizados nesta execução do bot, o catálogo mostra **Kit Demonstração**. O botão do painel `#kits` permanece ativo mesmo nesse estado.

O demo pode ser selecionado para conferir a prévia, mas não abre ticket de compra, não gera Pix, não reserva estoque e não chama a entrega do Minecraft. Quando um kit real chega, ele substitui o demo automaticamente.

## 4. Atendimento e tickets

No painel `#atendimento`, o cliente seleciona um assunto: compras/kits, ajuda no servidor, problemas, denúncias ou outros assuntos. O bot cria um canal privado dentro da categoria do painel, quando houver uma categoria definida.

O cliente e a equipe autorizada conseguem ver o ticket. O cliente pode enviar detalhes, imagens e logs. A equipe continua o atendimento dentro do canal.

Tickets de compra são abertos pela loja. O bot mostra QR Code, chave Pix e valor; a equipe confere o comprovante manualmente antes de aprovar. A reserva semanal só ocorre na aprovação.

## 5. Supabase

Abra **Supabase → SQL Editor → New query** e execute o arquivo completo `supabase/SETUP.sql`.

Ele cria as três tabelas e a função de reserva necessárias:

| Objeto | Uso |
|---|---|
| `asthen_bot_state` | Snapshot de configurações, kits sincronizados e tickets. |
| `asthen_bot_weekly_stock` | Contagem semanal por kit e servidor. |
| `asthen_bot_stock_reservations` | Reserva idempotente por compra aprovada. |
| `reserve_asthen_weekly_kit_stock(...)` | Reserva transacional, com limite de 10 por kit/semana. |

Não crie `asthen_bot_kits` para esta versão. Uma tabela antiga com esse nome pode permanecer no projeto; o bot 2.15.0 não a consulta.

No `.env`, use:

~~~env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=sb_secret_SUA_CHAVE
SUPABASE_TABLE=asthen_bot_state
~~~

`SUPABASE_URL` é a URL base, sem `/rest/v1`. A chave secreta fica só no `.env` do bot. Não publique esse arquivo.

Cada kit tem até 10 unidades por semana, por servidor Discord. O estoque reinicia domingo às 00:00, horário de Brasília. Abrir o catálogo ou ticket não consome unidade; a reserva acontece na aprovação.

## 6. Atualizar sem perder dados

Antes de substituir os arquivos, faça cópia de `.env` e de toda a pasta `data/`.

- `.env`: token Discord, `DKB_SECRET` e credenciais Supabase.
- `data/state.json`: configurações, kits sincronizados, tickets e pedidos.
- `data/bridge-queue.json`: fila persistente de entregas.

Substitua o restante pelos arquivos da nova versão. Não compartilhe `.env`, `DKB_SECRET`, chave Pix ou credenciais do Supabase.

## 7. Verificações

~~~bash
npm run check
npm run check:commands
npm test
~~~

Para o fluxo de entrega, mantenha o bot e o servidor Paper conectados. Os testes automatizados não substituem a validação de uma compra real em servidor de teste.
