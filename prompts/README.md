# Prompts ASTHEN

Prompts ativos para manutenção coordenada do bot e do plugin.

## Próxima atualização

[Plugin-ASTHEN 1.3.0 — correções e integração](PLUGIN-ASTHEN-1.3.0-CORRECOES.md)

Este é o trabalho pendente: atualizar o plugin Java/Paper para Long Polling, persistência segura das pendências e chamada posterior de `POST /plugin/v1/delivery-update` ao concluir uma entrega que antes retornou `KIT_PENDING`.

## Estado atual dos repositórios

- **BOT-ASTHEN:** 2.15.0, Node.js 22+, Discord.js 14. Loja sincronizada automaticamente com os kits do Minecraft; no Discord só existem `/kit listar` e `/kit editar`.
- **Plugin-ASTHEN:** 1.2.0, Paper 26.3, Java 25. O polling tradicional continua compatível. A chamada de atualização posterior e o Long Polling dependem da versão 1.3.0.

## Regras para agentes de programação

1. Leia o repositório atual antes de implementar; não confie em auditorias antigas.
2. Trabalhe em branch e Pull Request. Não altere `main` sem autorização.
3. Nunca solicite, copie ou publique `.env`, tokens, `DKB_SECRET`, chave Pix, credenciais do Supabase ou tokens de túnel.
4. Preserve configurações, kits, pedidos, reservas e históricos existentes.
5. Não declare testes Paper, Geyser/Floodgate, Discord real ou recuperação de backup sem executar o ambiente correspondente.
6. Preserve compatibilidade com polling tradicional durante a migração.
7. Corrija a causa dos erros; não esconda falhas com `catch` vazio ou logs falsos de sucesso.

## Repositórios

- Bot: https://github.com/contatorzlkz-prog/BOT-ASTHEN
- Plugin: https://github.com/ElbsxS1/Plugin-ASTHEN
