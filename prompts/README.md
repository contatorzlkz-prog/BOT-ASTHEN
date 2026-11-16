# Prompts de manutenção do ASTHEN

Esta pasta reúne os prompts para corrigir e evoluir o BOT-ASTHEN e o Plugin-ASTHEN.

## Comece por aqui

| Documento | Quando usar |
|---|---|
| [Integração completa](INTEGRACAO-ASTHEN-COMPLETA.md) | Um agente terá acesso aos dois repositórios e fará a atualização coordenada. **Recomendado.** |
| [Plugin-ASTHEN 1.3.0](PLUGIN-ASTHEN-1.3.0-CORRECOES.md) | Trabalho focado no plugin Java/Paper. |
| [BOT-ASTHEN 2.13.0](BOT-ASTHEN-2.13.0-CORRECOES.md) | Trabalho focado no bot Node.js/Discord. |

## Repositórios

- Bot: https://github.com/contatorzlkz-prog/BOT-ASTHEN
- Plugin: https://github.com/ElbsxS1/Plugin-ASTHEN

## Estado verificado antes dos prompts

- BOT-ASTHEN: versão 2.12.0, Node.js 22+, Discord.js 14.
- Plugin-ASTHEN: versão 1.2.0, Paper 26.3, Java 25.
- O bot 2.12.0 aceita Long Polling de até 25 segundos em GET /plugin/v1/pull?wait_ms=....
- O plugin 1.2.0 ainda usa polling tradicional e não envia wait_ms.
- O plugin persiste kits, pedidos e kits pendentes em arquivos locais; a auditoria encontrou pontos de recuperação e segurança a reforçar.
- Os testes do plugin são 67 testes JDK-only; as classes diretamente dependentes do Paper ainda exigem teste em servidor real.
- No bot, test/store-kits.test.js importa o armazenamento real de src/store.js. O INSTALAR.bat executa npm test; portanto, a primeira correção deve isolar os testes do data/state.json real.

## Regras

1. Estes documentos são especificações de trabalho, não confirmação de que as correções já foram feitas.
2. Leia o repositório real antes de codificar; confirme se o código mudou desde a auditoria.
3. Trabalhe em branch e abra Pull Request. Não faça commit direto em main sem autorização explícita.
4. Não solicite, copie ou publique .env, tokens, chaves Pix, DKB_SECRET, credenciais do Supabase ou tokens de túnel.
5. Não remova dados, pedidos, kits, reservas ou históricos para simplificar testes ou migrações.
6. Não declare teste Paper real, entrega real, teste com Floodgate ou restauração de backup sem executar a verificação correspondente.
7. Preserve compatibilidade com instalações existentes e com polling antigo durante a migração.
8. Corrija as causas, não esconda erros com catch vazio, retorno de lista vazia ou logs que dizem sucesso sem confirmação.

## Ordem sugerida

1. Corrigir isolamento dos testes e proteção dos dados no BOT-ASTHEN.
2. Implementar fila persistente e estados de entrega no bot.
3. Adicionar ao bot o endpoint autenticado de atualização posterior da entrega.
4. Corrigir persistência/recuperação das pendências e implementar Long Polling no Plugin-ASTHEN.
5. Testar o ciclo completo com BOT 2.13.0 e Plugin 1.3.0.
6. Publicar versões e instruções de atualização somente depois dos testes.
