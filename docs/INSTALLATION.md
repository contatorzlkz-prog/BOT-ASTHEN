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

O instalador solicita o token Discord e o Application ID e cria o `.env`. Para habilitar Supabase, abra o SQL Editor e execute `supabase/SETUP.sql`. Depois configure `SUPABASE_URL` e `SUPABASE_SECRET_KEY` no `.env`.

## Criar o bot no Discord

Crie a aplicação no [Discord Developer Portal](https://discord.com/developers/applications) e convide o bot com os escopos `bot` e `applications.commands`.

Permissões recomendadas: View Channels, Send Messages, Embed Links, Attach Files, Read Message History e Manage Channels.

## Arquivo .env

O arquivo contém o token do Discord e, opcionalmente, a chave secreta do Supabase. A variável `DKB_SECRET` é criada automaticamente pelo bot na primeira inicialização. Na configuração do Plugin-ASTHEN, use exatamente o mesmo valor em `bridge.secret`. Não compartilhe nem envie `.env` ao GitHub.

## Atualizar uma instalação existente

Não apague a pasta `data` nem substitua o arquivo `.env` sem fazer uma cópia. Eles guardam o estado local, o segredo estável da bridge e, na versão 2.13.0, a fila persistente em `data/bridge-queue.json`. Se instalar em outra pasta, copie `.env` e toda a pasta `data` antes de iniciar a versão nova. Não copie somente `state.json` e esqueça a fila.

## Kits da loja

Crie primeiro o kit real pelo Plugin-ASTHEN dentro do Paper usando uma Shulker Box. Defina o preço no jogo com `/dk price <nome> <valor>`; kit sem preço não está à venda. Quando o bot receber a lista, um administrador pode usar `/kit criar` para configurar nome comercial, descrição e imagem. O comando não altera os itens nem o preço do Minecraft.
### Versão 2.13.0

A versão 2.13.0 foi integrada ao main e está disponível na [release oficial](https://github.com/contatorzlkz-prog/BOT-ASTHEN/releases/tag/v2.13.0). Ela preserva o arquivo state.json corrompido em vez de sobrescrevê-lo, isola testes e mantém jobs da Bridge em data/bridge-queue.json.

Antes de atualizar uma instalação existente, faça backup completo de `.env` e `data/`. Se a fila persistente estiver corrompida, não apague o arquivo: a inicialização interrompe a Bridge e preserva uma cópia para diagnóstico.

