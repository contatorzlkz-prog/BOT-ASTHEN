import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const adminOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const textChannel = option => option
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(false);

export const commandDefinitions = [
  adminOnly(new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Define os canais do suporte, loja e atendimento.')
    .addChannelOption(option => textChannel(option
      .setName('suporte')
      .setDescription('Canal que receberá o painel de suporte.')))
    .addChannelOption(option => textChannel(option
      .setName('loja')
      .setDescription('Canal que receberá o painel da loja.')))
    .addChannelOption(option => textChannel(option
      .setName('logs')
      .setDescription('Canal privado para decisões e registros dos pedidos.')))
    .addChannelOption(option => textChannel(option
      .setName('compradores')
      .setDescription('Canal público para anunciar compras aprovadas.')))
    .addRoleOption(option => option
      .setName('equipe')
      .setDescription('Cargo autorizado a atender e revisar pedidos.')
      .setRequired(false))),

  adminOnly(new SlashCommandBuilder()
    .setName('pix')
    .setDescription('Configura os dados de pagamento da loja.')
    .addStringOption(option => option
      .setName('chave')
      .setDescription('Chave Pix que será exibida no pedido.')
      .setMaxLength(120)
      .setRequired(true))
    .addStringOption(option => option
      .setName('instrucoes')
      .setDescription('Orientações para o cliente após o pagamento.')
      .setMaxLength(500)
      .setRequired(false))),

  adminOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Gerencia os kits disponíveis na loja.')
    .addSubcommand(subcommand => subcommand
      .setName('adicionar')
      .setDescription('Abre o cadastro guiado de um kit.'))
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Lista os kits cadastrados.'))
    .addSubcommand(subcommand => subcommand
      .setName('remover')
      .setDescription('Remove um kit pelo nome.')
      .addStringOption(option => option
        .setName('nome')
        .setDescription('Nome do kit que será removido.')
        .setMaxLength(80)
        .setRequired(true))))
];
