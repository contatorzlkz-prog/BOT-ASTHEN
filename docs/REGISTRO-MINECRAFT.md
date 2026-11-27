# Registro Minecraft — ASTHEN BOT 2.25.0

## Modelo de acesso

- `@everyone`: vê somente `#📝・registro`.
- `Membro`: recebe acesso aos canais comuns depois de concluir o cadastro.
- `PC`, `Mobile`, `Console`: cargos cosméticos do Onboarding; não liberam canais.
- `Staff` e gerência: recebem acesso somente às áreas de trabalho que correspondem à função.
- Tickets: o dono só tem acesso enquanto estiver registrado.

O nick Minecraft é salvo como identidade da conta, mas **não é copiado para o apelido do Discord**. O bot não altera apelidos.

## Configuração

1. Em `/configurar`, selecione o canal `📝・registro` e o cargo `Membro`. Se o canal não existir, o bot pode criá-lo em `👋 Entrada`.
2. Ative **Server Members Intent** em Developer Portal → Bot → Privileged Gateway Intents.
3. Dê ao bot **Manage Roles**, **Manage Channels**, **View Channels**, **Send Messages** e **Read Message History**.
4. Posicione o cargo do bot acima de `Membro` e dos cargos que ele precisa administrar.
5. Execute `/outros seguranca analisar` para conferir a prévia.
6. Execute `/outros seguranca aplicar membro:@Membro confirmar:true` para aplicar a política e exigir que todos façam novo registro.

## Fluxo

1. O membro entra e pode ter `PC`, `Mobile` ou `Console` selecionado no Onboarding.
2. Nenhum desses cargos libera canais; ele continua vendo apenas `#📝・registro`.
3. Envia o nick Minecraft no formulário.
4. O bot salva o vínculo, concede `Membro`, libera os canais e oculta `#📝・registro`.
5. A loja e os tickets usam o nick salvo automaticamente.

O log de cada cadastro é enviado como um único embed consolidado. O bot não gera mensagens separadas para falha de apelido, porque não tenta alterar o apelido do Discord.

## Reinício geral

O reinício é parte de `/outros seguranca aplicar` e exige confirmação. O bot faz a verificação da hierarquia antes de aplicar a política; remove `Membro` de todos que consegue gerenciar e limpa os vínculos Minecraft daquele servidor. O proprietário do servidor é uma exceção porque o Discord não permite que o bot remova cargos dele. Outros cargos não são apagados.

## Supabase

Não execute migração nem crie outra tabela. Os jogadores ficam em `payload.players` na tabela `asthen_bot_state`, com `discord_id`, `minecraft_nick`, `created_at`, `updated_at` e `guild_id` quando conhecido. A chave secreta existente continua sendo usada apenas no backend.

## Validação

A validação preserva os caracteres aceitos pelo fluxo Bedrock legado: letras, números, sublinhado, ponto e espaço interno, até 32 caracteres.
