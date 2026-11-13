import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import {
  addKit,
  deletePurchaseDraft,
  findOpenTicket,
  getGuildConfig,
  getPurchaseDraft,
  getTicket,
  removeKit,
  savePurchaseDraft,
  updateGuildConfig,
  updateTicket
} from './store.js';
import {
  makeBuyerAnnouncement,
  makeCatalogMenu,
  makeChannelLinkRow,
  makeCloseRow,
  makeKitWizardEmbed,
  makeMissingPixEmbed,
  makeOrderControls,
  makeOrderEmbed,
  makeOrderLogEmbed,
  makePixEmbed,
  makePurchaseReviewControls,
  makePurchaseReviewEmbed,
  makeShopPanel,
  makeSupportPanel,
  makeSupportTicketEmbed,
  makeWizardButton
} from './ui.js';
import { archiveAndDeleteTicket, createPrivateTicket } from './tickets.js';
import { CONFIG } from './config.js';

const kitWizards = new Map();

function canManage(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);
}

function isStaff(interaction, config = getGuildConfig(interaction.guildId)) {
  if (canManage(interaction)) return true;
  return Boolean(config.staffRoleId && interaction.member?.roles?.cache?.has?.(config.staffRoleId));
}

function replyPrivate(interaction, content, components = [], embeds = []) {
  const payload = { content, components, embeds, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId)
    ?? await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased() && typeof channel.send === 'function' ? channel : null;
}

async function updatePanel(guild, config, kind, channel) {
  const isShop = kind === 'shop';
  const channelKey = isShop ? 'shopPanelChannelId' : 'supportPanelChannelId';
  const messageKey = isShop ? 'shopPanelMessageId' : 'supportPanelMessageId';
  const oldChannelId = config[channelKey];
  const oldMessageId = config[messageKey];
  const payload = isShop ? makeShopPanel(config.kits) : makeSupportPanel();
  let message = null;

  if (oldChannelId === channel.id && oldMessageId) {
    message = await channel.messages.fetch(oldMessageId).catch(() => null);
    if (message) await message.edit(payload);
  }

  if (!message) {
    if (oldChannelId && oldMessageId) {
      const oldChannel = await fetchTextChannel(guild, oldChannelId);
      const oldMessage = oldChannel
        ? await oldChannel.messages.fetch(oldMessageId).catch(() => null)
        : null;
      if (oldMessage) await oldMessage.delete().catch(() => {});
    }
    message = await channel.send(payload);
  }

  return {
    [channelKey]: channel.id,
    [messageKey]: message.id
  };
}

async function secureLogsChannel(channel, guild, staffRoleId, previousStaffRoleId = null) {
  const everyoneId = guild.roles.everyone.id;
  await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });

  if (previousStaffRoleId && previousStaffRoleId !== staffRoleId && guild.roles.cache.has(previousStaffRoleId)) {
    await channel.permissionOverwrites.edit(previousStaffRoleId, { ViewChannel: false });
  }

  if (staffRoleId && guild.roles.cache.has(staffRoleId)) {
    await channel.permissionOverwrites.edit(staffRoleId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      EmbedLinks: true
    });
  }

  if (guild.members.me) {
    await channel.permissionOverwrites.edit(guild.members.me.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      EmbedLinks: true
    });
  }
}

