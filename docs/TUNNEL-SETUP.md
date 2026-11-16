# Túneis HTTPS para o ASTHEN BOT

Este guia explica como conectar o Plugin-ASTHEN à API do BOT-ASTHEN quando os dois estão em computadores diferentes, sem abrir a porta 8787 no roteador.

## Qual opção usar?

| Situação | Opção recomendada |
|---|---|
| Testar agora entre dois PCs Windows, sem domínio próprio | **Tailscale Funnel** |
| Teste rápido no Windows sem configurar conta de túnel | Cloudflare Quick Tunnel |
| VPS Linux com hostname reservado | tunnel.to Registered Free |
| Hostname próprio no Cloudflare | Cloudflare Named Tunnel + domínio próprio |

**Não use o subdomínio seusite.netlify.app como domínio do Cloudflare Tunnel.** Esse endereço é um subdomínio entregue e gerenciado pela própria Netlify. Vocês não controlam a zona DNS netlify.app e não podem criar nela os registros DNS necessários para um Cloudflare Named Tunnel. A documentação da Netlify identifica *.netlify.app como o subdomínio padrão da plataforma.

## Arquitetura do ASTHEN

- O bot continua ouvindo localmente em 127.0.0.1:8787.
- O túnel é executado na mesma máquina que o bot e encaminha HTTPS público para http://127.0.0.1:8787.
- O plugin do Minecraft consulta a URL HTTPS pública em bridge.poll.url.
- O plugin acrescenta os caminhos /plugin/v1/pull, /plugin/v1/result e /plugin/v1/kits; por isso configure somente a URL-base.
- DKB_SECRET continua protegendo todas as rotas. Não desative a autenticação.

No .env do bot, mantenha:

~~~env
DKB_HOST=127.0.0.1
DKB_PORT=8787
~~~

O token do provedor do túnel e o DKB_SECRET são credenciais diferentes. Não publique nenhum deles.

---

## Opção 1 — Tailscale Funnel (recomendado para os dois Windows)

O Tailscale Funnel fornece um endereço HTTPS público *.ts.net para um serviço local. Não exige domínio próprio, está disponível em todos os planos Tailscale e funciona mesmo quando a pessoa que acessa o endereço não tem Tailscale instalado. A URL usa o nome DNS do dispositivo e permanece estável para aquele dispositivo. Funnel tem limites de banda definidos pelo serviço e está em beta, então monitore o uso e teste o Long Polling antes de depender dele em produção.

### O que instalar

Instale o Tailscale somente no PC que executa o BOT-ASTHEN:

https://tailscale.com/download/windows

O PC do seu amigo, onde roda o Paper/Plugin-ASTHEN, não precisa instalar Tailscale. Ele acessará a URL HTTPS pública como qualquer outro cliente.

### Configurar no PC do bot

1. Instale o Tailscale no Windows.
2. Abra o Tailscale e entre com uma conta.
3. Confirme que o bot está funcionando e que o console mostra a API ativa em http://127.0.0.1:8787.
4. Abra o PowerShell como Administrador.
5. Ative o Funnel para a porta local 8787:

~~~powershell
tailscale funnel --bg 8787
~~~

6. Na primeira ativação, siga a tela de aprovação do Tailscale para habilitar Funnel, HTTPS e a permissão correspondente no tailnet.
7. O comando exibirá um endereço parecido com:

~~~text
https://nome-do-pc.nome-do-tailnet.ts.net
~~~

8. Confira o estado:

~~~powershell
tailscale funnel status
~~~

O parâmetro --bg mantém o Funnel em segundo plano. A documentação do Tailscale informa que a configuração em segundo plano é retomada quando o dispositivo reinicia ou o serviço Tailscale é reiniciado. O próprio Tailscale também precisa estar configurado para iniciar com o Windows.

### Configurar no Plugin-ASTHEN

No computador do Minecraft, abra o arquivo:

plugins/DiscordKitBridge/config.yml

