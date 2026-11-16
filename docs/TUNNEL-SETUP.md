# Túnel HTTPS permanente para o ASTHEN

Este documento explica como publicar a API local do BOT-ASTHEN sem abrir a porta 8787 do roteador ou da VPS.

## Topologia correta

- O BOT-ASTHEN continua ouvindo localmente em 127.0.0.1:8787.
- O cliente do túnel roda na mesma máquina que o bot e encaminha HTTPS público para http://127.0.0.1:8787.
- O plugin do Minecraft usa a URL HTTPS pública em bridge.poll.url.
- O segredo DKB_SECRET continua protegendo as rotas da API. Não remova a autenticação.

O plugin deve usar somente o endereço-base do túnel, sem adicionar /plugin/v1. O cliente do plugin acrescenta os caminhos das rotas.

## Opção A — tunnel.to Registered Free

A página oficial de preços anuncia o plano Registered Free por US$ 0, com 1 hostname reservado, 3 API tokens, 2 túneis ativos e 5 GB de tráfego mensal. Confirme os limites diretamente na página porque planos e cotas podem mudar:

- Preços: https://tunnel.to/pricing
- Documentação: https://tunnel.to/docs
- Reserva de nome: https://tunnel.to/docs/reserving-a-name
- Instalação: https://tunnel.to/download
- Guia rápido: https://tunnel.to/docs/quick-start

### 1. Reservar o hostname

1. Crie ou acesse sua conta no painel tunnel.to.
2. Abra **Tunnels** e reserve um nome curto e disponível, por exemplo asthen.
3. O endereço público esperado passa a ser https://asthen.tunnel.to.
4. Abra **Tokens** e crie um CLI token com os escopos de tunnel e name, conforme o guia oficial.
5. Copie o token para um cofre/gerenciador de senhas. Não publique no GitHub, Discord, prints ou chat.

O nome reservado continua sendo o mesmo nas reconexões. O cliente precisa sempre iniciar o túnel usando o parâmetro --name com o mesmo nome.

### 2. Instalar o cliente no Linux da VPS

A instalação oficial documentada para servidores Linux é:

~~~bash
curl -fsSL https://tunnel.to/install.sh | bash
~~~

Em seguida, defina o token somente no ambiente da sessão e teste a conexão:

~~~bash
export TUNNELTO_TOKEN='COLE_SEU_TOKEN_LOCALMENTE'
tunnelto 8787 --name asthen
~~~

O serviço deve indicar a conexão e o hostname reservado. Não compartilhe o token. A página oficial de downloads consultada publica clientes para Linux e macOS; não encontrei instalador nativo de Windows nessa página. Para o PC Windows, use Cloudflare Quick Tunnel temporariamente ou aguarde a migração para uma VPS Linux. Não confunda o serviço atual tunnel.to com projetos antigos de nome parecido.

### 3. Fazer o túnel iniciar com a VPS

Depois de confirmar que o comando manual funciona, configure o token em um arquivo local protegido:

~~~bash
sudo nano /etc/asthen-tunnel.env
~~~

Conteúdo do arquivo:

~~~env
TUNNELTO_TOKEN=COLE_SEU_TOKEN_LOCALMENTE
~~~

Proteja o arquivo:

~~~bash
sudo chmod 600 /etc/asthen-tunnel.env
~~~

Crie /etc/systemd/system/asthen-tunnel.service. Substitua BOT_USER pelo usuário Linux real que executa o bot e confirme o caminho de tunnelto com which tunnelto.

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

Ative o serviço:

~~~bash
sudo systemctl daemon-reload
sudo systemctl enable --now asthen-tunnel
sudo systemctl status asthen-tunnel
~~~

Para acompanhar os logs:

~~~bash
sudo journalctl -u asthen-tunnel -f
~~~

O serviço tenta reconectar se o processo cair e inicia com a VPS. O bot também precisa estar configurado para iniciar automaticamente. Se trocar de máquina, pare o túnel antigo antes de iniciar o mesmo nome na nova máquina.

