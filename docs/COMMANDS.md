# Comandos

Todos os comandos administrativos exigem a permissão **Gerenciar servidor**.

## Configurar os painéis

```text
/configurar tipo:suporte canal:#suporte equipe:@Equipe
/configurar tipo:loja canal:#loja
```

O painel é publicado imediatamente no canal escolhido. O canal precisa ser de texto. O cargo de equipe é opcional e pode ser definido em qualquer uma das configurações. Os tickets são criados dentro da mesma categoria do canal do painel; se o canal não estiver em uma categoria, os tickets ficam na lista principal do servidor.

## Pix

```text
/pix chave:SUA_CHAVE_PIX instrucoes:Envie o comprovante neste canal.
```

Os dados aparecem nos novos tickets de compra.

## Kits

- `/kit adicionar`: abre o cadastro por etapas (nome, preço e descrição). Ao salvar, o painel da loja é atualizado.
- `/kit listar`: mostra os kits cadastrados.
- `/kit remover nome:Kit Demo 1`: remove pelo nome e atualiza o painel.

Servidores novos recebem três kits de demonstração. Troque os preços e descrições ou remova os exemplos antes de abrir a loja ao público. O catálogo aceita até 25 kits.

## Tickets

- Cada botão de suporte abre o canal privado diretamente, sem menu de seleção.
- Cada botão de compra cria o ticket do kit escolhido, sem a etapa intermediária de "Ver kits".
- A mensagem privada de confirmação inclui o botão **Ir para o canal**.
- O cliente envia o comprovante no canal do pedido e conversa com a equipe.
- O dono do ticket ou a equipe pode usar **Fechar ticket**. O canal é excluído após três segundos.
- Cada usuário pode manter um ticket de suporte e um pedido de loja abertos ao mesmo tempo.

O bot não lê comprovantes bancários, não confirma Pix e não realiza a entrega automática dos itens.