Use a URL que apareceu no PowerShell:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://nome-do-pc.nome-do-tailnet.ts.net"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 35
    long-poll:
      enabled: true
      wait-seconds: 20
~~~

A parte long-poll só será reconhecida depois que o plugin for atualizado para a versão que implementa Long Polling (o prompt de atualização está em PLUGIN-LONG-POLLING-PROMPT.md). O bot 2.12.0 já entende o parâmetro wait_ms, mas o plugin 1.2.0 ainda usa o polling antigo.

### Testar se a API está chegando

1. Deixe o bot ligado.
2. Deixe o Tailscale ativo e confira tailscale funnel status.
3. Abra o endereço público no navegador. A API deve responder com erro de autenticação/HTTP 401, pois o navegador não envia Authorization: Bearer. Isso é esperado e confirma que a requisição chegou ao bot.
4. Copie DKB_SECRET localmente do .env para bridge.secret no plugin. Não envie o segredo em Discord, prints ou GitHub.
5. Inicie/recarregue o Paper e confira os logs do plugin.

### Segurança

O Funnel torna a rota pública para qualquer pessoa que tenha o endereço. A API do ASTHEN exige DKB_SECRET, então mantenha um segredo forte e privado, não abra outras portas e não coloque a chave nos logs ou no repositório. Não transforme a API em um endpoint público sem autenticação.

### Limite importante para migração

O hostname *.ts.net pertence ao dispositivo registrado no tailnet. Ao trocar o PC por uma VPS, o nome do dispositivo pode mudar; portanto, não prometa que a URL atual continuará igual automaticamente. Para o teste entre os dois Windows, é uma ótima opção. Na migração, pode ser necessário atualizar bridge.poll.url uma vez ou planejar a troca do nome DNS do dispositivo.

Documentação oficial:
- Funnel: https://tailscale.com/docs/features/tailscale-funnel
- Comando e opção --bg: https://tailscale.com/docs/reference/tailscale-cli/funnel
- Plano Personal: https://tailscale.com/pricing

---

## Opção 2 — Cloudflare Tunnel gratuito

Sim, o Cloudflare Tunnel está disponível no plano Free. A diferença é:

- **Quick Tunnel:** não exige domínio e fornece um endereço trycloudflare.com aleatório. É ótimo para teste, mas o endereço muda quando o túnel é recriado.
- **Named Tunnel:** mantém um ID estável, mas para publicar uma URL pública própria como bot.seudominio.com, você precisa controlar um domínio e configurá-lo na Cloudflare.

A URL seusite.netlify.app não resolve essa exigência, pois a zona netlify.app pertence à Netlify.

### Teste rápido no Windows (Quick Tunnel)

O repositório já inclui INICIAR-TUNEL.bat.

1. Inicie o BOT-ASTHEN.
2. Execute INICIAR-TUNEL.bat.
3. Copie a URL https://....trycloudflare.com.
4. Coloque a URL-base em bridge.poll.url no plugin.
5. Mantenha a janela aberta enquanto estiver testando.

Ao encerrar o processo, a URL temporária para de funcionar. Ao criar outro Quick Tunnel, atualize o endereço no plugin.

### Named Tunnel com domínio próprio

Se vocês comprarem ou já tiverem um domínio:

1. Adicione o domínio à Cloudflare e complete a configuração DNS indicada pelo painel.
2. Em Cloudflare Zero Trust/Networking > Tunnels, crie um Named Tunnel.
3. Instale cloudflared na máquina do bot usando o comando fornecido pelo painel.
4. Crie uma Published Application Route.
5. Defina um hostname como bot.seudominio.com.
6. Configure o serviço de destino como http://localhost:8787.
7. Use https://bot.seudominio.com em bridge.poll.url.

Guarde o Tunnel Token como segredo. Não o publique.

Documentação:
- Overview: https://developers.cloudflare.com/tunnel/
- Criar túnel gerenciado: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Quick Tunnels: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

---

## Opção 3 — tunnel.to Registered Free (boa para futura VPS Linux)

