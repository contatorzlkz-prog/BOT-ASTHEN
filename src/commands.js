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

  administratorOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Administra os kits que o plugin disponibiliza na loja.')
    .addSubcommand(subcommand => subcommand
      .setName('criar')
      .setDescription('Cadastrar na loja um kit já criado no Minecraft.'))
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Lista os kits recebidos do plugin e seu estado na loja.'))
    .addSubcommand(subcommand => subcommand
      .setName('editar')
      .setDescription('Altera nome, preço, descrição, imagem ou disponibilidade.'))
    .addSubcommand(subcommand => subcommand
      .setName('remover')
      .setDescription('Marca um kit como indisponível sem apagar seu cadastro.'))),

  adminOnly(new SlashCommandBuilder()
    .setName('bridge')
    .setDescription('Verifica a API de integração Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('status')
      .setDescription('Mostra o estado da API e a última sincronização.')))
];
