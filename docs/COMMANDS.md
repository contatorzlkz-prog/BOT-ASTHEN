# Comandos

Todos os comandos exigem **Gerenciar servidor**.

## Configuração em um só comando

```text
/configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe
```

Informe qualquer combinação de campos:
- `suporte`: publica ou atualiza o painel de atendimento.
- `loja`: publica ou atualiza o painel de compras.
- `logs`: canal privado de auditoria de pedidos. O bot oculta o canal de @everyone e libera acesso à equipe informada e aos administradores.
- `compradores`: canal público que recebe o anúncio de cada pedido aprovado.
- `equipe`: cargo que atende os tickets e revisa os pedidos.

O ticket é criado na categoria do respectivo canal do painel.

## Pagamento

```text
/pix chave:SUA_CHAVE instrucoes:Envie o comprovante neste canal.
```

## Kits

- `/kit adicionar`: cadastro guiado de nome, preço e descrição.
- `/kit listar`: lista os kits.
- `/kit remover nome:Kit Demo 1`: remove pelo nome.

## Fluxo da loja

1. O cliente clica em **Abrir catálogo** e escolhe um kit.
2. Informa o nick do Minecraft.
3. Confere o produto, o preço e o nick. Pode editar ou cancelar.
4. O ticket só é aberto quando confirma.
5. O cliente realiza o Pix e envia o comprovante no canal privado.
6. A equipe confirma ou recusa. A decisão é registrada em logs privados e não fecha o ticket.
7. Quando aprovado, o bot anuncia o comprador e o kit no canal público configurado.
8. **Fechar** exclui o canal depois de três segundos.

A aprovação é manual. O bot não valida comprovantes bancários e não realiza a entrega do item no Minecraft.
