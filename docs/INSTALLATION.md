# Instalação

## Windows 10/11

1. Instale ou deixe o `INSTALAR.bat` instalar o Node.js LTS (versão 22 ou mais recente; recomendado: 26 LTS).
2. Execute `INSTALAR.bat`.
3. Informe `DISCORD_TOKEN` e `CLIENT_ID` quando solicitado. O ID do servidor é opcional.
4. Execute `INICIAR.bat`.

Se preferir configurar manualmente, copie `.env.example` para `.env` e preencha as duas variáveis obrigatórias.

## Linux / VPS

```bash
bash linux/setup-linux.sh
nano .env
bash linux/start-linux.sh
```

## Aplicação Discord

Crie a aplicação no Discord Developer Portal, crie o bot e copie o token. Gere um convite com os escopos `bot` e `applications.commands` e as permissões `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History` e `Manage Channels`.

O bot usa somente o intent `Guilds`; não é necessário ativar Message Content Intent.
