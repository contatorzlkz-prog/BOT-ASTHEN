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
  <img src="https://img.shields.io/badge/ASTHEN-2.23.0-555B63?style=flat-square" alt="Versão 2.23.0">
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

### Configuração automática de permissões

O comando `/permissoes analisar` mostra como o bot classificou os cargos e canais. Depois, aplique com `/permissoes configurar membro:@Membro confirmar:true`.

- `@everyone` é o cargo base que todo membro sempre possui. Com a configuração aplicada, somente `#📝・registro` fica visível antes do cadastro.
- `Membro` libera os canais normais e permite escrever/conectar nas áreas comuns.
- `PC`, `Mobile` e `Console` são apenas identificadores escolhidos no Onboarding. Não liberam canais.
- `Staff`, `Ger. Host`, `Ger. Discord`, `Ger. Server` e `Proprietario` recebem acesso conforme o nível do canal. `#logs` fica limitado à gerência superior.
- Tickets ASTHEN e canais com permissões individuais ou cargos especiais são preservados; o configurador não apaga cargos nem altera permissões globais.

### Registro Minecraft e acesso aos canais

Crie `#📝・registro` na categoria de entrada e o cargo `Membro`. Configure:

- Em `#📝・registro`: `@everyone` pode ver o canal, mas não enviar mensagens; o cargo `Membro` não pode ver o canal.
- Nos canais e categorias exclusivos: negue **Ver canal** para `@everyone` e permita para `Membro`.
- Não conceda `Membro` pelo Onboarding. O bot só atribui o cargo depois que o jogador envia o nick no formulário.
- Configure com `/configurar registro:#📝・registro membro:@Membro`.

Depois do registro, o jogador recebe `Membro`, vê os canais privados e deixa de ver `#📝・registro`. Para obrigar todos a registrar novamente, use `/registro reiniciar confirmar:true` como administrador. O comando remove o cargo e limpa os cadastros Minecraft deste servidor; não remove outros cargos nem altera apelidos.

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

**ASTHEN BOT · 2.23.0**

<sub>Atendimento, loja e entregas em uma única integração.</sub>

</div>
