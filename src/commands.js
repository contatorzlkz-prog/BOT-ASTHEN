import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const administratorOnly = command => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const commandDefinitions = [
  administratorOnly(new SlashCommandBuilder()
    .setName('kit')
    .setDescription('Gerencia a apresentação dos kits sincronizados do Minecraft.')
    .addSubcommand(subcommand => subcommand
      .setName('configurar')
      .setDescription('Abre o painel para editar nome, descrição e imagem dos kits.'))),

  administratorOnly(new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Ferramentas administrativas essenciais do ASTHEN.')
    .addSubcommandGroup(group => group
      .setName('videos')
      .setDescription('Publicações no canal de vídeos.')
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
          .setDescription('Imagem opcional para a capa da publicação.')
          .setRequired(false))))
    .addSubcommandGroup(group => group
      .setName('backup')
      .setDescription('Consulta e cria cópias de segurança.')
      .addSubcommand(subcommand => subcommand
        .setName('status')
        .setDescription('Lista os backups e verifica a integridade.'))
      .addSubcommand(subcommand => subcommand
        .setName('criar')
        .setDescription('Cria um backup manual agora.')))
    .addSubcommandGroup(group => group
      .setName('minecraft')
      .setDescription('Diagnóstico da integração com o servidor Minecraft.')
      .addSubcommand(subcommand => subcommand
        .setName('status')
        .setDescription('Verifica API, plugin, fila, kits e Supabase.'))))
];
