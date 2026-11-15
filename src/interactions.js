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
  deletePurchaseDraft,
  findOpenTicket,
  getGuildConfig,
  getPurchaseDraft,
  getTicket,
  makeKitDisplayName,
  removeKit,
  savePurchaseDraft,
  updateGuildConfig,
  updateKit,
  updateTicket
} from './store.js';
import {
  makeBuyerAnnouncement,
  makeCatalogMenu,
  makeChannelLinkRow,
  makeCloseRow,
  makeKitAdminMenu,
  makeKitEditFieldMenu,
  makeKitRemoveControls,
  makeKitPreviewEmbed,
  makeKitPreviewControls,
  makeDeliveryEmbed,
  makeDeliveryRetryControls,
  makeOrderControls,
  makeOrderEmbed,
  makeOrderLogEmbed,
  makePlatformControls,
  makeDeliveryPlatformControls,
  makePurchaseReviewControls,
  makePurchaseReviewEmbed,
  makeShopPanel,
  makeSupportPanel,
  makeSupportTicketEmbed
} from './ui.js';
import { archiveAndDeleteTicket, createPrivateTicket } from './tickets.js';
import { CONFIG } from './config.js';
import { deliverKit, getBridgeStatus } from './bridge.js';
import { PIX_KEY_DEFAULT, PIX_QR_FILENAME, PIX_QR_IMAGE_PATH } from './pix.js';
import { getSupabaseStatus } from './supabase.js';

const closingTickets = new Set();

function normalizeImageUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isAdministrator(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator));
}

function canManage(interaction) {
  return isAdministrator(interaction)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);
}

function isStaff(interaction, config = getGuildConfig(interaction.guildId)) {
  if (canManage(interaction)) return true;
  return Boolean(config.staffRoleId && interaction.member?.roles?.cache?.has?.(config.staffRoleId));
}

function isKitPurchasable(kit) {
  return Boolean(kit)
    && kit.enabled !== false
    && kit.manuallyUnavailable !== true
    && kit.missingFromPlugin !== true
    && Boolean(String(kit.price || '').trim());
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

function isMissingDiscordMessage(error) {
  const code = Number(error?.code ?? error?.rawError?.code);
  return code === 10008 || code === 10003 || error?.status === 404;
}

async function fetchPanelMessage(channel, messageId) {
  if (!messageId) return null;
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    if (isMissingDiscordMessage(error)) return null;
    throw error;
  }
}

