# Comandos do ASTHEN BOT 2.7.0

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

Remove o produto do catálogo da loja. Não apaga os itens do servidor Minecraft. Para excluir o kit real, use o comando administrativo de exclusão do próprio plugin. A próxima sincronização atualiza a lista do bot e remove o registro antigo do Supabase.

## Integração

- /bridge status: mostra se a API local está online, quantos pedidos aguardam resposta, a última lista de kits recebida do plugin e o estado do Supabase.
- /bridge chave: mostra em privado a chave de integração salva no .env.

A chave é gerada uma vez por instalação e permanece igual nas atualizações normais. Não existe comando para regenerá-la. Preserve o arquivo .env.

## Pagamento

A chave Pix e o QR Code são fixos no código da loja. Não existe comando /pix. A mensagem do pedido contém o QR, a chave, o botão **Copiar Pix** e a orientação para anexar o comprovante.

A equipe confere o comprovante manualmente. Depois, um membro autorizado confirma ou recusa o pedido.
