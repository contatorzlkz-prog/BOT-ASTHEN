# Comandos administrativos

Os comandos abaixo são disponibilizados no Discord. Com exceção dos comandos de atendimento usados pelos membros, estes comandos administrativos exigem a permissão **Gerenciar servidor**.

## Configuração do servidor

```text
/configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe
```

Informe os canais e o cargo que a equipe usará para atender pedidos:

- `suporte`: publica ou atualiza o painel de atendimento.
- `loja`: publica ou atualiza o painel da loja.
- `logs`: canal privado para registrar decisões de pedidos.
- `compradores`: canal para anunciar compras aprovadas.
- `equipe`: cargo que pode atender tickets e revisar pagamentos.

Os tickets são criados na categoria do canal usado para o painel.

## Pagamento

```text
/pix chave:SUA_CHAVE instrucoes:Envie o comprovante neste canal.
```

O bot mostra os dados configurados dentro do ticket de compra.

## Kits da loja

- `/kit adicionar`: abre o cadastro guiado do produto. Informe o nome exato do plugin, preço, descrição e link HTTPS opcional para imagem.
- `/kit listar`: lista os produtos cadastrados no bot.
- `/kit remover nome:Kit_Ferro`: remove o produto da loja sem apagar o kit real do servidor Minecraft.

O cadastro comercial não cria os itens do jogo. O mesmo identificador precisa ter sido criado anteriormente no Plugin-ASTHEN.

## Integração Minecraft

- `/bridge status`: mostra se a API local está online, quantos pedidos aguardam resposta, a última lista de kits recebida do plugin e o estado do Supabase.
- `/bridge chave`: exibe em resposta privada a chave que deve ser colocada em `bridge.secret` no `config.yml` do plugin.
- `/bridge regenerar`: cria uma nova chave e invalida a anterior. Depois, atualize `bridge.secret` no plugin e recarregue-o.

Não envie a chave em mensagens públicas. Ela é diferente do token do Discord e da chave Supabase.

## Fluxo de compra

1. O cliente abre o catálogo e escolhe um kit.
2. O bot mostra a prévia com nome, preço, descrição e imagem.
3. O cliente pode trocar o kit ou confirmar.
4. Ao confirmar, informa o nick Java no formulário.
5. Ao enviar o formulário, o ticket privado é criado com a prévia e os dados de pagamento.
6. O cliente envia o comprovante.
7. A equipe confirma ou recusa o pagamento. A decisão é registrada no canal privado de logs e, quando aprovada, o comprador é anunciado no canal configurado.
8. Após a aprovação, o bot pede ao plugin a entrega do kit. O resultado aparece no próprio ticket.
9. O botão Fechar encerra o atendimento.

O bot não valida comprovantes bancários automaticamente. A conferência do pagamento continua sendo manual.