async function configureChannels(interaction) {
  if (!canManage(interaction)) {
    return replyPrivate(interaction, 'Você precisa da permissão Gerenciar servidor para configurar os canais.');
  }

  const supportChannel = interaction.options.getChannel('suporte');
  const shopChannel = interaction.options.getChannel('loja');
  const logsChannel = interaction.options.getChannel('logs');
  const buyersChannel = interaction.options.getChannel('compradores');
  const staffRole = interaction.options.getRole('equipe');

  if (!supportChannel && !shopChannel && !logsChannel && !buyersChannel && !staffRole) {
    return replyPrivate(
      interaction,
      'Informe pelo menos um campo. Exemplo: /configurar suporte:#suporte loja:#loja logs:#logs compradores:#compradores equipe:@Equipe'
    );
  }

  const config = getGuildConfig(interaction.guildId);
  const changes = {};
  const updated = [];

  if (supportChannel) {
    Object.assign(changes, await updatePanel(interaction.guild, config, 'support', supportChannel));
    updated.push('suporte: ' + supportChannel.toString());
  }

  if (shopChannel) {
    Object.assign(changes, await updatePanel(interaction.guild, config, 'shop', shopChannel));
    updated.push('loja: ' + shopChannel.toString());
  }

  if (staffRole) {
    changes.staffRoleId = staffRole.id;
    updated.push('equipe: ' + staffRole.toString());
  }

  const effectiveStaffRoleId = changes.staffRoleId ?? config.staffRoleId;

  if (logsChannel) {
    changes.logsChannelId = logsChannel.id;
    updated.push('logs privados: ' + logsChannel.toString());
  }

  const effectiveLogsId = changes.logsChannelId ?? config.logsChannelId;
  if ((logsChannel || staffRole) && effectiveLogsId) {
    const targetLogsChannel = logsChannel ?? await fetchTextChannel(interaction.guild, effectiveLogsId);
    if (!targetLogsChannel) {
      return replyPrivate(interaction, 'O canal de logs configurado não existe mais. Escolha outro canal em /configurar logs.');
    }
    await secureLogsChannel(targetLogsChannel, interaction.guild, effectiveStaffRoleId, config.staffRoleId);
  }

  if (buyersChannel) {
    changes.buyersChannelId = buyersChannel.id;
    updated.push('compradores: ' + buyersChannel.toString());
  }

  updateGuildConfig(interaction.guildId, changes);

  return replyPrivate(
    interaction,
    'Configuração atualizada.\n' + updated.map(item => '• ' + item).join('\n') +
    '\n\nOs tickets serão criados na categoria do canal de suporte ou loja correspondente.'
  );
}

async function configurePix(interaction) {
  if (!canManage(interaction)) {
    return replyPrivate(interaction, 'Você precisa da permissão Gerenciar servidor para alterar o Pix.');
  }
  const pixKey = interaction.options.getString('chave', true).trim();
  const pixInstructions = interaction.options.getString('instrucoes')?.trim() ?? '';
  updateGuildConfig(interaction.guildId, { pixKey, pixInstructions });
  return replyPrivate(interaction, 'Dados de pagamento salvos. Eles serão exibidos nos próximos pedidos.');
}