async function updatePanel(guild, config, kind, channel) {
  const isShop = kind === 'shop';
  const channelKey = isShop ? 'shopPanelChannelId' : 'supportPanelChannelId';
  const messageKey = isShop ? 'shopPanelMessageId' : 'supportPanelMessageId';
  const oldChannelId = config[channelKey];
  const oldMessageId = config[messageKey];
  const payload = isShop ? makeShopPanel(config.kits) : makeSupportPanel();
  let message = null;

  // Reaproveita o painel no canal atual, mas não deixa um ID antigo travar a configuração.
  if (oldChannelId === channel.id && oldMessageId) {
    message = await fetchPanelMessage(channel, oldMessageId);
    if (message) {
      try {
        message = await message.edit(payload);
      } catch (error) {
        if (!isMissingDiscordMessage(error)) throw error;
        message = null;
      }
    }
  }

  if (!message) {
    // Ao mudar de canal, tenta remover o painel anterior. A falha nessa limpeza
    // não pode impedir a publicação no novo canal.
    if (oldChannelId && oldMessageId && oldChannelId !== channel.id) {
      const oldChannel = await fetchTextChannel(guild, oldChannelId);
      if (oldChannel) {
        const oldMessage = await fetchPanelMessage(oldChannel, oldMessageId);
        if (oldMessage) await oldMessage.delete().catch(error => {
          if (!isMissingDiscordMessage(error)) {
            console.warn('[Asthen] Não foi possível remover o painel antigo:', error.message);
          }
        });
      }
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

function makeKitEditModal(kit, field) {
  const fields = {
    displayName: { title: 'Nome na loja', label: 'Nome que o cliente verá', placeholder: 'Ex.: Kit do Guerreiro', max: 80, style: TextInputStyle.Short },
    price: { title: 'Preço do kit', label: 'Novo preço', placeholder: 'Ex.: R$ 19,90', max: 30, style: TextInputStyle.Short },
    description: { title: 'Descrição do kit', label: 'Descrição exibida na loja', placeholder: 'Explique brevemente o que o kit oferece', max: 800, style: TextInputStyle.Paragraph },
    imageUrl: { title: 'Imagem do kit', label: 'Link HTTPS da imagem', placeholder: 'https://.../imagem.png', max: 500, style: TextInputStyle.Short }
  };
  const config = fields[field];
  if (!config) throw new Error('Campo de edição desconhecido.');

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(config.label)
    .setPlaceholder(config.placeholder)
    .setStyle(config.style)
    .setMaxLength(config.max)
    .setRequired(field !== 'imageUrl' && field !== 'description');

  const current = String(kit[field] || '');
  if (current) input.setValue(current.slice(0, config.max));

  return new ModalBuilder()
    .setCustomId('kit:edit-modal:' + field + ':' + kit.id)
    .setTitle(config.title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function makeKitCreateModal(kit) {
  const shortName = String(kit.name || 'Kit').slice(0, 32);
  const displayName = new TextInputBuilder()
    .setCustomId('displayName')
    .setLabel('Nome que aparecerá na loja')
    .setPlaceholder('Ex.: Kit do Guerreiro')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true)
    .setValue(String(kit.displayName || makeKitDisplayName(kit.name)).slice(0, 80));

  const price = new TextInputBuilder()
    .setCustomId('price')
    .setLabel('Preço em reais')
    .setPlaceholder('Ex.: 19,90')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(20)
    .setRequired(true);

  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Descrição para o comprador')
    .setPlaceholder('Explique o que o kit oferece.')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(800)
    .setRequired(false);

  const imageUrl = new TextInputBuilder()
    .setCustomId('imageUrl')
    .setLabel('Link HTTPS da imagem (opcional)')
    .setPlaceholder('https://site.com/imagem.png')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false);
  if (kit.price) price.setValue(String(kit.price).replace(/^R\$\s*/i, '').slice(0, 20));
  if (kit.description) description.setValue(String(kit.description).slice(0, 800));
  if (kit.imageUrl) imageUrl.setValue(String(kit.imageUrl).slice(0, 500));

  return new ModalBuilder()
    .setCustomId('kit:create-modal:' + kit.id)
    .setTitle(('Cadastrar ' + shortName).slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(displayName),
      new ActionRowBuilder().addComponents(price),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(imageUrl)
    );
}

function normalizeBrlPrice(value) {
  const raw = String(value || '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) return null;
  return 'R$ ' + amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function handleKitCommand(interaction) {
  if (!isAdministrator(interaction)) {
    return replyPrivate(interaction, 'Somente membros com a permissão Administrador podem usar os comandos /kit.');
  }

  const subcommand = interaction.options.getSubcommand();
  const config = getGuildConfig(interaction.guildId);

  if (subcommand === 'listar') {
    if (!config.kits.length) {
      return replyPrivate(interaction, 'Nenhum kit foi recebido do Minecraft ainda. Crie o kit pelo plugin e confira /bridge status.');
    }
    const lines = config.kits.slice(0, 22).map((kit, index) => {
      const pluginState = kit.missingFromPlugin
        ? 'removido do Minecraft'
        : kit.pluginEnabled === false ? 'desativado no Minecraft'
          : kit.manuallyUnavailable ? 'indisponível na loja'
            : kit.enabled === false ? 'indisponível' : 'ativo';
      const shopState = kit.manuallyUnavailable || kit.missingFromPlugin
        ? 'indisponível na loja'
        : kit.storeConfigured ? 'cadastro comercial pronto' : 'falta cadastrar na loja';
      return (index + 1) + '. **' + String(kit.displayName || makeKitDisplayName(kit.name)) + '** — ' +
        String(kit.price || 'preço pendente') + '\nMinecraft: ' + pluginState +
        ' · Loja: ' + shopState + '\nID do plugin: `' + kit.name + '`';
    });
    const remaining = config.kits.length > 22 ? '\n... e mais ' + (config.kits.length - 22) + ' kit(s).' : '';
    return replyPrivate(interaction, lines.join('\n\n').slice(0, 1850) + remaining);
  }

  if (!config.kits.length) {
    return replyPrivate(interaction, 'Nenhum kit foi sincronizado. Primeiro crie o kit real no Minecraft pelo Plugin-ASTHEN e aguarde a lista aparecer em /bridge status. Depois use /kit criar para cadastrar o produto na loja.');
  }

  if (subcommand === 'criar') {
    const pending = config.kits.filter(kit =>
      kit.pluginManaged === true
      && kit.pluginEnabled !== false
      && kit.missingFromPlugin !== true
      && kit.storeConfigured !== true
    );
    if (!pending.length) {
      return replyPrivate(interaction, 'Todos os kits ativos recebidos do plugin já têm cadastro comercial. Use /kit editar para alterar um produto existente.');
    }
    return interaction.reply({
      content: 'Selecione um kit que já existe no Minecraft. Esta etapa cadastra apenas nome, preço, descrição e imagem na loja; os itens reais continuam sendo criados no plugin.',
      components: [makeKitAdminMenu(pending, 'kit:create-select')],
      ephemeral: true
    });
  }

  const customId = subcommand === 'editar' ? 'kit:edit-select' : 'kit:remove-select';
  const prompt = subcommand === 'editar'
    ? 'Selecione o kit e depois escolha qual informação comercial deseja alterar.'
    : 'Selecione o kit que deseja marcar como indisponível na loja.';
  return interaction.reply({
    content: prompt,
    components: [makeKitAdminMenu(config.kits, customId)],
    ephemeral: true
  });
}

async function handleKitCreateSelection(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem cadastrar kits na loja.');
  const kitId = interaction.values[0];
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId);
  if (!kit || kit.pluginManaged !== true || kit.pluginEnabled === false || kit.missingFromPlugin) {
    return replyPrivate(interaction, 'Esse kit não está ativo no Minecraft. Crie ou ative o kit no plugin e aguarde a sincronização.');
  }
  if (kit.storeConfigured === true) {
    return replyPrivate(interaction, 'Esse kit já tem cadastro na loja. Use /kit editar para alterar seus dados.');
  }
  return interaction.showModal(makeKitCreateModal(kit));
}

async function handleKitCreateModal(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem cadastrar kits na loja.');
  const kitId = interaction.customId.split(':')[2];
  const current = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId);
  if (!current || current.pluginManaged !== true || current.pluginEnabled === false || current.missingFromPlugin) {
    return replyPrivate(interaction, 'O kit deixou de existir ou foi desativado no Minecraft. Sincronize o plugin novamente antes de cadastrar.');
  }
  if (current.storeConfigured === true) {
    return replyPrivate(interaction, 'Esse kit já foi cadastrado. Use /kit editar para atualizar os dados.');
  }

  const displayName = interaction.fields.getTextInputValue('displayName').trim();
  const price = normalizeBrlPrice(interaction.fields.getTextInputValue('price'));
  const description = interaction.fields.getTextInputValue('description').trim();
  const rawImageUrl = interaction.fields.getTextInputValue('imageUrl').trim();
  const imageUrl = normalizeImageUrl(rawImageUrl);

  if (displayName.length < 2) return replyPrivate(interaction, 'O nome exibido precisa ter pelo menos 2 caracteres.');
  if (!price) return replyPrivate(interaction, 'Preço inválido. Use o formato brasileiro, por exemplo 19,90.');
  if (rawImageUrl && !imageUrl) return replyPrivate(interaction, 'A imagem precisa ser um link HTTPS válido.');

  const updated = updateKit(interaction.guildId, kitId, {
    displayName,
    price,
    description,
    imageUrl: imageUrl || '',
    storeConfigured: true,
    enabled: true,
    manuallyUnavailable: false
  });
  await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
  return interaction.reply({
    content: 'Kit cadastrado na loja. O kit real continua sendo gerenciado pelo Plugin-ASTHEN.',
    embeds: updated ? [makeKitPreviewEmbed(updated)] : [],
    ephemeral: true
  });
}

async function handleKitAdminSelection(interaction, action) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem gerenciar kits.');
  const kitId = interaction.values[0];
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais no catálogo. Atualize a lista e tente novamente.');

  if (action === 'edit') {
    return interaction.update({
      content: 'Kit selecionado: **' + String(kit.displayName || makeKitDisplayName(kit.name)) +
        '**. Escolha o que deseja editar.',
      embeds: [makeKitPreviewEmbed(kit)],
      components: [makeKitEditFieldMenu(kit)]
    });
  }

  return interaction.update({
    content: 'Confirma a remoção de **' + String(kit.displayName || makeKitDisplayName(kit.name)) +
      '** do catálogo da loja? O kit e os itens do servidor Minecraft não serão apagados.',
    embeds: [],
    components: [makeKitRemoveControls(kit.id)]
  });
}

async function handleKitEditFieldSelection(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  const kitId = interaction.customId.split(':')[2];
  const field = interaction.values[0];
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais no catálogo.');
  if (field === 'availability') {
    if (kit.missingFromPlugin || kit.pluginEnabled === false) {
      return replyPrivate(interaction, 'Não é possível ativar: o kit foi removido ou está desativado no Minecraft.');
    }
    updateKit(interaction.guildId, kit.id, { manuallyUnavailable: false, enabled: true });
    const freshConfig = getGuildConfig(interaction.guildId);
    const shopChannel = await fetchTextChannel(interaction.guild, freshConfig.shopPanelChannelId);
    if (shopChannel) {
      updateGuildConfig(interaction.guildId, await updatePanel(interaction.guild, freshConfig, 'shop', shopChannel));
    }
    return interaction.update({ content: 'O kit voltou a ficar disponível na loja.', embeds: [], components: [] });
  }
  return interaction.showModal(makeKitEditModal(kit, field));
}

async function handleKitEditModal(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  const [, , field, kitId] = interaction.customId.split(':');
  const current = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId);
  if (!current) return replyPrivate(interaction, 'Este kit não está mais no catálogo.');

  const value = interaction.fields.getTextInputValue('value').trim();
  const changes = {};

  if (field === 'displayName') {
    if (value.length < 2) return replyPrivate(interaction, 'O nome exibido precisa ter pelo menos 2 caracteres.');
    changes.displayName = value;
  } else if (field === 'price') {
    const price = normalizeBrlPrice(value);
    if (!price) return replyPrivate(interaction, 'Preço inválido. Use o formato brasileiro, por exemplo 19,90.');
    changes.price = price;
    changes.storeConfigured = true;
  } else if (field === 'description') {
    changes.description = value;
  } else if (field === 'imageUrl') {
    const imageUrl = normalizeImageUrl(value);
    if (value && !imageUrl) return replyPrivate(interaction, 'A imagem precisa ser um link HTTPS válido.');
    changes.imageUrl = imageUrl || '';
  } else {
    return replyPrivate(interaction, 'Campo de edição inválido.');
  }

  const updated = updateKit(interaction.guildId, kitId, changes);
  await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
  return interaction.reply({
    content: 'Informação do kit atualizada. Você pode selecionar outro campo para editar.',
    embeds: updated ? [makeKitPreviewEmbed(updated)] : [],
    components: updated ? [makeKitEditFieldMenu(updated)] : [],
    ephemeral: true
  });
}

async function confirmKitRemoval(interaction, kitId) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem marcar kits como indisponíveis.');
  const config = getGuildConfig(interaction.guildId);
  const kit = config.kits.find(item => item.id === kitId);
  if (!kit) return interaction.update({ content: 'Este kit já foi removido.', embeds: [], components: [] });

  removeKit(interaction.guildId, kitId);
  await syncShopPanel(interaction.guild, getGuildConfig(interaction.guildId));
  return interaction.update({
    content: '**' + String(kit.displayName || makeKitDisplayName(kit.name)) +
      '** agora está marcado como indisponível. O produto, o preço e o histórico foram preservados.',
    embeds: [],
    components: []
  });
}

