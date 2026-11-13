# Instalação

## Windows 10/11
1. Baixe o repositório por Code → Download ZIP.
2. Instale Node.js 26 LTS: https://nodejs.org/
3. Execute setup-windows.bat.
4. Abra .env e preencha DISCORD_TOKEN e CLIENT_ID.
5. Convide o bot com os escopos bot e applications.commands.
6. Execute start-windows.bat.

## Linux/VPS
Requisitos: Node.js 24.17+ (recomendado Node 26 LTS), npm e acesso de rede ao Discord.

    chmod +x setup-linux.sh start-linux.sh
    ./setup-linux.sh
    nano .env
    ./start-linux.sh

## Developer Portal
- Crie uma aplicação e depois crie seu bot.
- Copie o token somente para o arquivo .env local.
- Copie Application ID para CLIENT_ID.
- Para usar transcrições, habilite Message Content Intent no bot.
- Convide com bot e applications.commands.
- Permissões recomendadas: View Channels, Send Messages, Embed Links, Attach Files, Read Message History e Manage Channels.

## Atualização
Faça backup de data/state.json e do .env. Baixe a nova versão, reinstale as dependências com npm install e mantenha seus arquivos locais. Nunca sobrescreva o .env com credenciais de terceiros.
