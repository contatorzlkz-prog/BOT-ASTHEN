# Changelog

Todas as alterações relevantes do ASTHEN BOT são registradas aqui.

## [2.0.0] - 2026-11-12

### Alterado
- Painel de suporte trocado por botões diretos para reportar bug, reportar hack, tirar dúvida ou abrir atendimento geral.
- Painel da loja agora exibe botões de compra para cada kit. O clique abre o pedido privado diretamente.
- Resposta privada de abertura agora inclui o botão **Ir para o canal**.
- Tickets são criados na categoria do canal usado em `/configurar`; a configuração separada de categorias foi removida.
- Cadastro de kits virou um fluxo guiado em etapas: nome, preço e descrição.
- Painel da loja é atualizado automaticamente quando um kit é adicionado ou removido.
- Fechamento de tickets simplificado: botão **Fechar ticket** exclui o canal após três segundos.
- Tickets de suporte e loja passaram a ser independentes para cada usuário.
- Removidos os rodapés com nome, central e número da versão.
- Comandos administrativos simplificados para `/configurar`, `/pix` e `/kit`.

### Adicionado
- Três produtos de demonstração no catálogo inicial: Kit Demo 1, Kit Demo 2 e Kit Demo 3.
- Link direto para baixar o ZIP completo pelo README.
- Teste automatizado de sintaxe JavaScript e estrutura dos comandos do Discord no GitHub Actions.

### Removido
- Seleção de categoria de ticket em comando separado.
- Menu intermediário **Ver kits**.
- Seleção de assunto por menu suspenso no suporte.
- Formulário de nick antes de abrir pedido.
- Botões de aprovar/recusar pedido e fluxo de logs/transcrições.
- Textos longos explicando o funcionamento da loja dentro do painel.

## [1.2.0] - 2026-11-13

### Adicionado
- Imagem opcional do kit por link (`/asthen kit adicionar imagem:` e `/asthen kit imagem`), exibida na prévia do pedido.
- `/asthen kit listar`.
- Fechamento automático do canal de pedido ao Autorizar ou Não autorizar (ticket de suporte continua manual).
- Resumo do pedido no canal de logs e aviso ao cliente por mensagem privada.
- `src/config.js`: nome, cor, textos e regras em um único arquivo.
- `INSTALAR.bat` (instala Node.js e dependências, configura o `.env`) e `INICIAR.bat`.
- Workflow `release-zip`: gera o ZIP organizado na Release.

### Alterado
- Embeds em azul (`#2F6BFF`) e botão da loja azul.
- `BOT_NAME` e `BOT_COLOR` saíram do `.env`: agora ficam em `src/config.js`.
- Node.js mínimo caiu de 24.17 para 20 (o discord.js funciona nele), evitando erros de instalação.
- Scripts de Linux movidos para `linux/`.
- Sem Message Content Intent ativado, o bot liga mesmo assim (transcrição sem texto).
- A transcrição passou a incluir os dados dos embeds (kit, nick, valor).

### Removido
- `setup-windows.bat` e `start-windows.bat` (substituídos por `INSTALAR.bat` e `INICIAR.bat`).

## [1.1.0] - 2026-11-12

### Adicionado
- Projeto público e reutilizável sob licença MIT.
- Personalização do nome exibido nas embeds por BOT_NAME.
- Personalização da cor das embeds por BOT_COLOR.
- README completo, guias de instalação e comandos administrativos.
- Configuração local por servidor em data/state.json.
- Painéis de suporte e loja com embeds, menus e botões.
- Fluxo privado de pedido com nick, chave Pix, comprovante e análise da equipe.
- Transcrição opcional de tickets no fechamento.

### Melhorado
- Organização do código em módulos separados.
- Instalação guiada para Windows e Linux/VPS.
- Validação de versão do Node.js e configuração inicial.
- Registro dos slash commands no servidor de teste quando GUILD_ID está definido.

## [1.0.0] - 2026-11-12

### Inicial
- Primeira estrutura do bot de suporte e loja.
- Painel de tickets e fluxo básico de pedidos.
- Configuração inicial para Discord.