async function syncShopPanel(guild, config = getGuildConfig(guild.id)) {
  if (!config.shopPanelChannelId) return false;
  const channel = await fetchTextChannel(guild, config.shopPanelChannelId);
  if (!channel) {
    updateGuildConfig(guild.id, {
      shopPanelChannelId: null,
      shopPanelMessageId: null
    });
    return false;
  }

  const payload = makeShopPanel(config.kits);
  let message = await fetchPanelMessage(channel, config.shopPanelMessageId);
  if (message) {
    try {
      await message.edit(payload);
      return true;
    } catch (error) {
      if (!isMissingDiscordMessage(error)) throw error;
    }
  }

  // Painel apagado ou perdido: publica outro e salva o novo ID.
  message = await channel.send(payload);
  updateGuildConfig(guild.id, { shopPanelMessageId: message.id });
  return true;
}



function makeMinecraftNickModal(customId, currentNick = '') {
  const input = new TextInputBuilder()
    .setCustomId('minecraft-nick')
    .setLabel('Nick que será usado no Minecraft')
    .setPlaceholder('Java ou gamertag Bedrock, igual aparece no jogo')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
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
  if (!config.kits.length) return replyPrivate(interaction, 'A loja ainda não recebeu kits do servidor.');

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
        existingDraft.stage = existingDraft.minecraftNick
          ? (existingDraft.platform ? 'review' : 'platform')
          : 'selected';
        savePurchaseDraft(interaction.guildId, interaction.user.id, existingDraft);
      }
      if (existingDraft.minecraftNick && existingDraft.platform) {
        existingDraft.stage = 'review';
        savePurchaseDraft(interaction.guildId, interaction.user.id, existingDraft);
        return interaction.reply({
          content: 'Você já iniciou uma compra. Confira os dados antes de confirmar.',
          embeds: [makePurchaseReviewEmbed(existingDraft)],
          components: [makePurchaseReviewControls(existingDraft)],
          ephemeral: true
        });
      }
      if (existingDraft.minecraftNick) {
        existingDraft.stage = 'platform';
        savePurchaseDraft(interaction.guildId, interaction.user.id, existingDraft);
        return interaction.reply({
          content: 'Escolha se você joga na edição Java ou Bedrock.',
          components: [makePlatformControls(existingDraft)],
          ephemeral: true
        });
      }
      existingDraft.stage = 'selected';
      savePurchaseDraft(interaction.guildId, interaction.user.id, existingDraft);
      return interaction.reply({
        content: CONFIG.shop.previewPrompt,
        embeds: [makeKitPreviewEmbed(existingDraft.kit)],
        components: [makeKitPreviewControls(existingDraft)],
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
  if (draft.minecraftNick && draft.platform) {
    draft.stage = 'review';
    savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
    return replyPrivate(interaction, 'Confira os dados antes de continuar.', [makePurchaseReviewControls(draft)], [makePurchaseReviewEmbed(draft)]);
  }
  if (draft.minecraftNick) {
    draft.stage = 'platform';
    savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
    return replyPrivate(interaction, 'Escolha se você joga na edição Java ou Bedrock.', [makePlatformControls(draft)]);
  }
  return interaction.showModal(makeMinecraftNickModal('shop:nick:submit'));
}

async function beginPurchaseWithKit(interaction, kitId, updateExistingMessage = false) {
  const config = getGuildConfig(interaction.guildId);
  const kit = config.kits.find(item => item.id === kitId);
  if (!isKitPurchasable(kit)) return replyPrivate(interaction, 'Este kit está indisponível para compra. Ele continua no catálogo para consulta.');

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
      displayName: kit.displayName || makeKitDisplayName(kit.name),
      price: kit.price,
      description: kit.description,
      imageUrl: kit.imageUrl || ''
    },
    minecraftNick: '',
    platform: '',
    stage: 'selected',
    revision: randomUUID().slice(0, 8)
  };
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);

  const payload = {
    content: CONFIG.shop.previewPrompt,
    embeds: [makeKitPreviewEmbed(draft.kit)],
    components: [makeKitPreviewControls(draft)]
  };
  return updateExistingMessage
    ? interaction.update(payload)
    : interaction.reply({ ...payload, ephemeral: true });
}

