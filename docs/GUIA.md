# Guia do ASTHEN BOT

Guia operacional para instalar, configurar e manter o bot. O contrato técnico da integração está em [PLUGIN-INTEGRATION.md](PLUGIN-INTEGRATION.md); os endereços HTTPS estão em [TUNNEL-SETUP.md](TUNNEL-SETUP.md).

## 1. Instalação

### Windows

1. Extraia o ZIP.
2. Execute `INSTALAR.bat`.
3. Informe o token do bot e o Application ID.
4. Execute `INICIAR.bat`.

### Linux

```bash
bash linux/setup-linux.sh
bash linux/start-linux.sh
```

Requisito: Node.js 22 ou superior.

## 2. Canais do Discord

O bot procura estes nomes ao iniciar. Emoji e separadores no nome não impedem a identificação.

| Canal | Uso |
|---|---|
| `#atendimento` | Painel de suporte e tickets gerais |
| `#kits` | Painel da loja e catálogo Minecraft |
| `#logs` | Registros administrativos; somente administradores e o bot |
| `#compradores` | Avisos de compras confirmadas |

Configure canais e cargo da equipe:

```text
/configurar atendimento:#atendimento kits:#kits logs:#logs compradores:#compradores equipe:@Equipe
```

Os campos são opcionais quando o bot já reconhece os canais pelos nomes padrão. O cargo `equipe` autoriza revisar pagamentos e fechar tickets; **não concede acesso a `#logs`**. Esse canal permanece restrito a administradores e ao bot.

### Painéis

Na primeira inicialização da versão 2.15.0, os painéis antigos foram atualizados para corrigir o layout. Nas inicializações seguintes, o bot procura e preserva as mensagens existentes. Se um painel for apagado, o bot poderá publicar outro. Para atualizar manualmente um painel, use `/configurar atendimento:#atendimento` ou `/configurar kits:#kits`.

## 3. Loja e kits

O **Plugin-ASTHEN é a única origem dos kits reais**. Crie o kit no Minecraft, configure preço e disponibilidade no plugin e aguarde a sincronização. O kit aparece no seletor do canal `#kits`.

Comandos administrativos no Discord:

- `/kit listar`: consulta os kits e o estado de venda recebido do Minecraft.
- `/kit editar`: altera nome exibido, descrição e imagem HTTPS.

O Discord não cria kits, não altera seus itens nem define preço ou disponibilidade oficial. Essas ações pertencem ao Plugin-ASTHEN.

### Kit Demonstração

Enquanto o plugin ainda não sincronizou kits nesta execução do bot, o catálogo mostra um Kit Demonstração. Ele serve apenas para pré-visualização: não cria compra, Pix, reserva de estoque ou entrega.

## 4. Atendimento e pagamentos

O painel `#atendimento` abre tickets privados por assunto. O cliente e a equipe autorizada conversam dentro do canal privado.

As compras são abertas pelo catálogo. O bot apresenta os dados Pix e o QR Code; a equipe confere o comprovante manualmente antes de aprovar. A aprovação reserva uma unidade do estoque semanal no Supabase e inicia a solicitação de entrega ao plugin.

**Importante:** a chave Pix e a imagem QR desta distribuição estão fixas no código e publicadas no repositório. Confira os dados antes de usar o bot em outra loja; substituir apenas a imagem ou apenas a chave deixa as informações inconsistentes.

## 5. Supabase

Abra **Supabase → SQL Editor → New query** e execute o arquivo completo `supabase/SETUP.sql`.

| Objeto | Uso |
|---|---|
| `asthen_bot_state` | Configurações, catálogo sincronizado e tickets |
| `asthen_bot_weekly_stock` | Estoque semanal por kit e servidor |
| `asthen_bot_stock_reservations` | Reserva idempotente de cada compra aprovada |
| `reserve_asthen_weekly_kit_stock(...)` | Reserva transacional, limitada a 10 unidades por kit/semana |

Não crie `asthen_bot_kits` para a versão 2.16.0. Uma tabela antiga com esse nome pode permanecer no projeto; o bot não a consulta.

