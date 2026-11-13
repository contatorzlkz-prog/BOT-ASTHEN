import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { addKit, getGuildConfig, getTicket, removeKit, updateGuildConfig } from './store.js';
import {
  makeChannelLinkRow,
  makeCloseRow,
  makeKitWizardEmbed,
  makeMissingPixEmbed,
  makeOrderEmbed,
  makePixEmbed,
  makeShopPanel,
  makeSupportPanel,
  makeSupportTicketEmbed,
  makeWizardButton
} from './ui.js';
import { archiveAndDeleteTicket, createPrivateTicket } from './tickets.js';
import { CONFIG } from './config.js';

const kitWizards = new Map();
const supportTitles = {
  bug: 'Reporte de bug',
  hack: 'Denúncia de hack',
  duvida: 'Dúvida',
  geral: 'Atendimento geral'
};

function canManage(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);
}

function isStaff(interaction, config = getGuildConfig(interaction.guildId)) {
  if (canManage(interaction)) return true;
  return Boolean(config.staffRoleId && interaction.member?.roles?.cache?.has?.(config.staffRoleId));
}

function replyPrivate(interaction, content, components = []) {
  const payload = { content, components, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function syncShopPanel(guild, config = getGuildConfig(guild.id)) {
  if (!config.shopPanelChannelId || !config.shopPanelMessageId) return false;
  const channel = guild.channels.cache.get(config.shopPanelChannelId)
    ?? await guild.channels.fetch(config.shopPanelChannelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  const message = await channel.messages.fetch(config.shopPanelMessageId).catch(() => null);
  if (!message) return false;
  await message.edit(makeShopPanel(config.kits));
  return true;
}

async function configurePanel(interaction) {
  if (!canManage(interaction)) {
    return replyPrivate(interaction, 'Você precisa da permissão Gerenciar servidor para configurar os painéis.');
  }

  const kind = interaction.options.getString('tipo', true);
  const channel = interaction.options.getChannel('canal', true);
  const role = interaction.options.getRole('equipe');
  if (!channel?.isTextBased()) return replyPrivate(interaction, 'Escolha um canal de texto.');

  const config = getGuildConfig(interaction.guildId);
  const isShop = kind === 'loja';
  const channelKey = isShop ? 'shopPanelChannelId' : 'supportPanelChannelId';
  const messageKey = isShop ? 'shopPanelMessageId' : 'supportPanelMessageId';
  const categoryKey = isShop ? 'shopCategoryId' : 'supportCategoryId';
  const previousChannelId = config[channelKey];
  const previousMessageId = config[messageKey];
  let message = null;

  if (previousChannelId === channel.id && previousMessageId) {
    const oldMessage = await channel.messages.fetch(previousMessageId).catch(() => null);
    if (oldMessage) {
      await oldMessage.edit(isShop ? makeShopPanel(config.kits) : makeSupportPanel());
      message = oldMessage;
    }
  }

  if (!message) {
    if (previousChannelId && previousMessageId) {
      const oldChannel = interaction.guild.channels.cache.get(previousChannelId)
        ?? await interaction.guild.channels.fetch(previousChannelId).catch(() => null);
      const oldMessage = oldChannel?.isTextBased()
        ? await oldChannel.messages.fetch(previousMessageId).catch(() => null)
        : null;
      if (oldMessage) await oldMessage.delete().catch(() => {});
    }
    message = await channel.send(isShop ? makeShopPanel(config.kits) : makeSupportPanel());
  }

  const changes = {
    [channelKey]: channel.id,
    [messageKey]: message.id,
    [categoryKey]: channel.parentId ?? null
  };
  if (role) changes.staffRoleId = role.id;
  updateGuildConfig(interaction.guildId, changes);

  const roleLine = role
    ? `Equipe: ${role}.`
    : config.staffRoleId
      ? `Equipe atual: <@&${config.staffRoleId}>.`
      : 'Sem cargo de equipe definido: somente administradores do servidor verão os tickets.';
  return replyPrivate(interaction, `${isShop ? 'Loja' : 'Suporte'} configurado em ${channel}. ${roleLine}`);
}

async function configurePix(interaction) {
  if (!canManage(interaction)) {
    return replyPrivate(interaction, 'Você precisa da permissão Gerenciar servidor para alterar o Pix.');
  }
  const pixKey = interaction.options.getString('chave', true).trim();
  const pixInstructions = interaction.options.getString('instrucoes')?.trim() ?? '';
  updateGuildConfig(interaction.guildId, { pixKey, pixInstructions });
  return replyPrivate(interaction, 'Dados Pix salvos. Eles serão exibidos nos próximos pedidos.');
}

function makeFieldModal(field) {
  const options = {
    name: { title: 'Nome do kit', label: 'Nome', placeholder: 'Ex.: Kit Demo Premium', max: 60, customId: 'name' },
    price: { title: 'Preço do kit', label: 'Preço', placeholder: 'Ex.: R$ 9,90', max: 30, customId: 'price' },
    description: { title: 'Descrição do kit', label: 'Descrição', placeholder: 'O que vem neste kit?', max: 180, customId: 'description' }
  };
  const item = options[field];
  const input = new TextInputBuilder()
    .setCustomId(item.customId)
    .setLabel(item.label)
    .setPlaceholder(item.placeholder)
    .setStyle(field === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(item.max)
    .setRequired(true);
  if (field !== 'description') input.setMinLength(2);

  return new ModalBuilder()
    .setCustomId(`kit:field:${field}`)
    .setTitle(item.title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function startKitWizard(interaction) {
  if (!canManage(interaction)) return replyPrivate(interaction, 'Você não tem permissão para cadastrar kits.');
  const config = getGuildConfig(interaction.guildId);
  if (config.kits.length >= CONFIG.shop.maxKits) {
    return replyPrivate(interaction, `A loja já tem ${CONFIG.shop.maxKits} kits. Remova um antes de adicionar outro.`);
  }
  const wizard = {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    name: '',
    price: '',
    description: ''
  };
  kitWizards.set(interaction.user.id, wizard);
  return interaction.showModal(makeFieldModal('name'));
}

function wizardStage(wizard, nextField) {
  const labels = {
    price: ['Preço definido. Agora informe o valor do kit.', 'Definir preço'],
    description: ['Preço salvo. Agora descreva o que vem no kit.', 'Definir descrição']
  };
  const [content, label] = labels[nextField];
  return {
    content,
    embeds: [makeKitWizardEmbed(wizard)],
    components: [new ActionRowBuilder().addComponents(makeWizardButton(`kit:wizard:${nextField}`, label))],
    ephemeral: true
  };
}

async function handleKitField(interaction) {
  const field = interaction.customId.split(':')[2];
  const wizard = kitWizards.get(interaction.user.id);
  if (!wizard || wizard.guildId !== interaction.guildId) {
    return replyPrivate(interaction, 'Este cadastro expirou. Use /kit adicionar para começar de novo.');
  }

  const value = interaction.fields.getTextInputValue(field).trim();
  if (value.length < 2) return replyPrivate(interaction, 'O campo precisa ter pelo menos 2 caracteres.');
  wizard[field] = value;

  if (field === 'name') {
    return interaction.reply({
      content: 'Nome salvo. Agora informe o preço.',
      embeds: [makeKitWizardEmbed(wizard)],
      components: [new ActionRowBuilder().addComponents(makeWizardButton('kit:wizard:price', 'Definir preço'))],
      ephemeral: true
    });
  }
  if (field === 'price') return interaction.reply(wizardStage(wizard, 'description'));

  return interaction.reply({
    content: 'Confira os dados e salve o kit.',
    embeds: [makeKitWizardEmbed(wizard)],
    components: [new ActionRowBuilder().addComponents(
      makeWizardButton('kit:wizard:save', 'Salvar kit', ButtonStyle.Success),
      makeWizardButton('kit:wizard:cancel', 'Cancelar', ButtonStyle.Danger)
    )],
    ephemeral: true
  });
}

async function handleKitWizardButton(interaction) {
  const action = interaction.customId.split(':')[2];
  const wizard = kitWizards.get(interaction.user.id);
  if (!wizard || wizard.guildId !== interaction.guildId) {
    return replyPrivate(interaction, 'Este cadastro expirou. Use /kit adicionar para começar de novo.');
  }

  if (action === 'price' || action === 'description') {
    return interaction.showModal(makeFieldModal(action));
  }
  if (action === 'cancel') {
    kitWizards.delete(interaction.user.id);
    return interaction.update({ content: 'Cadastro cancelado.', embeds: [], components: [] });
  }
  if (action === 'save') {
    const config = getGuildConfig(interaction.guildId);
    if (config.kits.length >= CONFIG.shop.maxKits) {
      kitWizards.delete(interaction.user.id);
      return interaction.update({ content: 'A loja atingiu o limite de kits. Remova um e comece novamente.', embeds: [], components: [] });
    }
    if (config.kits.some(kit => kit.name.toLocaleLowerCase('pt-BR') === wizard.name.toLocaleLowerCase('pt-BR'))) {
      return interaction.reply({ content: 'Já existe um kit com esse nome. Cancele e comece novamente com outro nome.', ephemeral: true });
    }
    const kit = { id: randomUUID().slice(0, 10), name: wizard.name, price: wizard.price, description: wizard.description };
    addKit(interaction.guildId, kit);
    kitWizards.delete(interaction.user.id);
    await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
    return interaction.update({ content: `Kit **${kit.name}** adicionado à loja.`, embeds: [], components: [] });
  }
}

async function handleKitCommand(interaction) {
  if (!canManage(interaction)) return replyPrivate(interaction, 'Você não tem permissão para gerenciar os kits.');
  const subcommand = interaction.options.getSubcommand();
  const config = getGuildConfig(interaction.guildId);

  if (subcommand === 'adicionar') return startKitWizard(interaction);
  if (subcommand === 'listar') {
    if (!config.kits.length) return replyPrivate(interaction, 'A loja está vazia.');
    const lines = config.kits.map((kit, index) => `${index + 1}. **${kit.name}** — ${kit.price}\n${kit.description}`);
    return replyPrivate(interaction, lines.join('\n\n').slice(0, 1900));
  }

  const wanted = interaction.options.getString('nome', true).trim().toLocaleLowerCase('pt-BR');
  const kit = config.kits.find(item => item.name.toLocaleLowerCase('pt-BR') === wanted);
  if (!kit) return replyPrivate(interaction, 'Não encontrei um kit com esse nome.');
  removeKit(interaction.guildId, kit.id);
  await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
  return replyPrivate(interaction, `Kit **${kit.name}** removido da loja.`);
}

async function openSupportTicket(interaction, kind) {
  if (!supportTitles[kind]) return replyPrivate(interaction, 'Tipo de atendimento inválido.');
  await interaction.deferReply({ ephemeral: true });
  const result = await createPrivateTicket({ guild: interaction.guild, user: interaction.user, type: kind });
  if (!result.alreadyOpen) {
    const config = getGuildConfig(interaction.guildId);
    const staffMention = config.staffRoleId ? `<@&${config.staffRoleId}>` : '';
    await result.channel.send({
      content: `${interaction.user} ${staffMention}`.trim(),
      embeds: [makeSupportTicketEmbed(kind, interaction.user)],
      components: [makeCloseRow()],
      allowedMentions: { users: [interaction.user.id], roles: config.staffRoleId ? [config.staffRoleId] : [] }
    });
  }
  return interaction.editReply({
    content: result.alreadyOpen ? 'Você já tem um atendimento aberto.' : 'Atendimento aberto.',
    components: [makeChannelLinkRow(result.channel)]
  });
}

async function openShopTicket(interaction, kitId) {
  const config = getGuildConfig(interaction.guildId);
  const kit = config.kits.find(item => item.id === kitId);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais disponível. Atualize o painel da loja.');

  await interaction.deferReply({ ephemeral: true });
  const result = await createPrivateTicket({ guild: interaction.guild, user: interaction.user, type: 'shop', kit });
  if (!result.alreadyOpen) {
    const orderCode = result.channel.id.slice(-6).toUpperCase();
    const staffMention = config.staffRoleId ? `<@&${config.staffRoleId}>` : '';
    await result.channel.send({
      content: `${interaction.user} ${staffMention}`.trim(),
      embeds: [makeOrderEmbed({ user: interaction.user, kit, orderCode }), config.pixKey ? makePixEmbed(config) : makeMissingPixEmbed()],
      components: [makeCloseRow()],
      allowedMentions: { users: [interaction.user.id], roles: config.staffRoleId ? [config.staffRoleId] : [] }
    });
  }
  return interaction.editReply({
    content: result.alreadyOpen ? 'Você já tem um pedido aberto.' : 'Pedido criado. Envie o comprovante no canal privado.',
    components: [makeChannelLinkRow(result.channel)]
  });
}

async function closeTicket(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyPrivate(interaction, 'Este canal não está registrado como ticket.');
  const config = getGuildConfig(interaction.guildId);
  const isOwner = interaction.user.id === ticket.userId;
  if (!isOwner && !isStaff(interaction, config)) {
    return replyPrivate(interaction, 'Somente quem abriu o ticket ou a equipe pode fechá-lo.');
  }
  if (ticket.status !== 'open') return replyPrivate(interaction, 'Este ticket já está sendo fechado.');

  await interaction.reply({ content: 'Este canal será excluído em 3 segundos.', ephemeral: true });
  await interaction.channel.send(`Ticket fechado por ${interaction.user}. O canal será excluído em 3 segundos.`);
  await archiveAndDeleteTicket({ channel: interaction.channel, ticket, closedById: interaction.user.id });
}

async function handleCommand(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, 'Use este comando dentro de um servidor.');
  if (interaction.commandName === 'configurar') return configurePanel(interaction);
  if (interaction.commandName === 'pix') return configurePix(interaction);
  if (interaction.commandName === 'kit') return handleKitCommand(interaction);
}

export async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) return handleCommand(interaction);

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('support:open:')) {
      return openSupportTicket(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:buy:')) {
      return openShopTicket(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId === 'ticket:close') return closeTicket(interaction);
    if (interaction.customId.startsWith('kit:wizard:')) return handleKitWizardButton(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('kit:field:')) {
    return handleKitField(interaction);
  }
}