async function handleCatalogSelection(interaction) {
  return beginPurchaseWithKit(interaction, interaction.values[0], true);
}

async function confirmSelectedKit(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision || draft.stage !== 'selected') {
    return replyPrivate(interaction, 'Esta prévia ficou desatualizada. Abra o catálogo novamente.');
  }
  return interaction.showModal(makeMinecraftNickModal('shop:nick:submit'));
}

async function switchPurchaseKit(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision) {
    return replyPrivate(interaction, 'Esta prévia ficou desatualizada. Abra o catálogo novamente.');
  }
  const config = getGuildConfig(interaction.guildId);
  if (!config.kits.length) return replyPrivate(interaction, 'A loja ainda não recebeu kits do servidor.');
  return interaction.update({ content: CONFIG.shop.catalogPrompt, embeds: [], components: [makeCatalogMenu(config.kits)] });
}


function purchasableKits(config) {
  return config.kits.filter(isKitPurchasable);
}

async function sendOrderTicketMessage(channel, user, kit, minecraftNick, platform, guildConfig) {
  const staffMention = guildConfig.staffRoleId ? '<@&' + guildConfig.staffRoleId + '>' : '';
  await channel.send({
    content: staffMention || undefined,
    embeds: [makeOrderEmbed({ userId: user.id, kit, minecraftNick, platform })],
    files: [{ attachment: PIX_QR_IMAGE_PATH, name: PIX_QR_FILENAME }],
    components: [makeOrderControls()],
    allowedMentions: {
      users: [user.id],
      roles: guildConfig.staffRoleId ? [guildConfig.staffRoleId] : []
    }
  });
}