function makeKitFieldModal(field) {
  const options = {
    name: { title: 'Nome do kit', label: 'Nome', placeholder: 'Ex.: Kit Demo Premium', max: 60 },
    price: { title: 'Preço do kit', label: 'Preço', placeholder: 'Ex.: R$ 9,90', max: 30 },
    description: { title: 'Descrição do kit', label: 'Descrição', placeholder: 'O que vem neste kit?', max: 180 }
  };
  const item = options[field];
  const input = new TextInputBuilder()
    .setCustomId(field)
    .setLabel(item.label)
    .setPlaceholder(item.placeholder)
    .setStyle(field === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(item.max)
    .setMinLength(2)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId('kit:field:' + field)
    .setTitle(item.title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function startKitWizard(interaction) {
  if (!canManage(interaction)) return replyPrivate(interaction, 'Você não tem permissão para cadastrar kits.');
  const config = getGuildConfig(interaction.guildId);
  if (config.kits.length >= CONFIG.shop.maxKits) {
    return replyPrivate(interaction, 'A loja já atingiu o limite de ' + CONFIG.shop.maxKits + ' kits.');
  }

  kitWizards.set(interaction.user.id, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    name: '',
    price: '',
    description: ''
  });
  return interaction.showModal(makeKitFieldModal('name'));
}

function wizardStage(wizard, nextField) {
  const content = nextField === 'price'
    ? 'Nome salvo. Agora informe o preço.'
    : 'Preço salvo. Agora descreva o que vem no kit.';
  const label = nextField === 'price' ? 'Definir preço' : 'Definir descrição';
  return {
    content,
    embeds: [makeKitWizardEmbed(wizard)],
    components: [new ActionRowBuilder().addComponents(makeWizardButton('kit:wizard:' + nextField, label))],
    ephemeral: true
  };
}

async function handleKitField(interaction) {
  const field = interaction.customId.split(':')[2];
  const wizard = kitWizards.get(interaction.user.id);
  if (!wizard || wizard.guildId !== interaction.guildId) {
    return replyPrivate(interaction, 'Este cadastro expirou. Use /kit adicionar para começar novamente.');
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
    return replyPrivate(interaction, 'Este cadastro expirou. Use /kit adicionar para começar novamente.');
  }

  if (action === 'price' || action === 'description') {
    return interaction.showModal(makeKitFieldModal(action));
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
      return replyPrivate(interaction, 'Já existe um kit com esse nome. Cancele e use outro nome.');
    }

    const kit = {
      id: randomUUID().slice(0, 10),
      name: wizard.name,
      price: wizard.price,
      description: wizard.description
    };
    addKit(interaction.guildId, kit);
    kitWizards.delete(interaction.user.id);
    await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
    return interaction.update({ content: 'Kit **' + kit.name + '** adicionado à loja.', embeds: [], components: [] });
  }
}

async function syncShopPanel(guild, config = getGuildConfig(guild.id)) {
  if (!config.shopPanelChannelId || !config.shopPanelMessageId) return false;
  const channel = await fetchTextChannel(guild, config.shopPanelChannelId);
  if (!channel) return false;
  const message = await channel.messages.fetch(config.shopPanelMessageId).catch(() => null);
  if (!message) return false;
  await message.edit(makeShopPanel(config.kits));
  return true;
}

async function handleKitCommand(interaction) {
  if (!canManage(interaction)) return replyPrivate(interaction, 'Você não tem permissão para gerenciar os kits.');
  const subcommand = interaction.options.getSubcommand();
  const config = getGuildConfig(interaction.guildId);

  if (subcommand === 'adicionar') return startKitWizard(interaction);

  if (subcommand === 'listar') {
    if (!config.kits.length) return replyPrivate(interaction, 'A loja está vazia.');
    const lines = config.kits.map((kit, index) => (index + 1) + '. **' + kit.name + '** — ' + kit.price + '\n' + kit.description);
    return replyPrivate(interaction, lines.join('\n\n').slice(0, 1900));
  }

  const wanted = interaction.options.getString('nome', true).trim().toLocaleLowerCase('pt-BR');
  const kit = config.kits.find(item => item.name.toLocaleLowerCase('pt-BR') === wanted);
  if (!kit) return replyPrivate(interaction, 'Não encontrei um kit com esse nome.');
  removeKit(interaction.guildId, kit.id);
  await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
  return replyPrivate(interaction, 'Kit **' + kit.name + '** removido da loja.');
}

function makeMinecraftNickModal(customId, currentNick = '') {
  const input = new TextInputBuilder()
    .setCustomId('minecraft-nick')
    .setLabel('Nick que será usado no Minecraft')
    .setPlaceholder('Digite seu nick exatamente como aparece no jogo')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(32)
    .setRequired(true);

  if (currentNick) input.setValue(currentNick);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Nick do Minecraft')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function openCatalog(interaction) {
  const config = getGuildConfig(interaction.guildId);
  if (!config.kits.length) return replyPrivate(interaction, 'A loja está sem kits disponíveis no momento.');

  const existing = findOpenTicket(interaction.guildId, interaction.user.id, 'shop');
  if (existing) {
    const channel = await fetchTextChannel(interaction.guild, existing.channelId);
    if (channel) {
      return interaction.reply({
        content: 'Você já tem um pedido em andamento. Continue a conversa no canal existente.',
        components: [makeChannelLinkRow(channel)],
        ephemeral: true
      });
    }
  }

  const existingDraft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (existingDraft) {
    if (existingDraft.kit && config.kits.some(kit => kit.id === existingDraft.kit.id)) {
      if (existingDraft.stage === 'creating') {
        existingDraft.stage = 'review';
        savePurchaseDraft(interaction.guildId, interaction.user.id, existingDraft);
      }
      const hasNick = Boolean(existingDraft.minecraftNick);
      return interaction.reply({
        content: hasNick
          ? 'Você já iniciou uma compra. Confira os dados e confirme quando estiver tudo certo.'
          : 'Você já escolheu um kit. Continue informando o nick do Minecraft.',
        embeds: hasNick ? [makePurchaseReviewEmbed(existingDraft)] : [],
        components: hasNick
          ? [makePurchaseReviewControls(existingDraft)]
          : [new ActionRowBuilder().addComponents(makeWizardButton('shop:continue', 'Informar nick'))],
        ephemeral: true
      });
    }
    deletePurchaseDraft(interaction.guildId, interaction.user.id);
  }

  return interaction.reply({
    content: CONFIG.shop.catalogPrompt,
    components: [makeCatalogMenu(config.kits)],
    ephemeral: true
  });
}

async function continuePurchase(interaction) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft) return replyPrivate(interaction, 'Não encontrei uma compra em preparação. Abra o catálogo novamente.');
  if (draft.stage === 'creating') {
    return replyPrivate(interaction, 'Seu pedido está sendo criado. Aguarde a confirmação.');
  }
  if (draft.minecraftNick) {
    draft.stage = 'review';
    savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
    return replyPrivate(
      interaction,
      'Confira os dados antes de continuar.',
      [makePurchaseReviewControls(draft)],
      [makePurchaseReviewEmbed(draft)]
    );
  }
  return interaction.showModal(makeMinecraftNickModal('shop:nick:submit'));
}

