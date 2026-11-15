## 2.8.0 — 14/11/2026

### Loja
- Kits desativados ou removidos do plugin continuam visíveis como indisponíveis.
- Produtos antigos e seus dados comerciais deixam de ser apagados pela sincronização.
- Ação de remover kit passa a marcar o produto como indisponível.
- A sincronização aceita preço opcional do plugin e preserva o preço salvo quando o campo não existe.

### Compras e entrega
- O cliente escolhe Java ou Bedrock depois de informar o nick.
- A plataforma fica salva no pedido, nos logs e nos avisos.
- A aprovação envia a plataforma correta ao plugin.
- Timeout gera uma segunda tentativa automática com o mesmo requestId.
- Falhas conhecidas passam a ter mensagens mais claras para o comprador.
- Pedidos antigos sem plataforma ficam pausados até a equipe escolher Java ou Bedrock.

### Segurança e integração
- Módulo `asthen-bridge.js` copiado do repositório do plugin para o bot.
- API local usa `DKB_HOST` (padrão 127.0.0.1) e `DKB_PORT` (padrão 8787).
- Comando que exibia a chave foi removido; `DKB_SECRET` deve ser copiado localmente entre `.env` e `config.yml`.
- Supabase deixa de excluir linhas antigas de produtos.

---

## 2.7.0 — 14/11/2026

### Catálogo ligado ao Plugin-ASTHEN
- Kits criados no Minecraft são importados automaticamente quando o plugin sincroniza POST /plugin/v1/kits.
- O bot preserva nome técnico do plugin e nome de exibição separado para a loja.
- Novos kits entram sem preço; o administrador configura nome exibido, preço, descrição e imagem com /kit editar.
- /kit remover remove o produto do catálogo sem apagar o arquivo real do kit no Minecraft.
- Quando o plugin informa que um kit foi excluído, o catálogo e a tabela asthen_bot_kits são reconciliados e a entrada antiga é removida.
- Removidos os kits de demonstração da migração antiga.

### Administração e tickets
- Comandos reduzidos a /configurar, /kit listar, /kit editar, /kit remover, /bridge status e /bridge chave.
- Removido /pix: a loja usa a chave Pix fixa keybytes.a@gmail.com e o QR correspondente.
- Menu de suporte reescrito para assuntos do servidor Minecraft.
- Mensagem de pagamento compactada em um único embed, com imagem do kit, QR Pix, chave e botão de cópia.
- Comprovante solicitado como anexo de imagem ou PDF; identificador interno e descrição dos itens não aparecem no ticket.
- Avisos técnicos de falha na entrega enviados de forma privada ao administrador que aprovou o pedido.
- Confirmação, recusa, repetição de entrega e fechamento restritos à equipe autorizada ou administradores.
- Anúncio de compra inclui o valor e exibe o comprador uma única vez.

### Chave e Supabase
- A chave de integração é gerada quando ainda não existe e mantida em DKB_SECRET; atualização normal do bot não gera uma nova chave.
- Removido o comando de regeneração. /bridge chave apenas mostra o valor salvo.
- Adicionada a tabela normalizada asthen_bot_kits em supabase/002_asthen_bot_kits.sql.
- O snapshot local continua em data/state.json; o catálogo também é sincronizado para a tabela de kits do Supabase.

### Instalação e documentação
- Adicionado SUPABASE_KITS_TABLE ao instalador.
- README, guia de comandos, integração e handoff do plugin atualizados para o fluxo de dois computadores.
- Incluída a orientação para preservar .env e data ao atualizar a pasta do bot.

---

## 2.6.1 — 14/11/2026