async function handleNickSubmit(interaction) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft) return replyPrivate(interaction, 'Sua compra não está mais em preparação. Abra o catálogo novamente.');

  const minecraftNick = interaction.fields.getTextInputValue('minecraft-nick').trim();
  if (!/^[A-Za-z0-9_. ]{1,32}$/.test(minecraftNick) || minecraftNick.startsWith(' ') || minecraftNick.endsWith(' ')) {
    return replyPrivate(interaction, 'Informe um nick válido, sem espaços no começo ou no fim e com até 32 caracteres.');
  }
  if (interaction.customId.startsWith('shop:nick:edit:')) {
    const requestedRevision = interaction.customId.split(':')[3];
    if (draft.revision !== requestedRevision) {
      return replyPrivate(interaction, 'Esta etapa da compra já foi atualizada. Use a revisão mais recente.');
    }
  }

  draft.minecraftNick = minecraftNick;
  draft.platform = '';
  draft.stage = 'platform';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return replyPrivate(interaction, 'Agora escolha a edição do Minecraft em que você joga.', [makePlatformControls(draft)]);
}

async function selectPurchasePlatform(interaction, platform, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision || draft.stage !== 'platform') {
    return replyPrivate(interaction, 'Esta etapa da compra ficou desatualizada. Abra o catálogo novamente.');
  }
  if (platform !== 'java' && platform !== 'bedrock') return replyPrivate(interaction, 'Escolha Java ou Bedrock.');
  if (platform === 'java' && !/^[A-Za-z0-9_]{3,16}$/.test(draft.minecraftNick || '')) {
    return replyPrivate(interaction, 'Esse nick não parece válido para Java. Java aceita de 3 a 16 letras, números ou _. Edite o nick ou escolha Bedrock.');
  }

  const config = getGuildConfig(interaction.guildId);
  const currentKit = config.kits.find(kit => kit.id === draft.kit?.id);
  if (!isKitPurchasable(currentKit)) {
    deletePurchaseDraft(interaction.guildId, interaction.user.id);
    return replyPrivate(interaction, 'Este kit ficou indisponível. Escolha outro produto na loja.');
  }

  draft.platform = platform;
  draft.stage = 'review';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return interaction.update({
    content: 'Confira os dados antes de continuar.',
    embeds: [makePurchaseReviewEmbed(draft)],
    components: [makePurchaseReviewControls(draft)]
  });
}

async function editMinecraftPlatform(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision || draft.stage !== 'review') {
    return replyPrivate(interaction, 'Esta revisão da compra ficou desatualizada.');
  }
  draft.platform = '';
  draft.stage = 'platform';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return interaction.update({
    content: 'Escolha se você joga na edição Java ou Bedrock.',
    embeds: [],
    components: [makePlatformControls(draft)]
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
  if (!draft || !draft.kit || !draft.minecraftNick || !draft.platform) {
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
  if (!isKitPurchasable(currentKit)) {
    deletePurchaseDraft(interaction.guildId, interaction.user.id);
    return replyPrivate(interaction, 'Este kit foi removido ou está indisponível para compra.');
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
      minecraftNick: draft.minecraftNick,
      platform: draft.platform
    });

    if (!result.alreadyOpen) {
      await sendOrderTicketMessage(
        result.channel,
        interaction.user,
        currentKit,
        draft.minecraftNick,
        draft.platform,
        getGuildConfig(interaction.guildId)
      );
    }

    deletePurchaseDraft(interaction.guildId, interaction.user.id);
    await interaction.editReply({
      content: result.alreadyOpen
        ? 'Você já tem um pedido em andamento.'
        : 'Ticket de pagamento criado. Envie o comprovante no canal.',
      embeds: [],
      components: [makeChannelLinkRow(result.channel)]
    });
  } catch (error) {
    draft.stage = 'review';
    savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
    throw error;
  }
}

