# ASTHEN BOT

Bot de Discord para atendimento, catálogo de kits de Minecraft, tickets de pagamento e entrega pelo Plugin-ASTHEN.

**Versão 2.7.0**

<p align="center">
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/archive/refs/heads/main.zip">
    <img src="https://raw.githubusercontent.com/contatorzlkz-prog/BOT-ASTHEN/main/assets/download-zip.svg" alt="Baixar ASTHEN BOT 2.7.0 em ZIP" width="264" height="58">
  </a>
</p>

<p align="center">
  <sub>Extraia o ZIP e execute <code>INSTALAR.bat</code>.</sub>
</p>

## Loja e compra

1. O cliente abre a loja e escolhe um kit no menu.
2. O bot mostra uma prévia compacta com nome de exibição, preço, descrição e imagem.
3. O cliente pode trocar de kit ou confirmar.
4. O bot pede o nick do Minecraft, sem pedir para escolher Java ou Bedrock.
5. O bot cria um ticket privado com o pedido resumido, a chave Pix fixa e o QR Code.
6. O cliente envia a imagem ou PDF do comprovante.
7. Um membro autorizado da equipe confirma ou recusa o pagamento.
8. Depois da aprovação, o bot solicita a entrega ao plugin e atualiza o ticket com o resultado.

O ticket não mostra identificador interno do pedido nem a lista de itens do kit. A confirmação do pagamento é manual.

## Como os kits entram na loja

O **plugin Minecraft é a origem dos kits reais**. O administrador cria o kit dentro do Paper:

~~~text
/dk create Kit_Ferro
~~~

O plugin envia sua lista ao bot. O bot importa os kits novos e salva o catálogo no Supabase quando a sincronização está configurada.

O administrador usa /kit editar no Discord para selecionar o kit e escolher o campo que deseja alterar: nome exibido, preço, descrição ou imagem HTTPS. O identificador original do plugin não muda. Por exemplo, Kit_Ferro pode aparecer para o cliente como **Kit Ferro**.

Kits novos entram sem preço e não aparecem como compráveis até que o preço seja definido. Quando um kit é excluído no plugin, a próxima sincronização remove sua entrada do catálogo e da tabela de kits do Supabase. /kit remover apenas oculta o produto da loja; não apaga os itens dentro do Minecraft.

Não existem kits de demonstração cadastrados por padrão.

## Recursos

- Painel de suporte com departamentos relacionados ao servidor Minecraft.
- Painel da loja com um botão para abrir o catálogo.
- Prévia individual dos kits, com troca de produto antes da confirmação.
- Tickets privados de pagamento e envio de comprovante.
- QR Code Pix fixo da loja e botão de cópia da chave na mesma mensagem do pedido.
- Confirmação manual do pagamento por membros autorizados.
- API HTTP autenticada para o Plugin-ASTHEN, usando o modo poll.
- Sincronização do catálogo de kits com Supabase.
- Salvamento local em data/state.json, além do snapshot asthen_bot_state.

## Instalação no Windows

1. Baixe o ZIP pelo botão acima e extraia a pasta.
2. Execute INSTALAR.bat.
3. Informe o token do bot e o Application ID quando solicitado.
4. Execute INICIAR.bat.

Requisitos: Windows 10/11 e Node.js 22 ou mais recente.

### Atualizar sem perder a chave da API nem os dados

A chave de integração é gerada uma vez e guardada em DKB_SECRET dentro do .env. Ela **não é regenerada quando o bot recebe uma nova versão**.

- Se atualizar na mesma pasta, mantenha o arquivo .env e a pasta data.
- Se extrair a nova versão em outra pasta, copie o .env e a pasta data da instalação antiga para a nova antes de iniciar.
- Não coloque o .env no GitHub e não o envie para outras pessoas.

O token do Discord, a chave DKB_SECRET e a chave do Supabase são credenciais diferentes.

## Comandos administrativos

| Comando | Função |
|---|---|
| /configurar | Configura suporte, loja, logs, compradores e cargo da equipe |
| /kit listar | Lista os kits sincronizados do plugin |
| /kit editar | Seleciona um kit e o campo comercial que será alterado |
| /kit remover | Remove um kit do catálogo da loja |
| /bridge status | Mostra o estado da API, a última sincronização de kits e o Supabase |
| /bridge chave | Mostra em privado a chave estável que deve ser usada no plugin |