async function beginPurchaseWithKit(interaction, kitId) {
  const config = getGuildConfig(interaction.guildId);
  const kit = config.kits.find(item => item.id === kitId);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais disponível. Abra o catálogo novamente.');

  const existing = findOpenTicket(interaction.guildId, interaction.user.id, 'shop');
  if (existing) {
    const channel = await fetchTextChannel(interaction.guild, existing.channelId);
    if (channel) {
      return replyPrivate(interaction, 'Você já tem um pedido aberto.', [makeChannelLinkRow(channel)]);
    }
  }

  const draft = {
    kit: {
      id: kit.id,
      name: kit.name,
      price: kit.price,
      description: kit.description
    },
    minecraftNick: '',
    stage: 'nick',
    revision: randomUUID().slice(0, 8)
  };
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return interaction.showModal(makeMinecraftNickModal('shop:nick:submit'));
}

async function handleCatalogSelection(interaction) {
  return beginPurchaseWithKit(interaction, interaction.values[0]);
}

async function handleNickSubmit(interaction) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft) return replyPrivate(interaction, 'Sua compra não está mais em preparação. Abra o catálogo novamente.');

  const minecraftNick = interaction.fields.getTextInputValue('minecraft-nick').trim();
  if (minecraftNick.length < 2 || minecraftNick.length > 32) {
    return replyPrivate(interaction, 'Informe um nick válido, com até 32 caracteres.');
  }

  if (interaction.customId.startsWith('shop:nick:edit:')) {
    const requestedRevision = interaction.customId.split(':')[3];
    if (draft.revision !== requestedRevision) {
      return replyPrivate(interaction, 'Esta etapa da compra já foi atualizada. Use a revisão mais recente.');
    }
  }

  draft.minecraftNick = minecraftNick;
  draft.stage = 'review';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);

  return interaction.reply({
    content: 'Revise os dados antes de continuar.',
    embeds: [makePurchaseReviewEmbed(draft)],
    components: [makePurchaseReviewControls(draft)],
    ephemeral: true
  });
}

async function editMinecraftNick(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft) return replyPrivate(interaction, 'Sua compra não está mais em preparação. Abra o catálogo novamente.');
  if (draft.revision !== requestedRevision) {
    return replyPrivate(interaction, 'Esta revisão do pedido ficou desatualizada. Use os botões da mensagem mais recente.');
  }
  return interaction.showModal(makeMinecraftNickModal('shop:nick:edit:' + draft.revision, draft.minecraftNick));
}