async function showPixKey(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop') {
    return replyPrivate(interaction, 'Este botão só funciona em tickets de compra.');
  }
  return replyPrivate(
    interaction,
    'Chave Pix da loja:\n```' + PIX_KEY_DEFAULT + '```\nToque e segure para copiar.'
  );
}

async function closeTicket(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyPrivate(interaction, 'Este canal não está registrado como ticket.');

  const config = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction, config)) {
    return replyPrivate(interaction, 'Somente a equipe autorizada pode fechar este canal.');
  }
  if (ticket.status !== 'open' || closingTickets.has(interaction.channelId)) {
    return replyPrivate(interaction, 'Este ticket já está sendo fechado.');
  }

  closingTickets.add(interaction.channelId);
  try {
    if (ticket.type === 'shop' && ticket.orderStatus === 'pending') {
      const logsChannel = await fetchTextChannel(interaction.guild, config.logsChannelId);
      if (!logsChannel) {
        return replyPrivate(
          interaction,
          'Não posso fechar este pedido pendente sem registrar o resultado. Configure o canal de logs com /configurar logs:#canal e tente novamente.'
        );
      }

      await logsChannel.send({
        embeds: [makeOrderLogEmbed({
          ticket,
          decision: 'closed_without_result',
          staffUser: interaction.user
        })],
        allowedMentions: { users: [], roles: [] }
      });

      updateTicket(interaction.channelId, {
        orderStatus: 'closed_without_result',
        closedWithoutResultBy: interaction.user.id,
        closedWithoutResultAt: new Date().toISOString()
      });
    }

    // Atualiza a interação sem mandar uma segunda confirmação privada.
    await interaction.deferUpdate();
    await interaction.channel.send(
      'Este atendimento será encerrado por ' + interaction.user.toString() +
      ' e o canal será excluído em 3 segundos.'
    );
    await archiveAndDeleteTicket({ channel: interaction.channel, closedById: interaction.user.id });
  } finally {
    closingTickets.delete(interaction.channelId);
  }
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
      '. O canal continua aberto. ' + (decision === 'approved' ? 'A entrega do kit foi solicitada ao plugin.' : 'Use Fechar quando o atendimento terminar.'),
    components: [makeCloseRow()]
  });

  if (decision === 'approved') {
    const approvedTicket = getTicket(interaction.channelId);
    void processApprovedDelivery(interaction.channel, approvedTicket, { interaction })
      .catch(error => console.error('[Asthen] Falha ao iniciar entrega do kit:', error));
  }
}

async function handleBridgeCommand(interaction) {
  if (!canManage(interaction)) {
    return replyPrivate(interaction, 'Somente administradores ou quem tem Gerenciar servidor pode usar este comando.');
  }
  const action = interaction.options.getSubcommand();
  if (action !== 'status') {
    return replyPrivate(interaction, 'A chave não é exibida no Discord. Copie DKB_SECRET diretamente do .env local e configure o mesmo valor em bridge.secret no config.yml do plugin.');
  }

  const status = getBridgeStatus();
  const database = getSupabaseStatus();
  const kits = status.kits.length
    ? status.kits.map(kit => (kit.enabled ? '• ' : '• [desativado] ') + kit.name + ' (' + kit.items + ' itens)').join('\n')
    : 'Nenhum kit sincronizado ainda.';
  return replyPrivate(interaction, [
    '**Integração ASTHEN**',
    'API: ' + (status.running ? 'online' : 'offline'),
    'Endereço local: ' + (status.running ? 'http://' + status.host + ':' + status.port : 'não iniciada'),
    'Pedidos aguardando: ' + status.pending,
    'Kits recebidos do plugin: ' + status.kits.length,
    status.lastKitsSyncAt ? 'Última lista recebida: ' + status.lastKitsSyncAt : 'Aguardando primeira sincronização do plugin.',
    'Supabase: ' + (database.enabled ? 'configurado' : 'desativado'),
    database.lastSyncedAt ? 'Última sincronização do banco: ' + database.lastSyncedAt : '',
    database.lastError ? 'Aviso Supabase: ' + database.lastError : '',
    '',
    kits
  ].filter(Boolean).join('\n'));
}

