import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const adminOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const administratorOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const textChannel = option => option
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(false);

export const commandDefinitions = [
  adminOnly(new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Configura canais, painéis e cargos principais do ASTHEN.')
    .addChannelOption(option => textChannel(option
      .setName('atendimento')
      .setDescription('Canal do painel de suporte.')))
    .addChannelOption(option => textChannel(option
      .setName('kits')
      .setDescription('Canal do painel da loja.')))
    .addChannelOption(option => textChannel(option
      .setName('logs')
      .setDescription('Canal privado de registros.')))
    .addChannelOption(option => textChannel(option
      .setName('compradores')
      .setDescription('Canal de avisos de compras.')))
    .addChannelOption(option => textChannel(option
      .setName('registro')
      .setDescription('Canal para o registro Minecraft.')))
    .addRoleOption(option => option
      .setName('membro')
      .setDescription('Cargo concedido após o registro Minecraft.'))
    .addRoleOption(option => option
      .setName('equipe')
      .setDescription('Cargo principal de atendimento e moderação.'))),

  administratorOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Configura o catálogo de kits sincronizado com o Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('configurar')
      .setDescription('Abre o painel para editar nome, descrição e imagem dos kits.'))),

  administratorOnly(new SlashCommandBuilder()
    .setName('outros')
    .setDescription('Ferramentas administrativas do ASTHEN.')
    .addSubcommandGroup(group => group
      .setName('seguranca')
      .setDescription('Analisa e aplica a política de cargos e canais.')
      .addSubcommand(subcommand => subcommand
        .setName('analisar')
        .setDescription('Mostra os cargos e canais que serão protegidos.'))
      .addSubcommand(subcommand => subcommand
        .setName('aplicar')
        .setDescription('Aplica a política e inicia novo registro para todos.')
        .addRoleOption(option => option
          .setName('membro')
          .setDescription('Selecione o cargo Membro usado no servidor.')
          .setRequired(true))
        .addBooleanOption(option => option
          .setName('confirmar')
          .setDescription('Confirma remover Membro de todos e exigir novo registro.')
          .setRequired(true))))
    .addSubcommandGroup(group => group
      .setName('tiktok')
      .setDescription('Publicações do canal de vídeos.')
      .addSubcommand(subcommand => subcommand
        .setName('publicar')
        .setDescription('Publica um vídeo no canal de novidades.')
        .addStringOption(option => option
          .setName('link')
          .setDescription('Link completo do vídeo no TikTok.')
          .setMaxLength(2048)
          .setRequired(true))
        .addAttachmentOption(option => option
          .setName('frame')
          .setDescription('Imagem opcional de um frame; não usa a capa original.')
          .setRequired(false))))
    .addSubcommandGroup(group => group
      .setName('backup')
      .setDescription('Backups e recuperação do bot.')
      .addSubcommand(subcommand => subcommand
        .setName('status')
        .setDescription('Lista os backups e mostra a situação atual.'))
      .addSubcommand(subcommand => subcommand
        .setName('criar')
        .setDescription('Cria e verifica um backup manual.')))
    .addSubcommandGroup(group => group
      .setName('minecraft')
      .setDescription('Estado da integração com o servidor Minecraft.')
      .addSubcommand(subcommand => subcommand
        .setName('status')
        .setDescription('Mostra API, plugin, fila e sincronização.')))
  )
];
