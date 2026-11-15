import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const adminOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const textChannel = option => option
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(false);

export const commandDefinitions = [
  adminOnly(new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Configura os canais e o cargo da equipe.')
    .addChannelOption(option => textChannel(option
      .setName('suporte')
      .setDescription('Canal do painel de atendimento.')))
    .addChannelOption(option => textChannel(option
      .setName('loja')
      .setDescription('Canal do painel para escolher kits.')))
    .addChannelOption(option => textChannel(option
      .setName('logs')
      .setDescription('Canal privado de registros administrativos.')))
    .addChannelOption(option => textChannel(option
      .setName('compradores')
      .setDescription('Canal de avisos de compras confirmadas.')))
    .addRoleOption(option => option
      .setName('equipe')
      .setDescription('Cargo autorizado a revisar pagamentos e fechar tickets.')
      .setRequired(false))),

  adminOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Gerencia os kits sincronizados com o Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Lista os kits recebidos do plugin.'))
    .addSubcommand(subcommand => subcommand
      .setName('editar')
      .setDescription('Escolhe um kit e o campo que deseja alterar.'))
    .addSubcommand(subcommand => subcommand
      .setName('remover')
      .setDescription('Marca o kit como indisponível sem apagar seu registro.'))),

  adminOnly(new SlashCommandBuilder()
    .setName('bridge')
    .setDescription('Verifica a API de integração Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('status')
      .setDescription('Mostra o estado da API e a última sincronização.')))
];
