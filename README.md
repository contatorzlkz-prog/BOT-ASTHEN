<div align="center">

# ASTHEN BOT

**Discord e Minecraft trabalhando juntos.**

Atendimento privado, loja de kits Bedrock e entrega integrada ao Plugin-ASTHEN.

<p>
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/archive/refs/heads/main.zip">
    <img src="https://img.shields.io/badge/BAIXAR-C%C3%93DIGO--FONTE-30343B?style=flat-square&labelColor=17191D" alt="Baixar código-fonte">
  </a>
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/releases">
    <img src="https://img.shields.io/badge/VERS%C3%95ES-RELEASES-30343B?style=flat-square&labelColor=17191D" alt="Versões">
  </a>
  <a href="docs/GUIA.md">
    <img src="https://img.shields.io/badge/ABRIR-GUIA-30343B?style=flat-square&labelColor=17191D" alt="Guia">
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/ASTHEN-2.25.0-555B63?style=flat-square" alt="Versão 2.25.0">
  <img src="https://img.shields.io/badge/Node.js-22%2B-555B63?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22 ou superior">
  <img src="https://img.shields.io/badge/discord.js-14.27.0-555B63?style=flat-square&logo=discord&logoColor=white" alt="discord.js 14.27.0">
  <img src="https://img.shields.io/badge/npm-lockfile-ativo-555B63?style=flat-square&logo=npm&logoColor=white" alt="Lockfile npm">
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/contatorzlkz-prog/BOT-ASTHEN/ci.yml?branch=main&style=flat-square&label=CI" alt="Status da CI">
  </a>
</p>

</div>

---

## Navegação

