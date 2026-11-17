# ASTHEN BOT

Bot do Discord do ASTHEN MC. Organiza atendimento, loja Bedrock, pagamentos e entrega pelo Plugin-ASTHEN. Código atual: 2.16.0.

<p>
  <a href="https://github.com/contatorzlkz-prog/BOT-ASTHEN/releases/latest/download/ASTHEN-BOT-v2.15.0.zip"><strong>Baixar ASTHEN BOT 2.15.0</strong></a>
  · <a href="docs/GUIA.md">Guia de instalação e uso</a>
  · <a href="docs/PLUGIN-INTEGRATION.md">Integração Minecraft</a>
</p>

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-stock%20persistente-3ECF8E?logo=supabase&logoColor=white)
[![CI](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/contatorzlkz-prog/BOT-ASTHEN/actions/workflows/ci.yml)

## Instalar

**Windows:** extraia o ZIP, execute `INSTALAR.bat` e depois `INICIAR.bat`.

**Linux:** execute `bash linux/setup-linux.sh` e depois `bash linux/start-linux.sh`.

Requisito: Node.js 22 ou mais recente. O instalador cria o `.env`; não publique esse arquivo.

## Canais do Discord

O bot reconhece os canais pelo nome ao iniciar. Use estes nomes:

| Canal | Função |
|---|---|
| `#atendimento` | Painel de suporte e tickets. |
| `#kits` | Painel da loja. |
| `#logs` | Registros privados da equipe. |
| `#compradores` | Avisos de compras confirmadas. |

Para vincular manualmente os canais e o cargo da equipe:

~~~text
/configurar atendimento:#atendimento kits:#kits logs:#logs compradores:#compradores equipe:@Equipe
~~~

O bot reconhece os canais pelo nome. Na atualização 2.16.0, migra o painel da loja para seleção direta, preserva pedidos existentes e restringe #logs a administradores.

## Loja

O Plugin-ASTHEN cria os kits, define seus itens, preços e disponibilidade. O bot importa o catálogo automaticamente.

- `/kit listar`: consulta os kits sincronizados.
- `/kit editar`: altera nome exibido, descrição e imagem.
- **Kit Demonstração:** aparece quando ainda não há kit real; abre uma prévia, mas não gera Pix, compra ou entrega.
- Novos pedidos usam Bedrock automaticamente; o servidor Paper precisa de Geyser + Floodgate.

## Integração

O BOT-ASTHEN mantém a API local em `127.0.0.1:8787`. O plugin acessa essa API por HTTPS usando um túnel. `DKB_SECRET` no `.env` do bot precisa ser igual a `bridge.secret` no plugin.

## Documentação

- [Guia completo: instalação, canais, loja, tickets e Supabase](docs/GUIA.md)
- [Contrato técnico do Plugin-ASTHEN](docs/PLUGIN-INTEGRATION.md)
- [Túneis HTTPS e migração para VPS](docs/TUNNEL-SETUP.md)
- [Handoff técnico para o desenvolvedor do plugin](docs/PLUGIN-IMPLEMENTATION-HANDOFF.md)
- [Prompt ativo do Plugin-ASTHEN 1.3.0](prompts/PLUGIN-ASTHEN-1.3.0-CORRECOES.md)

## Desenvolvimento

~~~bash
npm install
npm run check
npm run check:commands
npm test
~~~

Os testes usam dados temporários. Preserve `.env` e toda a pasta `data/` ao atualizar o bot.
