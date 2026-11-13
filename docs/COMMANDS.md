# Comandos administrativos

Os comandos devem ser usados por administradores, pessoas com Gerenciar servidor/Gerenciar canais ou membros com o cargo de equipe configurado.

## Configuração inicial
1. /asthen config cargo-admin cargo:@Equipe
2. /asthen categoria suporte canal:<categoria>
3. /asthen categoria loja canal:<categoria>
4. /asthen config pix chave:SUA_CHAVE instrucoes:Texto opcional
5. /asthen kit adicionar nome:Kit Bronze preco:R$ 9,90 descricao:Kit inicial
6. /asthen painel suporte canal:#abrir-ticket
7. /asthen painel loja canal:#loja-da-asthen
8. /asthen config logs canal:#logs-tickets (opcional)
9. /asthen config status

## Catálogo
- /asthen kit adicionar: inclui nome, preço e descrição.
- /asthen kit remover: remove pelo nome exato.
- Máximo de 25 kits, limite da seleção nativa do Discord.

## Atendimento
No painel, o jogador escolhe bug, hack, dúvida ou suporte geral. O bot abre um canal privado, menciona a equipe e inclui um botão de fechamento.

## Loja
O cliente seleciona o kit, informa o nick e confirma. O bot cria o canal privado, apresenta os dados do pedido e a chave Pix configurada, além de pedir o comprovante. A equipe usa Autorizar ou Não autorizar. A entrega do item continua manual.

## Notas
- Cada usuário pode ter apenas um ticket aberto por servidor.
- Fechar canal remove o canal após 5 segundos.
- O canal de logs recebe a transcrição das últimas 100 mensagens, quando configurado.
- A configuração de cada servidor fica no arquivo local data/state.json.
- O bot não lê comprovantes bancários nem confirma pagamentos automaticamente.
