# Instalação

1. Baixe o ZIP pelo botão do README e extraia a pasta.
2. No Windows 10/11, execute `INSTALAR.bat`.
3. Informe `DISCORD_TOKEN` e `CLIENT_ID` da sua aplicação Discord.
4. Execute `INICIAR.bat`.

É necessário Node.js 22 ou superior (recomendado Node.js 26 LTS).

No Linux ou VPS, execute `bash linux/setup-linux.sh`, configure `.env` e depois rode `bash linux/start-linux.sh`.

Crie a aplicação no Discord Developer Portal e convide o bot com os escopos `bot` e `applications.commands`. Permissões: View Channels, Send Messages, Embed Links, Attach Files, Read Message History e Manage Channels.

O arquivo `.env` contém o token. Não o compartilhe nem o envie ao GitHub.
