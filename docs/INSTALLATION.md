# Instalação

## Windows 10/11

1. Baixe o ZIP do repositório e extraia a pasta.
2. Execute `INSTALAR.bat`.
3. Informe o token do bot Discord e o Application ID quando solicitado. O ID do servidor de teste é opcional.
4. O instalador cria o arquivo `.env` automaticamente e instala as dependências.
5. Execute `INICIAR.bat`.

É necessário Node.js 22 ou superior; o instalador tenta instalar a versão LTS caso não encontre uma versão compatível.

## Linux

Execute:

```bash
bash linux/setup-linux.sh
bash linux/start-linux.sh
```

O instalador solicita o token Discord e o Application ID e cria o `.env`. Para habilitar Supabase, edite depois as variáveis `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.

## Criar o bot no Discord

Crie a aplicação no [Discord Developer Portal](https://discord.com/developers/applications) e convide o bot com os escopos `bot` e `applications.commands`.

Permissões recomendadas: View Channels, Send Messages, Embed Links, Attach Files, Read Message History e Manage Channels.

## Arquivo .env

O arquivo contém o token do Discord e, opcionalmente, a chave secreta do Supabase. A variável `DKB_SECRET` é criada automaticamente pelo bot na primeira inicialização. Não compartilhe nem envie `.env` ao GitHub.