async function notifyStaffPrivately(interaction, content) {
  if (!interaction) return;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (error) {
    console.warn('[Asthen] Não foi possível enviar o aviso privado à equipe:', error.message);
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function friendlyDeliveryMessage(status, originalMessage = '') {
  const messages = {
    KIT_DELIVERED: 'O plugin confirmou que o kit foi entregue ao jogador.',
    KIT_PENDING: 'O inventário não tinha espaço. O plugin guardou o kit para retirada no Minecraft.',
    PLAYER_OFFLINE: 'O jogador não está online. Entre no servidor e peça à equipe para tentar novamente.',
    KIT_NOT_FOUND: 'O kit não foi encontrado no servidor. A equipe precisa conferir se ele ainda existe no plugin.',
    PLATFORM_MISMATCH: 'A plataforma informada não corresponde à plataforma detectada pelo servidor. A equipe precisa conferir Java/Bedrock e o nick.',
    PLATFORM_UNVERIFIABLE: 'O servidor não conseguiu verificar a conta Bedrock. A equipe precisa conferir Geyser e Floodgate.',
    KIT_DISABLED: 'Este kit está desativado no servidor e não pode ser entregue no momento.',
    KIT_CORRUPT: 'O plugin encontrou um problema nos dados deste kit. A equipe foi avisada.',
    INVENTORY_FULL: 'O inventário está cheio e o plugin não conseguiu guardar o kit como pendente. A equipe foi avisada.',
    DELIVERY_DISABLED: 'A entrega pelo Discord está desativada na configuração do plugin. A equipe foi avisada.'
  };
  return messages[status] || originalMessage || 'O plugin não confirmou a entrega. A equipe foi avisada e vai verificar o pedido.';
}

async function deliverWithTimeoutRetry(payload) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await deliverKit(payload);
    } catch (error) {
      if (error.code !== 'BRIDGE_TIMEOUT' || attempt === 2) throw error;
      await wait(1500);
    }
  }
  throw new Error('Não foi possível concluir a entrega.');
}

async function processApprovedDelivery(channel, ticket, { newRequest = false, interaction = null } = {}) {
  if (!ticket.platform) {
    updateTicket(ticket.channelId, {
      deliveryStatus: 'PLATFORM_REQUIRED',
      deliveryUpdatedAt: new Date().toISOString()
    });
    await channel.send({
      content: 'Este pedido é antigo e ainda não tem Java/Bedrock registrado. A equipe precisa confirmar a plataforma antes de entregar o kit.',
      components: [makeDeliveryPlatformControls()]
    });
    return;
  }

  const requestId = newRequest
    ? 'ticket-' + ticket.channelId + '-' + randomUUID().slice(0, 8)
    : (ticket.deliveryRequestId || 'ticket-' + ticket.channelId);
  const current = updateTicket(ticket.channelId, {
    deliveryRequestId: requestId,
    deliveryStatus: 'QUEUED',
    deliveryUpdatedAt: new Date().toISOString(),
    deliveryError: null
  }) || ticket;

  await channel.send('Pagamento confirmado. A entrega do kit está sendo solicitada ao Minecraft.');
  try {
    const result = await deliverWithTimeoutRetry({
      requestId,
      player: current.minecraftNick,
      platform: current.platform,
      kit: current.kitName,
      timeoutMs: 60000
    });
    const status = String(result.status || 'UNKNOWN');
    updateTicket(ticket.channelId, {
      deliveryStatus: status,
      deliveryResponse: String(result.message || ''),
      deliveryUpdatedAt: new Date().toISOString(),
      deliveryError: null
    });

    const success = status === 'KIT_DELIVERED' || status === 'KIT_PENDING';
    await channel.send({
      embeds: [makeDeliveryEmbed({
        ...result,
        message: friendlyDeliveryMessage(status, result.message),
        player: result.player || current.minecraftNick,
        platform: result.platform || current.platform,
        kit: current.kitDisplayName || current.kitName
      })],
      components: success ? [makeCloseRow()] : [makeDeliveryRetryControls(result.final === true ? 'new' : 'same')]
    });

    if (!success) {
      await notifyStaffPrivately(
        interaction,
        'A entrega não foi concluída. Status: ' + status + '. ' +
        String(result.message || 'Confira a configuração do plugin.') +
        '\nO pedido foi preservado.'
      );
    }
  } catch (error) {
    const timedOut = error.code === 'BRIDGE_TIMEOUT';
    updateTicket(ticket.channelId, {
      deliveryStatus: timedOut ? 'TIMEOUT' : 'WAITING',
      deliveryError: String(error.message || 'Falha ao solicitar a entrega.'),
      deliveryUpdatedAt: new Date().toISOString()
    });
    await channel.send({
      content: timedOut
        ? 'O Minecraft não respondeu nas duas tentativas automáticas. O mesmo identificador da compra foi mantido. A equipe pode tentar novamente sem criar outra compra.'
        : 'Pagamento confirmado, mas a conexão com o Minecraft está indisponível. O pedido foi preservado e a equipe está acompanhando.',
      components: [makeDeliveryRetryControls('same')]
    });
    await notifyStaffPrivately(
      interaction,
      (timedOut ? 'A entrega excedeu o tempo limite nas duas tentativas automáticas.' : 'Não foi possível alcançar a bridge do Minecraft.') +
      ' O mesmo identificador foi preservado. Detalhe técnico: ' + String(error.message || 'Sem resposta.')
    );
  }
}

