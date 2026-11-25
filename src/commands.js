import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const adminOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const administratorOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const textChannel = option => option
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(false);

export const commandDefinitions = [
  adminOnly(new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Configura os canais e os cargos do ASTHEN.')
    .addChannelOption(option => textChannel(option
      .setName('atendimento')
      .setDescription('Canal com o painel de atendimento.')))
    .addChannelOption(option => textChannel(option
      .setName('kits')
      .setDescription('Canal com o painel da loja de kits.')))
    .addChannelOption(option => textChannel(option
      .setName('logs')
      .setDescription('Canal privado de registros administrativos.')))
    .addChannelOption(option => textChannel(option
      .setName('compradores')
      .setDescription('Canal de avisos de compras confirmadas.')))
    .addChannelOption(option => textChannel(option
      .setName('registro')
      .setDescription('Canal público para o registro Minecraft.')))
    .addRoleOption(option => option
      .setName('membro')
      .setDescription('Cargo concedido após o registro Minecraft.')
      .setRequired(false))
    .addRoleOption(option => option
      .setName('equipe')
      .setDescription('Cargo autorizado a revisar pagamentos e fechar tickets.')
      .setRequired(false))),

  adminOnly(new SlashCommandBuilder()
    .setName('registro')
    .setDescription('Gerencia cargos autorizados e cadastros Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('autorizar')
      .setDescription('Permite que um cargo veja #registro mesmo após registrar.')
      .addRoleOption(option => option.setName('cargo').setDescription('Cargo autorizado.').setRequired(true)))
    .addSubcommand(subcommand => subcommand
      .setName('revogar')
      .setDescription('Remove a autorização de um cargo.')
      .addRoleOption(option => option.setName('cargo').setDescription('Cargo que perderá a autorização.').setRequired(true)))
    .addSubcommand(subcommand => subcommand
      .setName('atualizar')
      .setDescription('Atualiza o nick Minecraft de um jogador.')
      .addUserOption(option => option.setName('jogador').setDescription('Jogador que será atualizado.').setRequired(true))
      .addStringOption(option => option.setName('nick').setDescription('Novo nick Minecraft.').setMinLength(1).setMaxLength(32).setRequired(true)))),

  new SlashCommandBuilder()
    .setName('conta')
    .setDescription('Gerencia sua identificação Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('perfil')
      .setDescription('Consulta o nick Minecraft vinculado à sua conta.'))
    .addSubcommand(subcommand => subcommand
      .setName('atualizar-nick')
      .setDescription('Atualiza seu nick Minecraft cadastrado.')),

  administratorOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Lista e edita os kits sincronizados do Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Lista os kits recebidos automaticamente do Minecraft.'))
    .addSubcommand(subcommand => subcommand
      .setName('editar')
      .setDescription('Altera nome exibido, descrição ou imagem de um kit.'))),

  administratorOnly(new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Cria e consulta backups protegidos do ASTHEN.')
    .addSubcommand(subcommand => subcommand
      .setName('status')
      .setDescription('Mostra os backups disponíveis e o último backup.'))
    .addSubcommand(subcommand => subcommand
      .setName('criar')
      .setDescription('Cria um backup manual agora.'))
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Lista os últimos backups disponíveis.'))),

  adminOnly(new SlashCommandBuilder()
    .setName('bridge')
    .setDescription('Verifica a API de integração Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('status')
      .setDescription('Mostra o estado da API e a última sincronização.')))
];
