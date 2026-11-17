# Prompt de manutenção do Plugin-ASTHEN

Este diretório contém um prompt de desenvolvimento para a atualização do plugin Minecraft.

[**Plugin-ASTHEN 1.3.0 — correções e integração**](PLUGIN-ASTHEN-1.3.0-CORRECOES.md)

O documento foi escrito com base no Plugin-ASTHEN 1.2.0 e no contrato do BOT-ASTHEN 2.15.0. Ele descreve uma atualização pretendida; não é código executado pelo bot e não substitui a documentação atual.

## Estado de referência

- **BOT-ASTHEN:** 2.16.0, Node.js 22+, discord.js 14.
- **Plugin-ASTHEN:** o documento parte da versão 1.2.0 e descreve a evolução para 1.3.0. Confirme a versão instalada antes de aplicar qualquer instrução.

Consulte primeiro o contrato atual em [docs/PLUGIN-INTEGRATION.md](../docs/PLUGIN-INTEGRATION.md).

## Regras de manutenção

1. Leia os dois repositórios e confirme as versões antes de alterar código.
2. Trabalhe em branch e Pull Request; preserve a branch principal.
3. Nunca copie ou publique `.env`, tokens, `DKB_SECRET`, chaves Pix, credenciais Supabase ou tokens de túnel.
4. Preserve pedidos, reservas, históricos e filas persistentes.
5. Não declare testes Paper, Geyser/Floodgate ou Discord real sem executar esses ambientes.
6. Preserve compatibilidade com polling tradicional durante migrações.
7. Corrija a causa dos erros e registre claramente o que não foi testado.

## Repositórios

- [BOT-ASTHEN](https://github.com/contatorzlkz-prog/BOT-ASTHEN)
- [Plugin-ASTHEN](https://github.com/ElbsxS1/Plugin-ASTHEN)
