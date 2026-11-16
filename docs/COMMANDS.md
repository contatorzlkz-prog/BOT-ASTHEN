# Comandos do ASTHEN BOT 2.14.0

## Permissões

- `/kit listar` e `/kit editar`: somente Administrador.
- `/configurar` e `/bridge status`: Administrador ou Gerenciar servidor.
- Aprovação/recusa de pedidos: Administrador ou cargo da equipe configurado.

## Configurar o servidor

~~~text
/configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe
~~~

| Campo | Finalidade |
|---|---|
| `suporte` | Painel de atendimento. |
| `loja` | Painel da loja de kits sincronizados do Minecraft. |
| `logs` | Registros privados de aprovação, recusa e fechamento. |
| `compradores` | Avisos de compras confirmadas. |
| `equipe` | Cargo autorizado a revisar pagamentos e fechar tickets. |

## Kits

Os kits reais são criados exclusivamente no Minecraft pelo Plugin-ASTHEN. Quando o plugin sincroniza a lista, os produtos aparecem automaticamente na loja do Discord.

### No Minecraft

Crie o kit no Paper com o comando do Plugin-ASTHEN e configure o preço no jogo:

~~~text
/dk price Kit_Ferro 19,90
~~~

Kit sem preço ou desativado pelo plugin aparece como indisponível. O bot não altera os itens nem o preço.

### `/kit listar`

Lista os kits recebidos do Minecraft, seu estado e a disponibilidade de venda.

### `/kit editar`

Selecione um kit sincronizado e altere somente:

- Nome exibido para o comprador.
- Descrição comercial.
- Imagem HTTPS.

Não existe `/kit criar` nem `/kit remover`. A criação e o estado real da venda pertencem ao Plugin-ASTHEN.

### Kit Demonstração

Antes da primeira sincronização do Minecraft, a loja mostra um único produto de demonstração. Ele serve apenas para conferir a aparência da loja; não permite abrir pedido, gerar Pix, reservar estoque ou entregar itens. O demo some quando o plugin envia a primeira lista.

## Integração

### `/bridge status`

Mostra se a API local está online, quantidade de pedidos aguardando resposta, quantidade de kits sincronizados, horário da última sincronização e estado do Supabase.

O segredo `DKB_SECRET` não é exibido no Discord. Copie o valor diretamente do `.env` do bot e configure o mesmo valor em `bridge.secret` no `config.yml` do plugin.

## Pagamentos

Não existe `/pix`. A mensagem do pedido já contém QR Code, chave e botão para copiar. A equipe confere o comprovante manualmente antes de aprovar.

## Estoque semanal

- Até 10 unidades por kit, por servidor Discord.
- Abrir catálogo ou ticket não consome uma unidade.
- A reserva ocorre ao aprovar o pagamento.
- O estoque reinicia no domingo às 00:00, horário de Brasília.
- A reserva é persistida no Supabase e é idempotente por ticket.