async function setLegacyTicketPlatform(interaction, platform) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop' || ticket.orderStatus !== 'approved') {
    return replyPrivate(interaction, 'Este canal não contém um pedido aprovado que precise da plataforma.');
  }
  if (!isStaff(interaction, getGuildConfig(interaction.guildId))) {
    return replyPrivate(interaction, 'Somente a equipe autorizada pode definir a plataforma deste pedido.');
  }
  if (platform !== 'java' && platform !== 'bedrock') return replyPrivate(interaction, 'Escolha Java ou Bedrock.');
  updateTicket(interaction.channelId, { platform });
  await interaction.reply({ content: 'Plataforma salva. A entrega será solicitada agora.', ephemeral: true });
  void processApprovedDelivery(interaction.channel, getTicket(interaction.channelId), { interaction })
    .catch(error => console.error('[Asthen] Falha na entrega de pedido antigo:', error));
}

async function retryApprovedDelivery(interaction, mode) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop' || ticket.orderStatus !== 'approved') {
    return replyPrivate(interaction, 'Este canal não possui um pedido pago aguardando entrega.');
  }
  if (!isStaff(interaction, getGuildConfig(interaction.guildId))) {
    return replyPrivate(interaction, 'Somente a equipe pode solicitar outra tentativa de entrega.');
  }
  if (mode === 'same' && !ticket.deliveryRequestId) {
    return replyPrivate(interaction, 'Não encontrei o identificador da entrega anterior. Use uma nova tentativa.');
  }

  await interaction.reply({
    content: mode === 'new'
      ? 'Uma nova tentativa de entrega foi criada.'
      : 'A tentativa anterior foi reenviada com o mesmo identificador.',
    ephemeral: true
  });
  void processApprovedDelivery(interaction.channel, ticket, { newRequest: mode === 'new', interaction })
    .catch(error => console.error('[Asthen] Falha ao tentar entregar o kit:', error));
}

async function openSupportTicket(interaction, kind) {
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
      content: staffMention || undefined,
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

async function handleCommand(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, 'Use este comando dentro de um servidor.');

  if (interaction.commandName === 'configurar') return configureChannels(interaction);
  if (interaction.commandName === 'kit') return handleKitCommand(interaction);
  if (interaction.commandName === 'bridge') return handleBridgeCommand(interaction);
}

export async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) return handleCommand(interaction);

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('support:open:')) {
      return openSupportTicket(interaction, interaction.customId.split(':')[2]);
    }

    if (interaction.customId === 'shop:catalog') return openCatalog(interaction);
    if (interaction.customId.startsWith('shop:buy:')) {
      return beginPurchaseWithKit(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId === 'shop:continue') return continuePurchase(interaction);
    if (interaction.customId.startsWith('shop:switch-kit:')) {
      return switchPurchaseKit(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:kit-confirm:')) {
      return confirmSelectedKit(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:edit-nick:')) {
      return editMinecraftNick(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:edit-platform:')) {
      return editMinecraftPlatform(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:platform:')) {
      const [, , platform, revision] = interaction.customId.split(':');
      return selectPurchasePlatform(interaction, platform, revision);
    }
    if (interaction.customId.startsWith('delivery:set-platform:')) {
      return setLegacyTicketPlatform(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:confirm:')) {
      return confirmPurchase(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('shop:cancel:')) {
      return cancelPurchase(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId === 'ticket:close') return closeTicket(interaction);
    if (interaction.customId === 'pix:copy') return showPixKey(interaction);
    if (interaction.customId === 'order:approve') return decideOrder(interaction, 'approved');
    if (interaction.customId === 'order:reject') return decideOrder(interaction, 'rejected');
    if (interaction.customId.startsWith('delivery:retry:')) {
      return retryApprovedDelivery(interaction, interaction.customId.split(':')[2]);
    }
    if (interaction.customId.startsWith('kit:remove:confirm:')) {
      return confirmKitRemoval(interaction, interaction.customId.split(':')[3]);
    }
    if (interaction.customId === 'kit:remove:cancel') {
      return interaction.update({ content: 'Remoção cancelada.', embeds: [], components: [] });
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'support:select') {
    return openSupportTicket(interaction, interaction.values[0]);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'shop:select') {
    return handleCatalogSelection(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'kit:create-select') {
    return handleKitCreateSelection(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'kit:edit-select') {
    return handleKitAdminSelection(interaction, 'edit');
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'kit:remove-select') {
    return handleKitAdminSelection(interaction, 'remove');
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('kit:edit-field:')) {
    return handleKitEditFieldSelection(interaction);
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('kit:create-modal:')) return handleKitCreateModal(interaction);
    if (interaction.customId.startsWith('kit:edit-modal:')) return handleKitEditModal(interaction);
    if (interaction.customId === 'shop:nick:submit' || interaction.customId.startsWith('shop:nick:edit:')) {
      return handleNickSubmit(interaction);
    }
  }
}
