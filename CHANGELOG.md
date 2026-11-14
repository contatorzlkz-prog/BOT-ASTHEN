# Changelog ASTHEN BOT

## 2.6.0 — 14/11/2026

### Integração Plugin-ASTHEN (Minecraft Java)
- Adicionada API HTTP local no bot compatível com o transporte `poll` do Plugin-ASTHEN.
- Implementadas as rotas autenticadas `/plugin/v1/pull`, `/plugin/v1/result` e `/plugin/v1/kits`.
- O segredo compartilhado `DKB_SECRET` é configurado no `.env` e comparado em tempo constante; a API escuta em `127.0.0.1` por padrão.
- O catálogo recebido do plugin é sincronizado ao estado local e usado para publicar somente kits ativos.
- O fluxo de aprovação envia nick Java, plataforma `java`, nome exato do kit e `request_id` estável.
- Nova tentativa administrativa respeita a idempotência: reutiliza o mesmo ID quando o resultado é desconhecido e gera outro somente quando o plugin confirma que não houve entrega.
- Adicionado comando `/kit configurar` para preço, descrição e imagem comercial.

### Loja e tickets
- Painel da loja passa a mostrar o seletor de kits diretamente, sem botão intermediário de catálogo.
- Seleção apresenta prévia do kit, itens cadastrados no servidor, preço, descrição e imagem.
- Validação de nick Java (3–16 caracteres) antes de abrir o ticket de pagamento.
- A aprovação do pagamento e o resultado da entrega Minecraft passam a ser estados separados.
- O ticket informa quando o plugin entregou o kit ou o guardou para `/dk claim`.

### Supabase e estabilidade
- Project URL normalizada automaticamente para remover `/v1` ou `/rest/v1` finais.
- Sincronização agrupa estados recentes, reduz tentativas repetidas e usa intervalo progressivo quando o Supabase falha.
- Backup `data/state.json` continua sendo gravado antes da sincronização remota.
- Incluídos testes automatizados para bridge, autenticação, validação de nomes e URL Supabase.
- GitHub Actions valida sintaxe, comandos e testes da bridge.

### Compatibilidade e limitações
- Mantidos os dados e fluxo de tickets do projeto 2.4.0; o estado local existente continua sendo usado.
- Removidas referências comerciais de terceiros e atualizados os textos para a identidade ASTHEN e termos de mods.
- O plugin atual entrega itens cadastrados em Shulker Box, mas ainda não implementa KeepInventory ao morrer; o Kit Keep fica bloqueado para compra até essa função existir e ser testada (R$ 125,00 é o preço planejado).

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
- Removida a geração de QR Code por código: o pedido agora anexa a imagem original enviada pelo responsável da loja (attachment ID `1570926843719327874`).
- A imagem fica dentro do projeto em `assets/pix-keybytes.jpg`, evitando depender de um link temporário do CDN do Discord.
- A chave padrão é `keybytes.a@gmail.com`; o QR original só aparece quando a chave configurada corresponde a ela.
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
- /configurar unifica os canais de suporte, loja, logs, compradores e o cargo da equipe.
- Canal de logs fica oculto para @everyone e liberado para a equipe configurada e administradores.
- Painéis já publicados são atualizados automaticamente na inicialização; botões antigos de compra continuam compatíveis durante a migração.
- Compras em preparação também são salvas localmente e podem ser retomadas.
- Salvamento atômico de data/state.json após alterações.

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