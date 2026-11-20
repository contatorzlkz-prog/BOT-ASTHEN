# ASTHEN BOT

Bot Discord do ASTHEN MC: atendimento privado, loja de kits Bedrock, pagamentos por Pix e entrega pelo Plugin-ASTHEN.

[**Baixar código-fonte atualizado (2.19.0)**](https://github.com/contatorzlkz-prog/BOT-ASTHEN/archive/refs/heads/main.zip) · [Versões publicadas](https://github.com/contatorzlkz-prog/BOT-ASTHEN/releases) · [Guia](docs/GUIA.md) · [Integração Minecraft](docs/PLUGIN-INTEGRATION.md)

![ASTHEN BOT 2.19.0](https://img.shields.io/badge/ASTHEN-2.19.0-555555)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![discord.js 14](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-persistência-3ECF8E?logo=supabase&logoColor=white)
[![CI](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml)

## O que ele faz

- Tickets privados de suporte e compra.
- Catálogo de kits sincronizado com o Minecraft.
- Aprovação manual de pagamentos pela equipe.
- Reserva semanal de estoque no Supabase, com liberação idempotente após cancelamentos/estornos confirmados.
- Entrega e recuperação de pedidos pelo Plugin-ASTHEN, com proteção contra tickets duplicados.

## Instalação

**Windows:** extraia o ZIP, execute `INSTALAR.bat` e depois `INICIAR.bat`.

**Linux:** execute `bash linux/setup-linux.sh` e depois `bash linux/start-linux.sh`.

Requisito: Node.js 22 ou superior.

## Configuração do Discord

Crie os canais abaixo (o bot também consegue reconhecê-los pelos nomes) e configure:

| Canal | Finalidade |
|---|---|
| `#atendimento` | Painel de suporte |
| `#kits` | Loja de kits |
| `#logs` | Registros administrativos; somente administradores e o bot |
| `#compradores` | Avisos de compras |

Comando de configuração:

```text
/configurar atendimento:#atendimento kits:#kits logs:#logs compradores:#compradores equipe:@Equipe
```

O cargo `equipe` pode revisar pagamentos e fechar tickets. Ele não recebe acesso ao canal `#logs`.

## Loja e Minecraft

O Plugin-ASTHEN é a origem dos kits, itens, preços e disponibilidade. No Discord, use `/kit listar` e `/kit editar` para consultar os kits e ajustar apenas sua apresentação comercial.

A loja aceita Bedrock. Para validar jogadores Bedrock no Paper, use Geyser e Floodgate. O controle de estoque semanal e a aprovação de compras dependem do Supabase; execute `supabase/SETUP.sql` no SQL Editor.

A integração usa a API local `127.0.0.1:8787`, publicada para o plugin por um túnel HTTPS. O segredo `DKB_SECRET` do bot precisa ser igual a `bridge.secret` no plugin. Veja [o guia de integração](docs/PLUGIN-INTEGRATION.md) e [o guia de túneis](docs/TUNNEL-SETUP.md).

## Desenvolvimento

```bash
npm ci
npm run verify
```

O `package-lock.json` fixa as versões diretas e transitivas. Use `npm ci` para instalar exatamente a árvore registrada; esse comando também verifica se o `package.json` e o lockfile estão sincronizados.

A CI executa essas verificações a cada atualização da branch principal.

## Dados e segurança

Preserve `.env` e toda a pasta `data/` ao atualizar. Não publique tokens Discord, `DKB_SECRET`, credenciais Supabase ou backups com dados de clientes. Em Linux/macOS, o bot restringe `data/` a 700 e os arquivos de estado a 600. No Windows, mantenha a pasta em uma conta confiável e restrinja o acesso pelas permissões NTFS.

**Atenção ao Pix:** esta distribuição ainda contém a chave Pix e o QR Code da instalação original no código/arquivo de imagem. Eles são públicos neste repositório. Antes de usar uma cópia para outra loja, confira e substitua os dois; não presuma que pertencem à sua instalação.
