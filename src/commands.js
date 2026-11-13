import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const adminOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const commandDefinitions = [
  adminOnly(new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Ativa a loja ou o suporte em um canal.')
    .addStringOption(option => option
      .setName('tipo')
      .setDescription('Qual painel deseja publicar?')
      .setRequired(true)
      .addChoices(
        { name: 'Suporte', value: 'suporte' },
        { name: 'Loja', value: 'loja' }
      ))
    .addChannelOption(option => option
      .setName('canal')
      .setDescription('Canal onde o painel ficará.')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .addRoleOption(option => option
      .setName('equipe')
      .setDescription('Cargo que poderá ver e responder aos tickets. Opcional.')
      .setRequired(false))),

  adminOnly(new SlashCommandBuilder()
    .setName('pix')
    .setDescription('Define os dados de pagamento da loja.')
    .addStringOption(option => option
      .setName('chave')
      .setDescription('Chave Pix da loja.')
      .setMaxLength(120)
      .setRequired(true))
    .addStringOption(option => option
      .setName('instrucoes')
      .setDescription('Instrução curta para o cliente (opcional).')
      .setMaxLength(250)
      .setRequired(false))),

  adminOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Gerencia os produtos da loja.')
    .addSubcommand(subcommand => subcommand
      .setName('adicionar')
      .setDescription('Abre o cadastro guiado de um kit.'))
    .addSubcommand(subcommand => subcommand
      .setName('listar')
      .setDescription('Mostra os kits cadastrados.'))
    .addSubcommand(subcommand => subcommand
      .setName('remover')
      .setDescription('Remove um kit pelo nome.')
      .addStringOption(option => option
        .setName('nome')
        .setDescription('Nome exato do kit.')
        .setMaxLength(80)
        .setRequired(true))))
];
