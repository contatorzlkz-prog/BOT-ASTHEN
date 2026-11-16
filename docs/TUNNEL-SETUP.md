# Túneis HTTPS do ASTHEN BOT

Este guia padroniza o endereço público usado pelo Plugin-ASTHEN para chegar à API do BOT-ASTHEN, sem abrir a porta 8787 no roteador.

## Padrão do projeto

O nome reservado para a máquina que hospeda o bot será:

**asthen-bot**

Com Tailscale Funnel, o endereço terá este formato:

~~~text
https://asthen-bot.NOME-DO-TAILNET.ts.net
~~~

O trecho depois de asthen-bot é o nome DNS do tailnet mostrado no painel Tailscale, em DNS. O endereço completo só pode ser copiado depois de entrar na conta e ativar o Funnel. Não invente nem substitua esse sufixo por um exemplo.

A regra é manter:
- Máquina que hospeda o bot: nome Tailscale asthen-bot.
- API local do bot: 127.0.0.1:8787.
- Túnel: encaminhar HTTPS público para a API local na porta 8787.
- Plugin Minecraft: usar a URL HTTPS completa em bridge.poll.url.
- Segredo: DKB_SECRET no .env do bot deve ser igual a bridge.secret no config.yml do plugin.

O computador do Minecraft não precisa instalar Tailscale para acessar um endereço do Funnel: o Funnel publica a aplicação na internet. Instale o Tailscale somente na máquina que hospeda o bot.

## Qual opção usar?

| Situação | Opção |
|---|---|
| Testar entre dois PCs Windows, sem domínio próprio | **Tailscale Funnel com o nome asthen-bot** |
| Teste rápido sem conta de túnel | Cloudflare Quick Tunnel, endereço temporário |
| VPS Linux com hostname registrado gratuito | tunnel.to Registered Free |
| Domínio próprio já disponível | Cloudflare Named Tunnel |

O endereço seusite.netlify.app não pode ser usado como domínio próprio de um Named Tunnel. O domínio netlify.app é administrado pela Netlify; vocês controlam somente o subdomínio do site, não a zona DNS necessária para apontar um domínio à Cloudflare.

## Arquitetura da integração

~~~text
Plugin-ASTHEN (PC/host Minecraft)
          |
          | HTTPS de saída
          v
https://asthen-bot.NOME-DO-TAILNET.ts.net
          |
          | Tailscale Funnel
          v
BOT-ASTHEN (PC Windows ou VPS)
http://127.0.0.1:8787
~~~

O plugin acrescenta os caminhos /plugin/v1/pull, /plugin/v1/result e /plugin/v1/kits. Por isso, bridge.poll.url deve conter somente a URL-base, sem /plugin/v1.

No .env do bot:

~~~env
DKB_HOST=127.0.0.1
DKB_PORT=8787
~~~

O token do Tailscale, o token de outro provedor de túnel e DKB_SECRET são credenciais diferentes. Não publique nenhum deles no GitHub.

---

## 1. Tailscale Funnel no Windows — configuração inicial

### Instalar e entrar no tailnet

1. Instale o Tailscale no PC que executa o BOT-ASTHEN: https://tailscale.com/download/windows
2. Entre na sua conta Tailscale e conclua a configuração do tailnet.
3. Confirme que o BOT-ASTHEN está ativo e que o console mostra a API em http://127.0.0.1:8787.
4. Abra o PowerShell como Administrador.

### Padronizar o nome da máquina

Execute:

~~~powershell
tailscale set --hostname=asthen-bot
~~~

Esse nome precisa estar livre no tailnet. Se já existir outro dispositivo com esse nome, abra o painel de administração do Tailscale, entre em Machines e renomeie o dispositivo antigo para asthen-windows antes de continuar.

O nome DNS completo é formado pelo nome da máquina mais o nome DNS do tailnet. Por exemplo, se o tailnet for exemplo.ts.net, o hostname será asthen-bot.exemplo.ts.net.

### Ativar o Funnel

Com a API do bot ativa, execute no PowerShell como Administrador:

~~~powershell
tailscale funnel --bg 8787
~~~

Na primeira ativação, o Tailscale pode pedir para habilitar HTTPS/Funnel no tailnet. Aprove a configuração solicitada.

O comando exibirá um endereço semelhante a:

~~~text
https://asthen-bot.NOME-DO-TAILNET.ts.net
~~~

Copie o endereço real que aparecer no seu terminal. Confira o estado com:

~~~powershell
tailscale funnel status
tailscale status
~~~

O parâmetro --bg grava a configuração do Funnel em segundo plano. Fechar a janela do PowerShell não encerra o Funnel. A configuração é retomada quando o dispositivo reinicia ou quando o serviço Tailscale reinicia, desde que o Tailscale esteja instalado e iniciado no Windows.

**Atenção:** isso não mantém o próprio BOT-ASTHEN aberto. O processo do bot também precisa estar em execução. Se fechar o console do bot e ele não estiver configurado como serviço ou tarefa automática, o túnel continuará existindo, mas não haverá API respondendo atrás dele.

