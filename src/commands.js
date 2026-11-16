import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const adminOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const administratorOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const textChannel = option => option
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(false);

export const commandDefinitions = [
  adminOnly(new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Configura os canais e o cargo da equipe.')
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
    .addRoleOption(option => option
      .setName('equipe')
      .setDescription('Cargo autorizado a revisar pagamentos e fechar tickets.')
      .setRequired(false))),

  administratorOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Lista e edita os kits sincronizados do Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Lista os kits recebidos automaticamente do Minecraft.'))
    .addSubcommand(subcommand => subcommand
      .setName('editar')
      .setDescription('Altera nome exibido, descrição ou imagem de um kit.'))),

  adminOnly(new SlashCommandBuilder()
    .setName('bridge')
    .setDescription('Verifica a API de integração Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('status')
      .setDescription('Mostra o estado da API e a última sincronização.')))
];
