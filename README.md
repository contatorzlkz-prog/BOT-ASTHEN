# ASTHEN BOT

[![Baixar ZIP](https://img.shields.io/badge/BAIXAR%20ZIP-%E2%86%93-2F6BFF?style=for-the-badge)](https://github.com/contatorzlkz-prog/BOT-ASTHEN/archive/refs/heads/main.zip)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-43853D?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-222222.svg)](LICENSE)

Bot de Discord com atendimento privado e loja de kits. Cada servidor usa sua própria aplicação, token, chave Pix e configurações.

## Instalar no Windows 10/11

1. Baixe o ZIP pelo botão acima e extraia a pasta.
2. Abra `INSTALAR.bat`. Ele instala as dependências e prepara o arquivo `.env`.
3. Informe o token do bot e o Application ID quando solicitado.
4. Abra `INICIAR.bat`.

É necessário Node.js 20 ou mais recente. O instalador tenta instalar o Node.js LTS quando necessário.

## Configurar no Discord

Use uma conta com **Gerenciar servidor**:

```text
/configurar tipo:suporte canal:#suporte equipe:@Equipe
/configurar tipo:loja canal:#loja
/pix chave:SUA_CHAVE_PIX instrucoes:Envie o comprovante neste canal.
```

O comando `/configurar` já publica o painel no canal escolhido. Os tickets são criados na mesma categoria desse canal; não é necessário configurar categorias separadamente. O cargo `equipe` é opcional. Sem ele, somente administradores do servidor terão acesso aos tickets privados.

## Como funciona

**Suporte:** os botões de reportar bug, reportar hack, dúvida e outro assunto abrem o ticket direto. A resposta privada do bot traz um botão para entrar no canal.

**Loja:** cada kit aparece como um botão **Comprar**. Ao clicar, o bot cria o pedido privado, mostra o produto e os dados Pix, e entrega um botão para abrir o canal. O cliente envia o comprovante ali e conversa com a equipe.

**Fechamento:** o dono do ticket ou a equipe pode clicar em **Fechar ticket**. O canal é excluído três segundos depois.

É permitido manter um ticket de suporte e um pedido da loja abertos ao mesmo tempo. O bot não confirma pagamentos e não entrega itens automaticamente: a equipe confere o comprovante e faz a entrega.

## Kits de demonstração

Em um servidor novo, a loja começa com `Kit Demo 1`, `Kit Demo 2` e `Kit Demo 3`, com preços de exemplo. Altere ou remova esses kits antes de usar a loja de verdade.

Para cadastrar outro produto, use `/kit adicionar`. O bot abre um cadastro em etapas: nome, preço e descrição. Depois de salvar, o painel da loja é atualizado automaticamente.

Comandos disponíveis:

| Comando | Função |
| --- | --- |
| `/configurar` | Publica ou atualiza o painel de suporte ou loja em um canal. |
| `/pix` | Define a chave Pix e uma instrução curta. |
| `/kit adicionar` | Abre o cadastro guiado de um kit. |
| `/kit listar` | Lista os produtos cadastrados. |
| `/kit remover` | Remove um produto pelo nome. |

## Criar o bot no Discord

1. Crie uma aplicação em [Discord Developer Portal](https://discord.com/developers/applications).
2. Na aba **Bot**, crie o bot e copie o token. Não compartilhe esse token.
3. Em **General Information**, copie o Application ID.
4. Em **OAuth2 → URL Generator**, selecione `bot` e `applications.commands`.
5. Conceda `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History` e `Manage Channels`.
6. Use o link gerado para adicionar o bot ao servidor.

O bot não precisa do Message Content Intent.

## Linux / VPS

```bash
bash linux/setup-linux.sh
# preencha .env com DISCORD_TOKEN e CLIENT_ID
bash linux/start-linux.sh
```

## Arquivos importantes

- `src/config.js`: cores, textos e tempo de fechamento.
- `data/state.json`: configurações locais, kits, chave Pix e tickets. Não compartilhe esse arquivo.
- `.env`: token e Application ID. Nunca publique esse arquivo.

## Desenvolvimento

```bash
npm install
npm run check
npm run check:commands
npm start
```

## Licença

MIT. Consulte `LICENSE`.
