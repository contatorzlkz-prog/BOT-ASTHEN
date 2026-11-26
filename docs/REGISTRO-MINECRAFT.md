# Registro Minecraft — ASTHEN BOT 2.22.0

## Modelo de acesso

O cargo `Membro` significa que a pessoa já concluiu o registro Minecraft. Não atribua esse cargo pelo Onboarding nem manualmente.

- `@everyone`: pode visualizar somente o canal de registro na área de entrada.
- `Membro`: pode visualizar os canais exclusivos de jogadores registrados, mas não pode visualizar o canal de registro.
- Equipe e administradores: mantenha os acessos administrativos necessários; eles podem continuar vendo o canal de registro como exceção.

## Configuração no Discord

1. Crie a categoria `👋 Entrada`, caso ainda não exista.
2. Dentro dela, crie o canal de texto `📝・registro`.
3. Crie ou selecione o cargo `Membro`.
4. Em Developer Portal → Bot → Privileged Gateway Intents, ative **Server Members Intent**.
5. Dê ao bot **Manage Roles**, **Manage Nicknames**, **Manage Channels**, **View Channels**, **Send Messages** e **Read Message History**.
6. Posicione o cargo do bot acima de `Membro` e dos cargos comuns que ele precisa administrar; mantenha-o abaixo dos cargos administrativos.
7. Execute `/configurar registro:#📝・registro membro:@Membro`, selecionando o canal e o cargo nos campos do comando.

### Permissões do canal de registro

O comando de configuração deixa `@everyone` ver o canal, bloqueia o envio de mensagens e impede que `Membro` veja o canal. O bot publica ou atualiza o painel com o botão **Registrar Minecraft**. Não conceda permissão para enviar mensagens a `@everyone`; o cadastro é enviado por formulário.

### Permissões dos canais de membros

Em cada categoria/canal que só deve aparecer depois do registro:

- `@everyone`: **View Channel** = Deny.
- `Membro`: **View Channel** = Allow.

Use a permissão na categoria quando todos os canais dentro dela seguirem a mesma regra. Não aplique a regra aos canais públicos, à equipe, aos logs, ao suporte ou a outros canais que devam continuar acessíveis antes do registro.

## Fluxo do jogador

1. O novo membro entra e permanece apenas com `@everyone` e os demais cargos automáticos que não liberem canais privados.
2. Ele abre `#📝・registro` e envia o nick Bedrock no formulário.
3. O bot salva o vínculo pelo ID do Discord, sincroniza o apelido e atribui `Membro`.
4. O Discord libera os canais configurados para `Membro` e oculta o canal de registro para esse jogador.
5. Se não conseguir atribuir o cargo ou atualizar o apelido, o bot registra a pendência no canal de logs; o cadastro não é descartado.

## Reset geral — exigir novo cadastro de todos

Use `/registro reiniciar confirmar:true` como administrador.

O reset:
- remove `Membro` de todos os membros que o bot consegue gerenciar;
- limpa os vínculos Minecraft deste servidor no snapshot existente do Supabase/local;
- remove as sobrescritas individuais antigas do canal de registro;
- não remove outros cargos, não altera apelidos e não cria nem apaga canais.

A confirmação é obrigatória. O bot precisa estar acima de `Membro` na hierarquia e ter **Manage Roles**. A conta proprietária do servidor é protegida pelo Discord e pode exigir remoção manual do cargo. Se o Discord bloquear a remoção de algum outro membro, os cadastros são preservados para não serem parcialmente perdidos; corrija a hierarquia e execute novamente.

## Comandos

- `/conta perfil`: consulta o nick Minecraft vinculado.
- `/conta atualizar-nick`: abre o formulário para atualizar o nick.
- `/registro atualizar jogador:@Jogador nick:NickNovo`: atualização administrativa.
- `/registro autorizar cargo:@Equipe` e `/registro revogar cargo:@Equipe`: controlam exceções para visualizar o canal de registro.

## Supabase

Não execute migração nem crie outra tabela. Os jogadores ficam em `payload.players` na tabela `asthen_bot_state`, com `discord_id`, `minecraft_nick`, `created_at`, `updated_at` e `guild_id` quando conhecido. A chave secreta existente continua sendo usada apenas no backend.

## Validação

A validação preserva os caracteres aceitos pelo fluxo Bedrock legado: letras, números, sublinhado, ponto e espaço interno, até 32 caracteres.
