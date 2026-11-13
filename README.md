# ASTHEN BOT

[![BAIXAR ZIP](https://img.shields.io/badge/BAIXAR%20ZIP-DOWNLOAD-2F6BFF?style=for-the-badge)](https://github.com/contatorzlkz-prog/BOT-ASTHEN/archive/refs/heads/main.zip)

Bot de Discord com tickets privados e loja de kits. Node.js 22 ou superior.

## Instalar

1. Baixe o ZIP acima e extraia a pasta.
2. Execute `INSTALAR.bat` e informe o token e o Application ID do seu bot.
3. Execute `INICIAR.bat`.

## Configurar

Use uma conta com permissão **Gerenciar servidor**:

```text
/configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe
/pix chave:SUA_CHAVE instrucoes:Envie o comprovante neste canal.
/kit adicionar
```

Todos os campos de `/configurar` são opcionais: informe somente os canais que deseja configurar. O canal de logs é bloqueado automaticamente para @everyone e liberado para a equipe configurada e administradores. Ao iniciar, o bot atualiza os painéis já publicados para o formato novo.

## Loja

O painel tem um único botão **Abrir catálogo**. O cliente escolhe um kit, informa o nick do Minecraft e revisa o pedido. Pode editar o nick ou cancelar. Nenhum canal é criado até clicar em **Confirmar e ir para pagamento**.

Depois da confirmação, o bot cria o ticket privado com o resumo, a chave Pix e as instruções. O cliente envia o comprovante no canal. A equipe usa **Confirmar** ou **Recusar**; as duas ações geram registro no canal privado de logs e mantêm o ticket aberto. Ao confirmar, o bot também anuncia o comprador e o kit no canal de compradores. O botão **Fechar** fica separado e exclui o ticket após três segundos.

## Suporte

Os botões têm cores diferentes por assunto e abrem o canal privado diretamente. Cada ticket apresenta orientações próprias para o cliente enviar as informações certas.

## Kits e salvamento

Novas instalações começam com Kit Demo 1, Kit Demo 2 e Kit Demo 3. Use `/kit adicionar`, `/kit listar` e `/kit remover`.

Configurações, kits, tickets e compras em preparação são salvos automaticamente em `data/state.json`. Faça backup desse arquivo e nunca publique o token do `.env` nem os dados Pix.

## Permissões do bot

Convide com os escopos `bot` e `applications.commands`, concedendo: View Channels, Send Messages, Embed Links, Attach Files, Read Message History e Manage Channels. Não precisa ativar Message Content Intent.

Consulte [COMECE-AQUI.txt](COMECE-AQUI.txt) para o início rápido. Licença MIT.