## Opção B — Cloudflare Tunnel gratuito

Sim: o Cloudflare Tunnel está disponível em todos os planos, inclusive Free. A limitação importante é o endereço público:

- **Quick Tunnel:** gratuito e não exige domínio, mas gera uma URL trycloudflare.com temporária que muda e para de funcionar quando cloudflared é encerrado.
- **Named Tunnel:** persistente, com ID estável, mas para publicar um hostname público a documentação exige um domínio adicionado à Cloudflare. Se você já tem um domínio, não precisa pagar Cloudflare pelo túnel; o domínio pode ter custo de registro/renovação.

Documentação oficial:
- Overview: https://developers.cloudflare.com/tunnel/
- Criar túnel gerenciado: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Quick Tunnels: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

### Para usar domínio próprio

1. Adicione o domínio à sua conta Cloudflare e conclua a configuração DNS/nameservers conforme o assistente.
2. No painel Cloudflare, abra Networking > Tunnels e crie um Named Tunnel.
3. Selecione Windows ou Linux e execute o comando de instalação exibido pelo próprio painel na máquina do bot.
4. Em Routes, adicione uma Published application.
5. Configure o hostname, por exemplo bot.seudominio.com.
6. Como Service URL, informe http://localhost:8787.
7. O endereço estável para o plugin será https://bot.seudominio.com.

No Windows, a Cloudflare documenta a instalação do serviço com Prompt de Comando como Administrador e o comando mostrado no painel. Guarde o Tunnel Token como segredo: não o publique nem o envie ao Discord.

### Para teste no Windows sem domínio

O arquivo INICIAR-TUNEL.bat do bot continua servindo para Quick Tunnel. Ele gera uma URL aleatória trycloudflare.com. É útil para um teste curto, mas não é o endereço de produção permanente.

## Configuração do BOT-ASTHEN

No .env do bot, mantenha a API local:

~~~env
DKB_HOST=127.0.0.1
DKB_PORT=8787
~~~

O valor padrão já é esse. Não altere para 0.0.0.0 quando estiver usando um túnel local.

O token do tunnel.to ou da Cloudflare não substitui DKB_SECRET. São credenciais diferentes.

## Configuração do Plugin-ASTHEN

Depois de compilar a versão do plugin com suporte a Long Polling, use a URL pública reservada. Exemplo tunnel.to:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://asthen.tunnel.to"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 35
    long-poll:
      enabled: true
      wait-seconds: 20
~~~

Para Cloudflare com domínio próprio, substitua somente a URL pela sua URL pública estável. Não acrescente /plugin/v1.

## Verificação e segurança

1. Inicie o bot e confirme no console que a API está ativa em 127.0.0.1:8787.
2. Inicie o túnel e confirme o estado conectado/healthy no painel ou logs.
3. Teste o hostname HTTPS. Sem Authorization, a API deve recusar a chamada com HTTP 401; isso confirma que a rota chega ao bot sem expor a API sem autenticação.
4. Copie DKB_SECRET localmente para bridge.secret no plugin.
5. Reinicie/recarregue o plugin e confira os logs de autenticação e conexão.

Não publique a API sem autenticação, não envie segredos em prints e não coloque tokens no repositório.

## Migração do PC para VPS mantendo a URL

Com tunnel.to, reserve o nome uma vez e mantenha --name asthen. Ao migrar:

1. Faça backup do .env e da pasta data do bot; não perca DKB_SECRET.
2. Instale o bot na VPS e restaure esses dados com permissões restritas.
3. Instale tunnelto na VPS Linux e configure o mesmo token TUNNELTO_TOKEN.
4. Pare o cliente tunnelto do PC antigo.
5. Ative asthen-tunnel.service na VPS.
6. Mantenha o mesmo hostname https://asthen.tunnel.to no config.yml do plugin.

A URL não muda quando a origem muda de computador, desde que o nome permaneça reservado. A disponibilidade do serviço depende de o bot e o túnel estarem executando e com acesso à internet.
