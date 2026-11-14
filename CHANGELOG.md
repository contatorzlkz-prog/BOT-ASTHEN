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

