# Comandos do ASTHEN BOT 2.8.0

Os comandos administrativos exigem a permissão **Gerenciar servidor**. Para revisar pagamentos e fechar tickets, também é autorizado o cargo definido em /configurar equipe.

## Configurar canais

~~~text
/configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe
~~~

- suporte: publica o seletor de departamentos Minecraft.
- loja: publica o botão que abre o catálogo de kits.
- logs: recebe registros privados de aprovação, recusa e fechamento.
- compradores: recebe os anúncios de compras confirmadas.
- equipe: cargo que pode revisar pagamentos, repetir entregas e fechar tickets.

Os tickets são criados na categoria do canal usado para o painel correspondente.

## Gerenciar kits

### /kit listar

Lista os kits recebidos do plugin, seus nomes de exibição, preços e estado no Minecraft.

### /kit editar

1. Selecione um kit sincronizado do plugin.
2. Selecione a informação a alterar.
3. Edite o nome de exibição, preço, descrição ou imagem HTTPS.

O identificador técnico do plugin não é alterado. Por exemplo, o plugin pode continuar usando Kit_Ferro, enquanto a loja exibe “Kit Ferro”.

### /kit remover

Marca o produto como indisponível, preservando preço, descrição e histórico. Se o plugin remover o kit, ele continua no catálogo como indisponível.

## Integração

- /bridge status: mostra se a API local está online, quantos pedidos aguardam resposta, a última lista de kits recebida do plugin e o estado do Supabase.
- o arquivo `.env` local: mostra a situação da API e da sincronização; a chave nunca aparece no Discord.

A chave `DKB_SECRET` é gerada uma vez por instalação e permanece igual nas atualizações normais. Preserve o `.env` e configure o mesmo valor em `bridge.secret` no plugin.

## Pagamento

A chave Pix e o QR Code são fixos no código da loja. Não existe comando /pix. A mensagem do pedido contém o QR, a chave, o botão **Copiar Pix** e a orientação para anexar o comprovante.

A equipe confere o comprovante manualmente. Depois, um membro autorizado confirma ou recusa o pedido.

## Plataforma do pedido

O cliente informa o nick e escolhe Java ou Bedrock. A plataforma fica salva no pedido e é enviada ao plugin na aprovação.