O tunnel.to é um serviço separado do Cloudflare Tunnel. O plano Registered Free anuncia um hostname reservado na conta, para que o endereço público permaneça o mesmo quando o cliente reconecta usando aquele nome. A página de preços também lista tokens de API e túneis simultâneos; confira os limites e as cotas atuais antes de depender do serviço, pois eles podem mudar.

- Preços: https://tunnel.to/pricing
- Documentação: https://tunnel.to/docs
- Reserva de nome: https://tunnel.to/docs/reserving-a-name
- Downloads: https://www.tunnel.to/download
- Guia rápido: https://www.tunnel.to/docs/quick-start

### Reservar o nome

1. Crie ou acesse uma conta em https://tunnel.to/.
2. No painel, abra Tunnels e reserve um nome disponível, por exemplo asthen.
3. O endereço reservado será parecido com https://asthen.tunnel.to.
4. Em Tokens, crie um CLI token com as permissões solicitadas pelo guia oficial.
5. Guarde o token em local privado; ele não é o DKB_SECRET.

O cliente deve iniciar o túnel sempre com o mesmo argumento --name asthen.

### Compatibilidade com Windows

**A página oficial de downloads consultada lista binários para macOS e Linux; não lista um executável nativo para Windows.** Portanto, não recomendo tunnel.to para o teste atual entre dois Windows sem uma forma de executar o cliente Linux/macOS suportado.

### Instalar na VPS Linux quando migrarem

Na VPS Linux, use:

~~~bash
curl -fsSL https://tunnel.to/install.sh | bash
~~~

Crie o token na conta e defina-o somente na sessão local:

~~~bash
export TUNNELTO_TOKEN='COLE_SEU_TOKEN_LOCALMENTE'
tunnelto 8787 --name asthen
~~~

Confirme que o painel mostra o túnel conectado e que o hostname corresponde ao nome reservado.

### Início automático na VPS com systemd

Depois de testar manualmente, crie um arquivo local para o token:

~~~bash
sudo nano /etc/asthen-tunnel.env
~~~

Conteúdo:

~~~env
TUNNELTO_TOKEN=COLE_SEU_TOKEN_LOCALMENTE
~~~

Proteja:

~~~bash
sudo chmod 600 /etc/asthen-tunnel.env
~~~

Crie /etc/systemd/system/asthen-tunnel.service. Troque BOT_USER pelo usuário Linux real e confirme o caminho do binário com which tunnelto.

~~~ini
[Unit]
Description=ASTHEN persistent tunnel
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=BOT_USER
EnvironmentFile=/etc/asthen-tunnel.env
ExecStart=/usr/local/bin/tunnelto 8787 --name asthen
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
~~~

Ative:

~~~bash
sudo systemctl daemon-reload
sudo systemctl enable --now asthen-tunnel
sudo systemctl status asthen-tunnel
~~~

Veja logs:

~~~bash
sudo journalctl -u asthen-tunnel -f
~~~

O processo reinicia se cair e inicia no boot. O próprio BOT-ASTHEN também precisa ser configurado para iniciar automaticamente. Ao migrar do PC para a VPS, pare o túnel antigo antes de iniciar o mesmo hostname na nova máquina.

---

## Configuração final do plugin

Depois que o plugin implementar Long Polling, use o endereço público do provedor escolhido:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://SUA-URL-PUBLICA"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 35
    long-poll:
      enabled: true
      wait-seconds: 20
~~~

Não acrescente /plugin/v1 à URL. O plugin monta os caminhos internamente.

## Checklist rápido

- [ ] O bot está ativo e ouvindo em 127.0.0.1:8787.
- [ ] O túnel está conectado no mesmo PC em que o bot está rodando.
- [ ] O endereço HTTPS abre e chega à API (sem Authorization, espera-se HTTP 401).
- [ ] DKB_SECRET no bot é igual a bridge.secret no plugin.
- [ ] bridge.poll.url contém apenas a URL-base HTTPS.
- [ ] O plugin usa Long Polling apenas depois de implementar a versão compatível.
- [ ] Nenhum token/segredo foi publicado no GitHub.