Os comandos administrativos exigem **Gerenciar servidor**. Nos tickets, somente administradores ou membros com o cargo configurado em /configurar equipe podem confirmar, recusar e fechar pedidos.

## Pix

O bot já vem com a chave Pix fixa keybytes.a@gmail.com e o QR Code correspondente. Não existe mais comando /pix. O botão para copiar a chave fica na própria mensagem do pedido.

A imagem QR incluída corresponde somente a essa chave. Para alterar os dados Pix da loja, será necessário atualizar em conjunto src/pix.js e assets/pix-keybytes.png.

## Integração com o Plugin-ASTHEN

O bot e o plugin rodam em computadores diferentes:

- **Seu PC:** ASTHEN BOT e API local em 127.0.0.1:8787.
- **PC/host Minecraft:** servidor Paper e Plugin-ASTHEN.
- **Conexão:** o plugin inicia as requisições HTTPS para o endereço público que encaminha até a API do bot.

A configuração detalhada está em [PLUGIN-INTEGRATION.md](docs/PLUGIN-INTEGRATION.md). A especificação para a IA que vai atualizar o plugin está em [PLUGIN-IMPLEMENTATION-HANDOFF.md](docs/PLUGIN-IMPLEMENTATION-HANDOFF.md).

### Teste entre dois computadores sem contratar host Minecraft

Seu amigo pode iniciar um servidor Paper local no Windows dele. Um mundo single-player vanilla não carrega plugins Paper; é necessário iniciar Paper localmente, mas não é preciso publicar o servidor nem contratar hospedagem.

No seu PC:

1. Inicie o bot com INICIAR.bat.
2. Confira no console: [Asthen Bridge] API ativa em http://127.0.0.1:8787.
3. Baixe o cloudflared para Windows 64-bit pela [página oficial da Cloudflare](https://developers.cloudflare.com/tunnel/downloads/).
4. Renomeie o executável para cloudflared.exe e coloque-o na pasta do bot.
5. Abra INICIAR-TUNEL.bat.
6. Copie a URL https://....trycloudflare.com mostrada pelo terminal e envie ao amigo em particular.

O Quick Tunnel é temporário. A URL muda quando um novo túnel é criado e só funciona enquanto a janela do túnel e o bot estiverem abertos. É uma solução para testes, não para produção. [Documentação oficial](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/).

No plugins/DiscordKitBridge/config.yml do amigo:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "COLE_A_CHAVE_MOSTRADA_POR_bridge_chave"
  poll:
    url: "https://ENDERECO-HTTPS-DO-TUNEL"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
~~~

O endereço no plugin deve ser a URL HTTPS do túnel, sem /plugin/v1. Não use localhost ou 127.0.0.1 no PC do amigo para tentar chegar ao seu bot.

**Atenção:** o código publicado atualmente no Plugin-ASTHEN ainda precisa ser ajustado para aceitar a chave gerada pelo bot. O documento de implementação descreve essa mudança. Não considere a entrega automática pronta até o teste entre os dois computadores passar.

## Supabase

O Supabase é opcional para iniciar o bot. Quando configurado, o projeto mantém:

- asthen_bot_state: snapshot do estado do bot.
- asthen_bot_kits: catálogo normalizado de kits por servidor Discord.

Abra o SQL Editor do Supabase e execute, nesta ordem:

1. supabase/001_asthen_bot_state.sql
2. supabase/002_asthen_bot_kits.sql

Configure no .env a URL base do projeto e uma Secret API Key no backend:

~~~env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
SUPABASE_KITS_TABLE=asthen_bot_kits
~~~

Consulte [SUPABASE.md](docs/SUPABASE.md) para detalhes de sincronização e diagnóstico.

## Verificação

~~~bash
npm install
npm run check
npm run check:commands
npm test
~~~

O GitHub Actions executa essas verificações nas atualizações da branch principal.

## Segurança e limites

- Nunca publique .env, tokens ou chaves.
- A chave DKB_SECRET fica salva na instalação do bot e não deve mudar durante uma atualização normal.
- /bridge chave é uma resposta privada para administradores.
- A API local deve ficar em 127.0.0.1; use HTTPS para disponibilizar o endereço ao computador do plugin.
- O bot não verifica comprovantes bancários automaticamente.
- A entrega real no Minecraft depende de o plugin estar atualizado e conectado.