async function cancelPurchase(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision) {
    return replyPrivate(interaction, 'Esta revisão da compra já foi atualizada. Confira a mensagem mais recente.');
  }
  deletePurchaseDraft(interaction.guildId, interaction.user.id);
  return interaction.update({
    content: 'Compra cancelada. Nenhum ticket foi aberto.',
    embeds: [],
    components: []
  });
}

async function confirmPurchase(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (draft && draft.revision !== requestedRevision) {
    return replyPrivate(interaction, 'Esta revisão do pedido ficou desatualizada. Confira a mensagem mais recente.');
  }
  if (!draft || !draft.kit || !draft.minecraftNick) {
    return replyPrivate(interaction, 'Não encontrei uma compra pronta para confirmar. Abra o catálogo e tente novamente.');
  }
  if (draft.stage === 'creating') {
    return replyPrivate(interaction, 'Seu pedido já está sendo criado. Aguarde alguns instantes.');
  }
  if (draft.stage !== 'review') {
    return replyPrivate(interaction, 'Revise os dados do pedido antes de confirmar.');
  }

  const config = getGuildConfig(interaction.guildId);
  const currentKit = config.kits.find(kit => kit.id === draft.kit.id);
  if (!currentKit) {
    deletePurchaseDraft(interaction.guildId, interaction.user.id);
    return replyPrivate(interaction, 'Este kit foi removido da loja. Escolha outro produto.');
  }

  const existing = findOpenTicket(interaction.guildId, interaction.user.id, 'shop');
  if (existing) {
    const channel = await fetchTextChannel(interaction.guild, existing.channelId);
    if (channel) {
      deletePurchaseDraft(interaction.guildId, interaction.user.id);
      return interaction.update({
        content: 'Você já tem um pedido em andamento. Continue no canal existente.',
        embeds: [],
        components: [makeChannelLinkRow(channel)]
      });
    }
  }

  draft.stage = 'creating';
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  await interaction.deferUpdate();

  try {
    const result = await createPrivateTicket({
      guild: interaction.guild,
      user: interaction.user,
      type: 'shop',
      kit: currentKit,
      minecraftNick: draft.minecraftNick
    });

    if (!result.alreadyOpen) {
      const latestConfig = getGuildConfig(interaction.guildId);
      const orderCode = result.channel.id.slice(-6).toUpperCase();
      const staffMention = latestConfig.staffRoleId ? '<@&' + latestConfig.staffRoleId + '>' : '';
      const embeds = [
        makeOrderEmbed({
          user: interaction.user,
          kit: currentKit,
          minecraftNick: draft.minecraftNick,
          orderCode
        }),
        latestConfig.pixKey ? makePixEmbed(latestConfig) : makeMissingPixEmbed()
      ];

      await result.channel.send({
        content: (interaction.user.toString() + ' ' + staffMention).trim(),
        embeds,
        components: [makeOrderControls()],
        allowedMentions: {
          users: [interaction.user.id],
          roles: latestConfig.staffRoleId ? [latestConfig.staffRoleId] : []
        }
      });
    }

    deletePurchaseDraft(interaction.guildId, interaction.user.id);
    await interaction.editReply({
      content: result.alreadyOpen
        ? 'Você já tem um pedido em andamento.'
        : 'Pedido confirmado. O canal de pagamento já está pronto.',
      embeds: [],
      components: [makeChannelLinkRow(result.channel)]
    });
  } catch (error) {
    draft.stage = 'review';
    savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
    throw error;
  }
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
  await interaction.channel.send('Ticket fechado por ' + interaction.user.toString() + '. O canal será excluído em 3 segundos.');
  await archiveAndDeleteTicket({ channel: interaction.channel, closedById: interaction.user.id });
}