### Correções e compatibilidade com a 2.4.0
- Restaurado o menu suspenso de departamentos do suporte, com cinco opções: Dúvidas & Compras, Licenças & Suporte, Reportar Bugs, Parcerias & Comercial e Marketing & Serviços.
- Restaurado o comando `/kit preco` para alterar o preço de um produto já cadastrado.
- Painéis de suporte e loja agora são recriados quando a mensagem antiga foi apagada ou deixou de existir, com atualização do ID salvo.
- A sincronização da loja também recria o painel se a mensagem desaparecer.
- Restaurado o botão privado para copiar a chave Pix no ticket.
- Ao fechar um pedido ainda pendente, o bot registra a decisão "fechado sem resultado" no canal de logs antes de excluir o ticket.
- A confirmação de fechamento é publicada uma única vez no canal, sem duplicação de resposta privada.

### URL de integração entre dois computadores
- Adicionado `INICIAR-TUNEL.bat` para criar um Cloudflare Quick Tunnel direcionado à API local na porta 8787.
- README e guias explicam como gerar, copiar e configurar a URL HTTPS temporária no plugin que está em outro computador.
- O executável `cloudflared.exe` local é ignorado pelo Git e não é distribuído no ZIP.

---

# Changelog ASTHEN BOT

## 2.6.0 — 14/11/2026

### Integração com Plugin-ASTHEN
- Adicionada uma API HTTP local ao bot, compatível com o transporte `poll` do Plugin-ASTHEN.
- Criadas as rotas autenticadas `GET /plugin/v1/pull`, `POST /plugin/v1/result` e `POST /plugin/v1/kits`.
- A chave compartilhada `DKB_SECRET` é gerada pelo bot na primeira inicialização e salva no arquivo `.env`.
- Adicionados os comandos administrativos `/bridge status`, `/bridge chave` e `/bridge regenerar`, com respostas privadas.
- Ao aprovar um pagamento, o bot envia nick Java, plataforma `java`, nome exato do kit e `request_id` ao plugin.
- Adicionado retorno de status da entrega e ação para repetir solicitações sem duplicar uma entrega já processada.

### Loja e tickets
- Fluxo atualizado: seleção do kit → prévia com nome, preço, descrição e imagem → trocar/confirmar → formulário do nick Java → abertura do ticket privado.
- O ticket de pagamento mostra o nome do produto e a imagem comercial cadastrada, além do preço, descrição e nick.
- O cadastro `/kit adicionar` aceita um link HTTPS opcional para a imagem.
- Os nomes de kit e nicks Java são validados conforme os formatos aceitos pela bridge.

### Supabase e armazenamento
- Restaurada uma sincronização opcional do snapshot com Supabase, mantendo `data/state.json` como salvamento local primário.
- Adicionado o SQL `supabase/001_asthen_bot_state.sql`.
- A URL base do Supabase é normalizada; a chave nova `sb_secret_...` é enviada no cabeçalho `apikey`.
- Adicionado diagnóstico do estado do Supabase em `/bridge status`.

### Verificação e documentação
- Adicionados testes nativos de Node para autenticação, polling, resposta do plugin e validação de pedidos.
- O GitHub Actions executa verificações de sintaxe, comandos e testes.
- Reescrito o README para o fluxo real e adicionados guias de integração e implementação do plugin.

### Compatibilidade e pendências
- A bridge do bot está implementada, mas a integração ponta a ponta depende de atualizar o Plugin-ASTHEN para aceitar a chave gerada pelo bot em `bridge.secret`. O código atual do plugin ainda gera sua própria chave quando o campo está vazio.
- O teste local deve ser feito em um servidor Paper na mesma máquina Windows. Um mundo single-player vanilla não carrega plugins Paper.
- A etapa de VPS e o teste de entrega dentro do Minecraft ainda precisam ser feitos. Não considerar a integração pronta para produção antes desses testes.
- O plugin atual entrega os itens cadastrados em Shulker Box; não anuncia KeepInventory ao morrer como funcional até esse recurso existir e ser testado.

---

## [2.4.0] - 2026-11-13

