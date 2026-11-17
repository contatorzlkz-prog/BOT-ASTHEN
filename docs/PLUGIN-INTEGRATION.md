


## 11. Responsabilidades e idempotência

- **Plugin-ASTHEN:** mantém os kits e seus itens, define preço e disponibilidade, valida a plataforma e executa a entrega no Minecraft.
- **BOT-ASTHEN:** apresenta o catálogo, abre tickets, recebe comprovantes, registra a decisão da equipe e solicita a entrega.
- O bot não executa comandos arbitrários recebidos pela API e não cria nem altera os itens do Minecraft.
- Em timeout ou resposta perdida, a repetição deve usar o mesmo `request_id`. Não crie outro identificador só porque a primeira resposta demorou.
- Uma nova tentativa com outro identificador só é permitida depois de um resultado final que o bot classifique como recuperável. `KIT_PENDING` e `KIT_DELIVERED` não devem gerar uma segunda entrega.

## 12. Exemplos de atualização

Resultado final de entrega:

```http
POST /plugin/v1/result
Authorization: Bearer <DKB_SECRET>
Content-Type: application/json
```

```json
{
  "request_id": "ticket-123",
  "final": true,
  "status": "KIT_DELIVERED",
  "player": "Jogador",
  "platform": "bedrock",
  "kit": "Kit_Ferro",
  "message": "Kit entregue."
}
```

Atualização posterior de uma entrega que antes ficou pendente:

```http
POST /plugin/v1/delivery-update
Authorization: Bearer <DKB_SECRET>
Content-Type: application/json
```

```json
{
  "request_id": "ticket-123",
  "status": "KIT_DELIVERED",
  "player": "Jogador",
  "platform": "bedrock",
  "kit": "Kit_Ferro",
  "message": "Kit retirado pelo jogador.",
  "updated_at": "2026-11-17T12:00:00.000Z"
}
```

O endpoint legado `/plugin/v1/delivery-update` e a rota de eventos `/plugin/v1/events` são aceitos pela Bridge. Para `/events`, o identificador do evento deve ser `<request_id>:<status>`; a atualização também precisa representar a transição permitida para `KIT_DELIVERED`. Repetições válidas são idempotentes.

## 13. Checklist de integração

- [ ] `DKB_SECRET` e `bridge.secret` são idênticos.
- [ ] A URL HTTPS aponta para a API local do bot, na porta 8787.
- [ ] O plugin sincroniza o catálogo e os preços em centavos.
- [ ] Um pedido aprovado reserva o estoque uma única vez.
- [ ] Uma entrega confirmada atualiza o ticket.
- [ ] Repetir um pedido com o mesmo `request_id` não cria uma segunda entrega.
- [ ] Testes de inventário, Shulker Box e retirada pendente são feitos em servidor Paper real.