Configure no `.env`:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=sb_secret_SUA_CHAVE
SUPABASE_TABLE=asthen_bot_state
```

Use a URL base do projeto, sem `/rest/v1`. A chave secreta deve ficar apenas no `.env`. O estoque reinicia domingo às 00:00, horário de Brasília. Abrir catálogo ou ticket não consome unidade; a reserva ocorre na aprovação.

## 6. Atualização e backups

Antes de atualizar, faça cópia de `.env` e de toda a pasta `data/`.

- `.env`: token Discord, `DKB_SECRET` e credenciais Supabase.
- `data/state.json`: configurações, catálogo, tickets e pedidos.
- `data/bridge-queue.json`: fila persistente de entregas.

Substitua os demais arquivos pelos da nova versão. Nunca compartilhe esses arquivos ou credenciais.

## 7. Manutenção, backups e restauração

### Transcrições de tickets

Ao fechar um ticket, o bot exporta a conversa para o canal privado `#logs` antes de excluir o canal original. A exportação inclui autor, horário, conteúdo, mensagens do bot, embeds e referências a respostas. Anexos de até 8 MB são copiados para a pasta local `data/archives/` e enviados ao canal de logs, com limite de 40 anexos por ticket e 40 MB no total. Arquivos que excederem os limites ou falharem no download ficam identificados na transcrição com o motivo e o link original.

O ticket não é excluído se a exportação da transcrição falhar. Mantenha `#logs` configurado e permita que o bot envie arquivos nesse canal. O acesso continua restrito a administradores e ao bot; o cargo de atendimento não recebe acesso aos logs.

### Limpeza automática

- Rascunhos de compra sem atividade expiram após 7 dias. Rascunhos em criação não são removidos.
- Tickets fechados só entram na limpeza depois de possuir uma transcrição exportada; a retenção padrão é de 90 dias.
- Cópias locais de anexos em `data/archives/` são removidas após 180 dias.
- Backups são limitados a 30 cópias e 45 dias de retenção.

Registros sem confirmação de exportação são preservados. A limpeza roda diariamente e não remove tickets abertos nem entregas pendentes.

### Backups e restauração

O ASTHEN cria um backup ao iniciar e a cada 12 horas. Cada cópia contém `.env`, `data/state.json` e `data/bridge-queue.json`, quando presentes. Os arquivos recebem hashes SHA-256 e a restauração verifica a integridade antes de substituir os dados. A pasta `backups/` é privada e está excluída do Git.

Comandos de administrador no Discord:

- `/backup status`: consulta os últimos backups e sua integridade.
- `/backup criar`: cria uma cópia manual.
- `/backup listar`: lista os backups disponíveis.

Para restaurar no Windows, feche o bot e execute `RESTAURAR.bat`. No Linux, execute `bash linux/restore-backup.sh` depois de parar o serviço, ou use `node src/maintenance-cli.js restore ID_DO_BACKUP`. A ferramenta exige que o processo esteja parado, verifica os hashes e cria primeiro uma cópia de segurança do estado atual. Não edite manualmente os arquivos dentro de uma pasta de backup.

### Inicialização e recuperação automáticas

No Windows, execute `INSTALAR-AUTOSTART.bat` para criar a tarefa `ASTHEN BOT` no Agendador de Tarefas. Ela inicia no logon e tenta reiniciar o processo se houver uma falha. Use `REMOVER-AUTOSTART.bat` para desativar.

No Linux com systemd, execute `bash linux/install-autostart.sh`. O serviço de usuário reinicia após falhas; acompanhe com `systemctl --user status asthen-bot` e `journalctl --user -u asthen-bot -f`. Use `bash linux/remove-autostart.sh` para remover.

O bot também cria `data/asthen.pid` para impedir duas instâncias simultâneas. Após reiniciar, ele continua a recuperação das entregas aprovadas usando a fila persistente e o mesmo `request_id`.

### Monitoramento Minecraft

O comando `/bridge status` mostra o último contato autenticado do Plugin-ASTHEN, se ele está respondendo e a idade do pedido mais antigo na fila. Se a Bridge cair ou o plugin ficar mais de 90 segundos sem contato após já ter conectado, o bot envia um alerta de queda/recuperação para `#logs`. O monitoramento também avisa quando a saúde do Supabase muda entre normal e erro.

## 8. Verificações

```bash
npm run check
npm run check:commands
npm test
```

Os testes automatizados não substituem a validação de uma compra e entrega em um servidor Paper de teste.
