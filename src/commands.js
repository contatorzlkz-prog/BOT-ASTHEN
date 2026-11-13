import { ChannelType, SlashCommandBuilder } from 'discord.js';

const channelOption = (option, description) => option
  .setName('canal')
  .setDescription(description)
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(true);

const categoryOption = option => option
  .setName('canal')
  .setDescription('Categoria do Discord onde os canais privados serão criados.')
  .addChannelTypes(ChannelType.GuildCategory)
  .setRequired(true);

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('asthen')
    .setDescription('Configura e administra a central Asthen.')
    .addSubcommandGroup(group => group
      .setName('painel')
      .setDescription('Publica os painéis da central.')
      .addSubcommand(sub => sub
        .setName('suporte')
        .setDescription('Publica o painel para abrir tickets de suporte.')
        .addChannelOption(option => channelOption(option, 'Canal onde o painel será publicado.')))
      .addSubcommand(sub => sub
        .setName('loja')
        .setDescription('Publica o painel da loja de kits.')
        .addChannelOption(option => channelOption(option, 'Canal onde a loja será publicada.'))))
    .addSubcommandGroup(group => group
      .setName('categoria')
      .setDescription('Define onde os tickets privados serão criados.')
      .addSubcommand(sub => sub
        .setName('suporte')
        .setDescription('Define a categoria dos tickets de suporte.')
        .addChannelOption(categoryOption))
      .addSubcommand(sub => sub
        .setName('loja')
        .setDescription('Define a categoria dos pedidos da loja.')
        .addChannelOption(categoryOption)))
    .addSubcommandGroup(group => group
      .setName('kit')
      .setDescription('Gerencia os kits exibidos na loja.')
      .addSubcommand(sub => sub
        .setName('adicionar')
        .setDescription('Adiciona um kit ao catálogo.')
        .addStringOption(option => option.setName('nome').setDescription('Nome do kit.').setMaxLength(80).setRequired(true))
        .addStringOption(option => option.setName('preco').setDescription('Preço exibido, por exemplo R$ 9,90.').setMaxLength(30).setRequired(true))
        .addStringOption(option => option.setName('descricao').setDescription('Descrição curta do kit.').setMaxLength(100).setRequired(true)))
      .addSubcommand(sub => sub
        .setName('remover')
        .setDescription('Remove um kit do catálogo pelo nome.')
        .addStringOption(option => option.setName('nome').setDescription('Nome exato do kit.').setMaxLength(80).setRequired(true))))
    .addSubcommandGroup(group => group
      .setName('config')
      .setDescription('Configura cargos, pagamento e informações do bot.')
      .addSubcommand(sub => sub
        .setName('cargo-admin')
        .setDescription('Define o cargo que poderá atender e analisar pedidos.')
        .addRoleOption(option => option.setName('cargo').setDescription('Cargo da equipe Asthen.').setRequired(true)))
      .addSubcommand(sub => sub
        .setName('pix')
        .setDescription('Configura a chave Pix enviada dentro dos pedidos privados.')
        .addStringOption(option => option.setName('chave').setDescription('Chave Pix da loja.').setMaxLength(120).setRequired(true))
        .addStringOption(option => option.setName('instrucoes').setDescription('Instruções de pagamento (opcional).').setMaxLength(300).setRequired(false)))
      .addSubcommand(sub => sub
        .setName('logs')
        .setDescription('Define um canal opcional para transcrições dos tickets fechados.')
        .addChannelOption(option => channelOption(option, 'Canal privado para os registros.')))
      .addSubcommand(sub => sub
        .setName('status')
        .setDescription('Mostra o estado da configuração da Asthen.'))
      .addSubcommand(sub => sub
        .setName('ajuda')
        .setDescription('Mostra os comandos e a ordem de configuração.')))
];