### Inicialização e Supabase
- Removido o `.env.example`; o bot cria o `.env` no primeiro início e solicita token, Application ID e credenciais opcionais do Supabase.
- Os módulos de banco só são carregados depois que o `.env` foi preenchido, evitando ler URL/chave vazias antes da configuração.
- A configuração do Supabase aceita a chave secreta nova `sb_secret_...` no cabeçalho `apikey`, sem tentar tratá-la como JWT.
- `data/state.json` é criado e atualizado localmente antes de qualquer sincronização online, inclusive quando o Supabase está funcionando.
- Erros HTTP 401/403 e 404 mostram instruções de diagnóstico sem revelar as chaves.

### Atendimento
- Painel de suporte trocado por um menu de seleção de departamentos no estilo do seletor nativo do Discord.
- Categorias: Dúvidas & Compras, Licenças & Suporte, Reportar Bugs, Parcerias & Comercial e Marketing & Serviços.
- Menção/identificação do solicitante movida para dentro do embed do ticket; a mensagem solta acima do embed não marca mais o comprador.
- Após confirmar ou recusar pedido, o embed de pagamento é preservado e o bot envia uma única mensagem pública: “O canal continua aberto. Use Fechar quando o atendimento terminar.”
- Ao fechar, a confirmação é pública no canal em vez de duplicar uma resposta privada e outra pública.

### Loja
- Removidos os kits de demonstração e migrados os catálogos existentes para produtos reais.
- Adicionados Kit Keep (R$ 125,00), Kit Ferro (R$ 15,00), Kit Dima (R$ 25,00), Kit Netherita (R$ 30,00), Kit Elytra (preço pendente) e Kit Construção (preço pendente).
- Ao selecionar um produto, o cliente vê uma descrição e o preço antes de continuar para informar o nick.
- Itens com preço pendente aparecem no catálogo, mas não podem ser comprados até que um administrador configure o valor com `/kit preco`.

---

## [2.3.0] - 2026-11-13

### Pix
- Removida a geração de QR Code por código: o pedido agora anexa a imagem original enviada pelo responsável da loja.
- A imagem fica dentro do projeto em `assets/pix-keybytes.jpg`, evitando depender de um link temporário do CDN do Discord.
- Removida a dependência `qrcode` e os campos de recebedor/cidade que não são usados pela imagem pronta.

### Banco e tickets
- Tickets abertos continuam persistidos no Supabase e no backup local `data/state.json`.
- Ao excluir o canal do ticket, o registro é removido do snapshot Supabase e do backup local.
- A exclusão manual de um canal também limpa o registro; na inicialização, canais inexistentes são reconciliados.
- Tickets marcados como fechados por versões anteriores são reabertos no estado se o canal ainda existir.
- O encerramento normal por Ctrl+C/SIGTERM aguarda a sincronização do último snapshot com o Supabase; a exclusão de canal também força a sincronização da limpeza.
- O banco guarda somente o estado atual, sem histórico de tickets fechados.

---

## [2.2.0] - 2026-11-13

### Loja e Pix
- Pedido e pagamento agora aparecem em um único embed, sem exibir identificador interno do pedido.
- QR Code Pix estático é gerado automaticamente a partir da chave configurada.
- Chave Pix aparece na mensagem e tem botão para exibi-la em resposta privada copiável.
- Orientações de comprovante, entrega do kit e prazo de análise de até dez minutos ficam no início do pedido.
- Menção do comprador permanece na mensagem do ticket; o campo duplicado de cliente foi removido.
- Confirmar, recusar e fechar pedidos exigem permissão de Administrador do servidor.
- Fechamentos de pedidos pendentes sem decisão geram log específico: "Pedido fechado sem resultado".

### Banco de dados
- Adicionada integração REST opcional com Supabase e backup local em `data/state.json`.
- Adicionado SQL do Supabase e guia de configuração.

### Dependências
- Adicionada a biblioteca `qrcode` para gerar a imagem Pix.

---

## 2.1.0

### Atendimento
- Botões sem emojis genéricos e com cores distintas por assunto.
- Textos de orientação completos e específicos para bug, hack, dúvida e outros assuntos.

