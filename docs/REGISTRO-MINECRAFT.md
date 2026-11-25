# Registro Minecraft — BOT-ASTHEN 2.20.0

## Discord

1. Ative **Server Members Intent** em Developer Portal → Bot → Privileged Gateway Intents.
2. Crie o cargo **Membro** e o canal **#registro**.
3. Dê ao bot **Manage Roles**, **Manage Nicknames**, **Manage Channels**, **View Channels**, **Send Messages** e **Read Message History**.
4. Posicione o cargo do bot acima de **Membro** e dos cargos dos jogadores; mantenha-o abaixo dos cargos administrativos.
5. Execute `/configurar registro:#registro membro:@Membro`.
6. Nos canais exclusivos de membros, permita **View Channel** para o cargo Membro e negue essa permissão para @everyone. Não bloqueie canais públicos, administrativos ou de atendimento.
7. Autorize cargos extras com `/registro autorizar cargo:@Equipe`; revogue com `/registro revogar cargo:@Equipe`. Administradores e membros com Manage Nicknames/Manage Guild continuam autorizados.
9. Remova **Change Nickname** de @everyone e do cargo Membro (e de outros cargos comuns, se aplicável). A equipe pode manter sua permissão.

## Supabase

Não execute migração nem crie outra tabela. Os jogadores ficam em `payload.players` na tabela `asthen_bot_state`, com `discord_id`, `minecraft_nick`, `created_at`, `updated_at` e `guild_id` quando conhecido. A chave secreta existente continua sendo usada apenas no backend.

## Uso

- Usuários sem registro visualizam #registro e enviam o nick no modal.
- O bot salva o vínculo, tenta atribuir Membro e sincroniza o apelido.
- Atualização: `/conta atualizar-nick`; consulta: `/conta perfil`.
- A loja obtém o nick pelo ID Discord; a compra não pede confirmação nem edição do nick.
- O bot reconcilia registros na entrada e na inicialização. Falhas de permissão são registradas nos logs, sem apagar o cadastro.
- A validação preserva os caracteres aceitos pelo fluxo Bedrock legado: letras, números, sublinhado, ponto e espaço interno, até 32 caracteres.