async function decideOrder(interaction, decision) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop') return replyPrivate(interaction, 'Este canal não contém um pedido válido.');

  const config = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction, config)) {
    return replyPrivate(interaction, 'Somente a equipe pode confirmar ou recusar um pedido.');
  }
  if (ticket.status !== 'open') return replyPrivate(interaction, 'Este pedido já está fechado.');
  if (ticket.orderStatus !== 'pending') {
    return replyPrivate(interaction, 'Este pedido já foi analisado. Use o botão Fechar quando terminar o atendimento.');
  }

  const logsChannel = await fetchTextChannel(interaction.guild, config.logsChannelId);
  if (!logsChannel) {
    return replyPrivate(interaction, 'O canal privado de logs não está configurado. Use /configurar logs:#canal.');
  }

  let buyersChannel = null;
  if (decision === 'approved') {
    buyersChannel = await fetchTextChannel(interaction.guild, config.buyersChannelId);
    if (!buyersChannel) {
      return replyPrivate(interaction, 'O canal de compradores não está configurado. Use /configurar compradores:#canal.');
    }
  }

  await interaction.deferUpdate();

  await logsChannel.send({
    embeds: [makeOrderLogEmbed({ ticket, decision, staffUser: interaction.user })],
    allowedMentions: { users: [], roles: [] }
  });

  if (decision === 'approved') {
    await buyersChannel.send({
      embeds: [makeBuyerAnnouncement(ticket)],
      allowedMentions: { users: [ticket.userId], roles: [] }
    });
  }

  updateTicket(interaction.channelId, {
    orderStatus: decision,
    reviewedBy: interaction.user.id,
    reviewedAt: new Date().toISOString()
  });

  const label = decision === 'approved' ? 'confirmado' : 'recusado';
  await interaction.message.edit({
    content: 'Pedido ' + label + ' por ' + interaction.user.toString() +
      '. O canal continua aberto. Use Fechar quando o atendimento terminar.',
    components: [makeCloseRow()]
  });
}

async function handleCommand(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, 'Use este comando dentro de um servidor.');

  if (interaction.commandName === 'configurar') return configureChannels(interaction);
  if (interaction.commandName === 'pix') return configurePix(interaction);
  if (interaction.commandName === 'kit') return handleKitCommand(interaction);
}

export async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) return handleCommand(interaction);

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('support:open:')) {
      const kind = interaction.customId.split(':')[2];
      await interaction.deferReply({ ephemeral: true });
      const result = await createPrivateTicket({
        guild: interaction.guild,
        user: interaction.user,
        type: kind
      });

      if (!result.alreadyOpen) {
        const config = getGuildConfig(interaction.guildId);
        const staffMention = config.staffRoleId ? '<@&' + config.staffRoleId + '>' : '';
        await result.channel.send({
          content: (interaction.user.toString() + ' ' + staffMention).trim(),
          embeds: [makeSupportTicketEmbed(kind, interaction.user)],
          components: [makeCloseRow()],
          allowedMentions: {
            users: [interaction.user.id],
            roles: config.staffRoleId ? [config.staffRoleId] : []
          }
        });
      }

      return interaction.editReply({
        content: result.alreadyOpen ? 'Você já tem um atendimento aberto.' : 'Atendimento aberto.',
        components: [makeChannelLinkRow(result.channel)]
      });
    }

    if (interaction.customId === 'shop:catalog') return openCatalog(interaction);
    if (interaction.customId.startsWith('shop:buy:')) {
      return beginPurchaseWithKit(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId === 'shop:continue') return continuePurchase(interaction);
    if (interaction.customId.startsWith('shop:edit-nick:')) {
      return editMinecraftNick(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:confirm:')) {
      return confirmPurchase(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:cancel:')) {
      return cancelPurchase(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId === 'ticket:close') return closeTicket(interaction);
    if (interaction.customId === 'order:approve') return decideOrder(interaction, 'approved');
    if (interaction.customId === 'order:reject') return decideOrder(interaction, 'rejected');
    if (interaction.customId.startsWith('kit:wizard:')) return handleKitWizardButton(interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'shop:select') {
    return handleCatalogSelection(interaction);
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('kit:field:')) return handleKitField(interaction);
    if (interaction.customId === 'shop:nick:submit' || interaction.customId.startsWith('shop:nick:edit:')) {
      return handleNickSubmit(interaction);
    }
  }
}