[Visão geral](#visao-geral) · [Início rápido](#inicio-rapido) · [Discord](#configuracao-do-discord) · [Minecraft e loja](#minecraft-e-loja) · [Desenvolvimento](#desenvolvimento) · [Segurança](#seguranca-e-atualizacao) · [Documentação](#documentacao)

<a id="visao-geral"></a>

## Visão geral

O ASTHEN BOT conecta a operação da loja ao Discord. Os clientes abrem tickets e consultam o catálogo; a equipe revisa os pagamentos; o Plugin-ASTHEN continua responsável pelos kits reais e pela entrega dentro do Minecraft.

| Área | Recursos |
|---|---|
| **Atendimento** | Tickets privados para suporte e compras. |
| **Loja** | Catálogo sincronizado com os kits recebidos do Minecraft. |
| **Pagamentos** | Dados Pix e aprovação manual pela equipe. |
| **Estoque** | Reservas semanais no Supabase, com liberação idempotente em cancelamentos e estornos confirmados. |
| **Entregas** | Integração com o Plugin-ASTHEN, fila persistente e recuperação de solicitações. |

### Como as partes se conectam

```text
       CLIENTE
          |
          v
   DISCORD / ASTHEN BOT
    tickets e catálogo
          |
          v
   REVISÃO DO PAGAMENTO
        pela equipe
          |
          v
       SUPABASE
   reserva de estoque
          |
          v
     BRIDGE HTTPS
          |
          v
     PLUGIN-ASTHEN
          |
          v
     SERVIDOR PAPER
   entrega dentro do jogo
```

> **Importante:** o Plugin-ASTHEN é a fonte oficial dos kits, itens, preços e disponibilidade. O Discord controla apenas a apresentação comercial do catálogo.

<a id="inicio-rapido"></a>

## Início rápido

**Requisito:** Node.js 22 ou superior.

### Windows

1. Baixe e extraia o código-fonte.
2. Execute `INSTALAR.bat`.
3. Informe o token do bot e o Application ID quando solicitado.
4. Inicie com `INICIAR.bat`.

### Linux

Na pasta do projeto, execute:

```bash
bash linux/setup-linux.sh
bash linux/start-linux.sh
```

Para a operação completa da loja, configure também o Supabase e conecte o Plugin-ASTHEN. Os passos estão no [guia de operação](docs/GUIA.md).

<a id="configuracao-do-discord"></a>

## Configuração do Discord

Crie os canais abaixo. O bot também consegue reconhecer os nomes padrão automaticamente.

| Canal | Finalidade |
|---|---|
| `#atendimento` | Painel de suporte e abertura de tickets. |
| `#kits` | Painel da loja e catálogo Minecraft. |
| `#logs` | Registros administrativos; acesso restrito a administradores e ao bot. |
| `#compradores` | Avisos de compras confirmadas. |

Configure os canais e o cargo da equipe:

```text
/configurar atendimento:#atendimento kits:#kits logs:#logs compradores:#compradores equipe:@Equipe
```

O cargo informado em `equipe` pode revisar pagamentos e fechar tickets. **Ele não recebe acesso ao canal `#logs`**.

### Comandos do Discord

O bot tem somente três comandos principais:

| Comando | Uso |
|---|---|
| `/configurar` | Salva canais principais e os cargos `Membro` e `equipe`. |
| `/kit configurar` | Abre o painel para configurar os kits recebidos do Minecraft. |
| `/outros seguranca analisar` | Mostra uma prévia da política de acesso. |
| `/outros seguranca aplicar` | Aplica a política, remove `Membro` de todos que o bot pode gerenciar e exige novo cadastro. |
| `/outros tiktok publicar` | Publica um vídeo no canal `#vídeos-novos`. |
| `/outros backup status` e `/outros backup criar` | Consulta ou cria backups. |
| `/outros minecraft status` | Verifica API, plugin, fila e sincronização. |

### Registro Minecraft e permissões

Configure `registro:#📝・registro` e `membro:@Membro` em `/configurar`. Se o canal ainda não existir, o bot cria `👋 Entrada` e `📝・registro`.

A configuração completa fica em `/outros seguranca analisar` e `/outros seguranca aplicar membro:@Membro confirmar:true`. A aplicação exige confirmação, verifica a hierarquia antes de alterar permissões e reinicia os cadastros: remove `Membro` de todos os membros que o bot consegue gerenciar e limpa os vínculos antigos do servidor.

- `@everyone` só consegue ver o canal de registro.
- `Membro` permite ver e conversar nos canais comuns.
- `PC`, `Mobile` e `Console` são cosméticos do Onboarding e não liberam canais.
- `Staff` e cargos de gerência recebem acesso conforme a finalidade do canal.
- Tickets existentes só ficam acessíveis ao dono depois de concluir o cadastro; os canais de equipe e logs continuam restritos.
- Membros comuns podem ler, conversar, reagir e usar figurinhas. Não podem criar tópicos, enquetes, anexar arquivos, mencionar todos ou usar comandos de aplicativo.
- O bot não sincroniza o nick Minecraft com o apelido do Discord. O apelido é administrado diretamente no Discord.
- `#vídeos-novos` é somente leitura para membros. Apenas o ASTHEN BOT publica.

`/outros seguranca aplicar` não altera as permissões globais dos cargos. Cargos com `Administrator` ignoram as restrições de canais e impedem a aplicação se não forem cargos de gerência confiáveis. O dono do servidor não pode ter o próprio cargo removido pelo bot, por limitação do Discord.

<a id="minecraft-e-loja"></a>

## Minecraft e loja

### Catálogo e kits

O Plugin-ASTHEN é responsável por criar os kits reais, definir seus itens, preços e disponibilidade. Depois da sincronização, eles aparecem no catálogo do Discord.

Comandos disponíveis no Discord:

| Comando | Ação |
|---|---|
| `/kit listar` | Consulta os kits e o estado de venda recebido do Minecraft. |
| `/kit editar` | Ajusta nome exibido, descrição e imagem HTTPS. |

O Discord não cria kits nem altera seus itens, preços ou disponibilidade oficial.

### Supabase

O Supabase mantém o estado compartilhado da operação e controla as reservas semanais de estoque.

1. Abra **Supabase → SQL Editor → New query**.
2. Execute o arquivo completo [`supabase/SETUP.sql`](supabase/SETUP.sql).
3. Configure as credenciais no arquivo local `.env`.

As credenciais devem permanecer no ambiente privado da instalação. Não as coloque neste README nem em commits.

### Conexão com o servidor Minecraft

A API do bot escuta localmente em `127.0.0.1:8787`. O Plugin-ASTHEN consulta essa API por uma URL HTTPS publicada por um túnel.

O segredo `DKB_SECRET` do bot deve ser igual ao valor de `bridge.secret` no plugin. Preserve o mesmo segredo ao atualizar o bot.

Consulte:
- [Integração BOT-ASTHEN ↔ Plugin-ASTHEN](docs/PLUGIN-INTEGRATION.md)
- [Configuração dos túneis HTTPS](docs/TUNNEL-SETUP.md)

<a id="desenvolvimento"></a>

## Desenvolvimento

O repositório inclui `package-lock.json`, que registra as versões diretas e transitivas das dependências.

```bash
npm ci
npm run verify
```

Para iniciar o bot manualmente:

```bash
npm start
```

O comando `npm run verify` executa as verificações de sintaxe, valida os comandos do Discord e roda os testes automatizados. A CI repete essas verificações nas atualizações da branch principal e em pull requests.

### Estrutura do projeto

| Caminho | Conteúdo |
|---|---|
| `src/` | Código principal do bot, comandos, tickets e armazenamento. |
| `bot-integration/` | Bridge HTTP entre o bot e o Plugin-ASTHEN. |
| `supabase/` | SQL de configuração do banco. |
| `docs/` | Guias de operação, integração e túneis. |
| `linux/` | Scripts de instalação e inicialização no Linux. |
| `test/` | Testes automatizados. |

<a id="seguranca-e-atualizacao"></a>

## Segurança e atualização

Antes de atualizar, faça uma cópia de segurança de:

- `.env` — token Discord, `DKB_SECRET` e credenciais Supabase.
- `data/` — estado local, configurações e fila persistente de entregas.

Substitua os arquivos do programa, mas preserve esses dados. Nunca publique tokens, segredos, credenciais ou backups que contenham informações de clientes.

No Linux/macOS, o bot restringe as permissões de `data/` e dos arquivos de estado. No Windows, limite o acesso à pasta pelas permissões NTFS da conta que executa o bot.

> [!CAUTION]
> **Dados Pix da instalação original:** esta distribuição pública ainda contém a chave Pix e o QR Code da loja original no código/arquivo de imagem. Antes de usar uma cópia em outra loja, confira e substitua **os dois**. Não presuma que esses dados pertencem à sua instalação.

<a id="documentacao"></a>

## Documentação

| Documento | Conteúdo |
|---|---|
| [Guia de operação](docs/GUIA.md) | Instalação, configuração do Discord, loja, Supabase e backups. |
| [Integração do plugin](docs/PLUGIN-INTEGRATION.md) | Contrato HTTP, autenticação, sincronização e entregas. |
| [Túneis HTTPS](docs/TUNNEL-SETUP.md) | Publicação segura da API local para o servidor Minecraft. |
| [Histórico de versões](https://github.com/contatorzlkz-prog/BOT-ASTHEN/releases) | Versões e arquivos publicados. |
| [GitHub Actions](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions) | Execução das verificações automatizadas. |

---

<div align="center">

**ASTHEN BOT · 2.25.0**

<sub>Atendimento, loja e entregas em uma única integração.</sub>

</div>