### No computador do Minecraft

No arquivo plugins/DiscordKitBridge/config.yml, use a URL real copiada do comando.

Para o Plugin-ASTHEN 1.2.0 (polling tradicional):

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://asthen-bot.NOME-DO-TAILNET.ts.net"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 10
~~~

Não acrescente /plugin/v1 à URL. Copie DKB_SECRET localmente do .env do bot para bridge.secret. Nunca coloque o segredo no GitHub ou em mensagens públicas.

O Plugin-ASTHEN 1.2.0 ainda não envia wait_ms. Portanto, ele continuará usando polling tradicional até receber a atualização 1.3.0.

Depois que o Plugin-ASTHEN 1.3.0 implementar Long Polling para o BOT-ASTHEN 2.15.0, a configuração recomendada será:

~~~yaml
bridge:
  enabled: true
  mode: "poll"
  secret: "MESMO_DKB_SECRET_DO_BOT"
  poll:
    url: "https://asthen-bot.NOME-DO-TAILNET.ts.net"
    interval-seconds: 3
    max-per-poll: 5
    http-timeout: 35
    long-poll:
      enabled: true
      wait-seconds: 20
~~~

A seção long-poll só funciona depois que a versão 1.3.0 estiver instalada. Não espere economia de consultas enquanto o plugin 1.2.0 continuar instalado.

### Testar a rota

1. Deixe o bot e o Tailscale ativos.
2. Execute tailscale funnel status e copie a URL exibida.
3. Abra a raiz do endereço no navegador. A API exige Authorization: Bearer; por isso um HTTP 401 na raiz pode ser esperado e confirma que a requisição chegou à API.
4. Confirme que o segredo no bot e no plugin é idêntico.
5. Inicie ou recarregue o Paper e confira os logs do plugin.

O navegador não testa uma compra completa. A validação final exige o plugin autenticado e uma compra de teste controlada.

### O que fica disponível 24 horas?

- Fechar a janela do PowerShell: o Funnel em segundo plano continua.
- Fechar o console do bot: a API para, a menos que o próprio bot esteja rodando como serviço/tarefa.
- Reiniciar o Windows: o Funnel pode retomar em segundo plano, mas o Tailscale e o bot precisam iniciar automaticamente.
- Desligar o PC ou perder a internet: a URL fica indisponível até a máquina voltar.
- Usar uma VPS ligada 24 horas: o endpoint pode ficar disponível 24 horas se o bot e o Funnel também iniciarem automaticamente.

Funnel não transforma um PC desligado em servidor. Ele fornece o endereço e o encaminhamento HTTPS; disponibilidade depende da máquina de origem, do bot e da conexão.

---

## 2. Migrar do Windows para uma VPS sem trocar a URL Tailscale

É possível reutilizar o mesmo hostname, desde que a VPS entre no **mesmo tailnet** e o nome asthen-bot seja liberado no PC antigo antes de ser atribuído à VPS.

A URL completa é formada por:
1. Nome da máquina: asthen-bot.
2. Nome DNS do tailnet: por exemplo, exemplo.ts.net.

Não altere o nome DNS do tailnet. A migração transfere somente o nome da máquina.

### Antes da migração

No PC Windows antigo:

1. Pare o BOT-ASTHEN.
2. Desative a publicação do Funnel nesse dispositivo, se ele não será mais usado:

~~~powershell
tailscale funnel reset
~~~

3. Libere o nome asthen-bot renomeando o dispositivo antigo:

~~~powershell
tailscale set --hostname=asthen-windows
~~~

Também é possível renomear o dispositivo em Machines, no painel de administração do Tailscale.

### Na VPS Linux

1. Instale o Tailscale pela documentação oficial: https://tailscale.com/download/linux
2. Entre no mesmo tailnet usado pelo PC Windows.
3. Confirme que a VPS aparece em Machines.
4. Atribua o nome reservado:

~~~bash
sudo tailscale set --hostname=asthen-bot
~~~

5. Instale e configure o BOT-ASTHEN para iniciar automaticamente.
6. Confirme que a API está ouvindo em 127.0.0.1:8787.
7. Ative o Funnel:

~~~bash
sudo tailscale funnel --bg 8787
~~~

8. Confira:

~~~bash
tailscale funnel status
tailscale status
~~~

Se o nome antigo foi liberado corretamente e o nome DNS do tailnet não mudou, o endereço completo volta a ser:

~~~text
https://asthen-bot.NOME-DO-TAILNET.ts.net
~~~

O plugin pode continuar usando a mesma bridge.poll.url. Pode existir uma interrupção durante a troca, enquanto o dispositivo antigo é renomeado, a VPS assume o nome, o Funnel é habilitado e o DNS/certificado são atualizados.

