# ASTHEN BOT

**Bot de Discord de suporte e loja de kits — versão 1.1.0**

[![Node.js](https://img.shields.io/badge/Node.js-24.17%2B-43853D?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-14.27%2B-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-222222.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-6B5CA5)](CHANGELOG.md)

O ASTHEN BOT reúne dois sistemas em um projeto: central de atendimento por tickets privados e loja de kits para servidores Discord. O código é público e pode ser baixado, utilizado, adaptado e distribuído de acordo com a licença MIT.

Cada pessoa instala sua própria cópia, cria sua própria aplicação no Discord Developer Portal e configura token, nome, cor, Pix, cargos, categorias e catálogo. Nenhuma credencial do autor está incluída.

## Download

- **Baixar o projeto:** abra o menu **Code → Download ZIP** no GitHub.
- **Clonar:** git clone https://github.com/contatorzlkz-prog/BOT-ASTHEN.git
- Extraia o projeto, configure o arquivo .env e siga a instalação abaixo.

## Funcionalidades

| Módulo | Recursos |
|---|---|
| Suporte | Painel com opções para reportar bugs, denunciar hacks, tirar dúvidas e suporte geral. |
| Loja | Catálogo de até 25 kits, com nome, preço e descrição. |
| Pedido | Seleção de kit, formulário de nick e criação de canal privado. |
| Pagamento | Chave Pix e instruções enviadas no canal do pedido; o cliente anexa o comprovante no mesmo canal. |
| Equipe | Botões para autorizar, não autorizar e fechar o pedido. |
| Logs | Transcrição opcional das mensagens recentes ao fechar o ticket. |

O bot limita a um ticket aberto por usuário em cada servidor. Ao fechar, ele avisa os participantes e exclui o canal após alguns segundos.

**Importante:** o bot não processa Pix, não confirma pagamentos automaticamente e não entrega itens dentro do jogo. A equipe deve conferir o comprovante e realizar a entrega manualmente. Autorizar no Discord apenas registra a decisão administrativa.

## Requisitos

- Windows 10/11 ou Linux (VPS).
- Node.js 24.17 ou superior. Recomendado: Node.js 26 LTS.
- npm, instalado junto com o Node.js.
- Aplicação criada no Discord Developer Portal.

A dependência discord.js 14.27 requer Node.js 24.17 ou superior. Instale uma versão LTS em https://nodejs.org/en/download/.

## Instalação no Windows 10/11

1. Baixe o ZIP pelo botão Code → Download ZIP e extraia a pasta.
2. Instale Node.js 26 LTS pelo site oficial.
3. Execute setup-windows.bat.
4. Abra o arquivo .env criado pelo instalador.
5. Preencha DISCORD_TOKEN e CLIENT_ID com os dados da sua própria aplicação.
6. Execute start-windows.bat.

## Instalação em Linux ou VPS

Instale Node.js 26 LTS e npm. Dentro da pasta do projeto, execute:

    chmod +x setup-linux.sh start-linux.sh
    ./setup-linux.sh
    nano .env
    ./start-linux.sh

Para manter o processo ativo após sair do terminal, utilize um gerenciador de processos ou um serviço do sistema. Faça backup de data/state.json antes de migrar ou atualizar o bot.

## Criar seu próprio bot

1. Acesse https://discord.com/developers/applications e crie uma aplicação.
2. Na aba Bot, crie o bot e copie o token. Nunca compartilhe esse token.
3. Em General Information, copie o Application ID.
4. Em Bot → Privileged Gateway Intents, habilite Message Content Intent para permitir que as transcrições opcionais incluam o conteúdo das mensagens.
5. Em OAuth2 → URL Generator, selecione os escopos bot e applications.commands.
6. Conceda as permissões necessárias: View Channels, Send Messages, Embed Links, Attach Files, Read Message History e Manage Channels.
7. Gere o link e adicione o bot ao seu servidor.
8. Copie .env.example para .env (o instalador faz isso automaticamente) e configure:

    DISCORD_TOKEN=TOKEN_DO_SEU_BOT
    CLIENT_ID=APPLICATION_ID_DO_SEU_BOT
    GUILD_ID=ID_DO_SERVIDOR_DE_TESTE
    BOT_NAME=Nome da sua loja
    BOT_COLOR=29263D

GUILD_ID é opcional. Preenchido, registra os comandos no servidor informado e acelera os testes. Vazio, registra comandos globais, cuja propagação pode demorar.

## Personalização

- BOT_NAME: nome exibido nos títulos e rodapés das embeds, limitado a 32 caracteres.
- BOT_COLOR: cor hexadecimal das embeds, com seis dígitos e sem o símbolo #.
- Nome e avatar do usuário do bot: altere no perfil da aplicação pelo Developer Portal.
- Chave Pix, instruções, cargos, categorias, painéis e kits: configure pelos comandos do Discord.

Reinicie o processo após editar o .env.

## Configuração administrativa

Execute os comandos com uma conta que tenha permissão de administrador, gerenciar servidor ou gerenciar canais. Configure primeiro o cargo da equipe e as categorias; depois publique os painéis.

    /asthen config cargo-admin cargo:@Equipe
    /asthen categoria suporte canal:<categoria-de-suporte>
    /asthen categoria loja canal:<categoria-de-pedidos>
    /asthen config pix chave:SUA_CHAVE_PIX instrucoes:Envie o comprovante neste canal e aguarde a equipe.
    /asthen kit adicionar nome:Kit Bronze preco:R$ 9,90 descricao:Kit inicial
    /asthen painel suporte canal:#abrir-ticket
    /asthen painel loja canal:#loja-da-asthen
    /asthen config logs canal:#logs-tickets
    /asthen config status

Consulte docs/COMMANDS.md para a lista completa e a ordem recomendada. Mantenha o canal de logs privado, pois as transcrições podem conter mensagens e anexos de atendimento.

## Estrutura do projeto

    ASTHEN-BOT/
    ├── .github/              Modelos de contribuição e issues
    ├── data/                 Estado local (não versionado)
    ├── docs/                 Guias de instalação e comandos
    ├── src/
    │   ├── commands.js       Slash commands
    │   ├── index.js          Inicialização e conexão
    │   ├── interactions.js   Botões, menus e formulários
    │   ├── store.js          Persistência local em JSON
    │   ├── tickets.js        Canais privados e transcrições
    │   └── ui.js             Embeds, menus e botões
    ├── .env.example
    ├── CHANGELOG.md
    ├── CONTRIBUTING.md
    ├── LICENSE
    └── package.json

## Segurança e dados

- .env, node_modules e data/state.json são ignorados pelo Git.
- A chave Pix e as configurações dos servidores ficam no arquivo local data/state.json. Proteja esse arquivo e mantenha backup seguro.
- Não publique tokens, chaves Pix, comprovantes ou transcrições.
- Evite conceder Administrator ao bot quando as permissões específicas forem suficientes.
- Cada instalação deve utilizar credenciais próprias.

## Desenvolvimento

    npm install
    npm run check
    npm start

O projeto usa discord.js e dotenv. Para sugerir melhorias, leia CONTRIBUTING.md. Problemas de segurança devem ser reportados de forma privada, conforme SECURITY.md.

## Licença

Distribuído sob a licença MIT. Consulte LICENSE para os termos completos.