### Loja
- Painel substituído por um único botão de entrada para o catálogo.
- Seleção de kit em menu próprio, seguida do formulário de nick do Minecraft.
- Tela de revisão com edição de nick, confirmação e cancelamento.
- O ticket de pagamento só é criado após a confirmação final.
- Ticket mostra produto, preço, nick, Pix e instruções para enviar o comprovante.
- Botões Fechar, Confirmar e Recusar na mesma linha.
- Confirmar e Recusar registram a decisão no canal privado de logs e não fecham o ticket.
- Compra aprovada gera anúncio automático no canal de compradores.

### Configuração e dados
- `/configurar` unifica os canais de suporte, loja, logs, compradores e o cargo da equipe.
- Canal de logs fica oculto para @everyone e liberado para a equipe configurada e administradores.
- Painéis já publicados são atualizados automaticamente na inicialização; botões antigos de compra continuam compatíveis durante a migração.
- Compras em preparação também são salvas localmente e podem ser retomadas.
- Salvamento atômico de `data/state.json` após alterações.

## 2.0.0

### Alterado
- Painel de suporte trocado por botões diretos para reportar bug, reportar hack, tirar dúvida ou abrir atendimento geral.
- Painel da loja agora exibe botões de compra para cada kit. O clique abre o pedido privado diretamente.
- Resposta privada de abertura agora inclui o botão Ir para o canal.
- Tickets são criados na categoria do canal usado em /configurar; a configuração separada de categorias foi removida.
- Cadastro de kits virou um fluxo guiado em etapas: nome, preço e descrição.
- Painel da loja é atualizado automaticamente quando um kit é adicionado ou removido.
- Fechamento de tickets simplificado: botão Fechar ticket exclui o canal após três segundos.
- Tickets de suporte e loja passaram a ser independentes para cada usuário.
- Removidos os rodapés com nome da central e número da versão.
- Comandos administrativos simplificados para /configurar, /pix e /kit.

### Adicionado
- Três produtos de demonstração no catálogo inicial: Kit Demo 1, Kit Demo 2 e Kit Demo 3.
- Link direto para baixar o ZIP completo pelo README.
- Teste automatizado de sintaxe JavaScript e estrutura dos comandos do Discord no GitHub Actions.

### Removido
- Seleção de categoria de ticket em comando separado.
- Menu intermediário Ver kits.
- Seleção de assunto por menu suspenso no suporte.
- Formulário de nick antes de abrir pedido.
- Botões de aprovar/recusar pedido e fluxo de logs/transcrições.
- Textos longos explicando o funcionamento da loja dentro do painel.

## 1.2.0

### Adicionado
- Imagem opcional do kit por link (/asthen kit adicionar imagem: e /asthen kit imagem), exibida na prévia do pedido.
- /asthen kit listar.
- Fechamento automático do canal de pedido ao Autorizar ou Não autorizar (ticket de suporte continua manual).
- Resumo do pedido no canal de logs e aviso ao cliente por mensagem privada.
- src/config.js: nome, cor, textos e regras em um único arquivo.
- INSTALAR.bat (instala Node.js e dependências, configura o .env) e INICIAR.bat.
- Workflow release-zip: gera o ZIP organizado na Release.

### Alterado
- Embeds em azul (#2F6BFF) e botão da loja azul.
- BOT_NAME e BOT_COLOR saíram do .env: agora ficam em src/config.js.
- Configuração local por servidor em data/state.json.
- Node.js mínimo caiu de 24.17 para 20 (o discord.js funciona nele), evitando erros de instalação.
- Scripts de Linux movidos para linux/.
- Sem Message Content Intent ativado, o bot liga mesmo assim (transcrição sem texto).
- A transcrição passou a incluir os dados dos embeds (kit, nick, valor).

### Removido
- setup-windows.bat e start-windows.bat (substituídos por INSTALAR.bat e INICIAR.bat).

## 1.1.0

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

## 1.0.0

### Inicial
- Primeira estrutura do bot de suporte e loja.
- Painel de tickets e fluxo básico de pedidos.
- Configuração inicial para Discord.