**Não tente manter dois dispositivos com o nome asthen-bot ao mesmo tempo.** Os nomes de máquina são únicos dentro do tailnet. Se a VPS receber automaticamente o nome asthen-bot-1, é sinal de que o nome original ainda está ocupado.

Se a VPS entrar em outro tailnet, ou se o nome DNS do tailnet for alterado, o endereço completo será diferente e bridge.poll.url precisará ser atualizado.

Documentação oficial:
- Nomes de máquinas: https://tailscale.com/docs/concepts/machine-names
- MagicDNS: https://tailscale.com/docs/features/magicdns
- Tailscale Funnel: https://tailscale.com/docs/features/tailscale-funnel
- Comando Funnel e --bg: https://tailscale.com/docs/reference/tailscale-cli/funnel

---

## 3. Cloudflare Tunnel gratuito

O Cloudflare Tunnel está disponível no plano Free, mas há duas modalidades diferentes:

- **Quick Tunnel:** não exige domínio e entrega uma URL trycloudflare.com aleatória. É temporária e pode mudar quando o túnel é recriado.
- **Named Tunnel:** tem um identificador persistente e pode manter um hostname próprio, mas para publicar um domínio como bot.seudominio.com é necessário controlar um domínio e configurá-lo na Cloudflare.

O subdomínio seusite.netlify.app não substitui um domínio próprio para essa configuração, porque a zona DNS netlify.app pertence à Netlify.

### Teste rápido no Windows com Quick Tunnel

O repositório inclui INICIAR-TUNEL.bat.

1. Inicie o BOT-ASTHEN.
2. Execute INICIAR-TUNEL.bat.
3. Copie a URL trycloudflare.com mostrada no terminal.
4. Coloque a URL-base em bridge.poll.url no plugin.
5. Mantenha o processo cloudflared e o bot ativos.

Quando o processo do Quick Tunnel é encerrado, a URL deixa de funcionar. Ao criar outro Quick Tunnel, o endereço pode mudar e precisa ser atualizado no plugin. Use somente para testes temporários.

### Named Tunnel com domínio próprio

Se vocês comprarem ou já tiverem um domínio:

1. Adicione o domínio à Cloudflare e conclua a configuração DNS.
2. No painel Cloudflare, crie um Named Tunnel.
3. Instale cloudflared na máquina do bot usando o comando fornecido pelo painel.
4. Crie uma Published Application Route.
5. Defina um hostname, por exemplo bot.seudominio.com.
6. Configure o serviço de destino como http://127.0.0.1:8787.
7. Use https://bot.seudominio.com em bridge.poll.url.

Guarde o Tunnel Token como segredo. Não o publique.

Documentação:
- https://developers.cloudflare.com/tunnel/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

---

## 4. tunnel.to Registered Free para VPS Linux

tunnel.to é um serviço separado do Cloudflare Tunnel. O plano Registered Free anuncia a possibilidade de reservar um hostname na conta e reutilizá-lo quando o cliente reconecta com o mesmo nome. Confira preços, cotas e limites atuais antes de depender dele.

- Painel e preços: https://tunnel.to/pricing
- Documentação: https://tunnel.to/docs
- Reserva de nome: https://tunnel.to/docs/reserving-a-name
- Downloads: https://www.tunnel.to/download
- Guia rápido: https://www.tunnel.to/docs/quick-start

A página de downloads consultada lista clientes para Linux e macOS, mas não um binário Windows nativo. Por isso, não é a opção recomendada para os dois PCs Windows do teste inicial.

### Reservar o endereço

1. Crie uma conta em https://tunnel.to/.
2. No painel, abra Tunnels e reserve um nome disponível, por exemplo asthen.
3. O endereço reservado será parecido com https://asthen.tunnel.to.
4. Crie um CLI token com as permissões pedidas pelo guia oficial.
5. Guarde o token em local privado.
6. Na VPS Linux, inicie o cliente usando o nome reservado.

Exemplo de instalação indicado no guia do serviço:

~~~bash
curl -fsSL https://tunnel.to/install.sh | bash
~~~

Depois, use o token localmente conforme a documentação atual do tunnel.to. Não publique o token e não o confunda com DKB_SECRET.

Para que o túnel volte depois de uma reinicialização, configure o cliente como serviço systemd com Restart=always e habilite o serviço no boot. O BOT-ASTHEN também precisa iniciar automaticamente.

---

## Checklist de conexão

- [ ] BOT-ASTHEN ativo na máquina que hospeda a API.
- [ ] API local em 127.0.0.1:8787.
- [ ] No Tailscale, a máquina do bot se chama asthen-bot.
- [ ] Funnel ativo e apontando para 8787.
- [ ] URL completa copiada do comando/painel, sem placeholders.
- [ ] bridge.poll.url contém somente a URL-base HTTPS.
- [ ] DKB_SECRET é igual a bridge.secret.
- [ ] O plugin instalado é compatível com o modo de polling configurado.
- [ ] O computador/VPS e a conexão permanecem ativos.
- [ ] Nenhum token ou segredo foi enviado ao GitHub.
