import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  MessageFlags,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import {
  appendTicketHistory,
  deletePurchaseDraft,
  findOpenTicket,
  getGuildConfig,
  getPlayerRegistration,
  getPurchaseDraft,
  getTicket,
  listTickets,
  makeKitDisplayName,
  getShopKits,
  savePurchaseDraft,
  updateGuildConfig,
  updateKit,
  updateTicket
} from './store.js';
import {
  makeBuyerAnnouncement,
  makeCatalogMenu,
  makeCatalogPaginationRow,
  makeChannelLinkRow,
  makeCloseRow,
  makeKitAdminMenu,
  makeKitAdminPaginationRow,
  makeKitEditFieldMenu,
  makeKitPreviewEmbed,
  makeKitPreviewControls,
  makeKitStoreDeleteControls,
  makeDeliveryMessage,
  makeDeliveryRetryControls,
  makeOrderControls,
  makeApprovedOrderControls,
  makeOrderEmbed,
  makeOrderLogEmbed,
  makePurchaseReviewControls,
  makePurchaseReviewEmbed,
  makeSupportTicketEmbed,
} from './ui.js';
import { archiveAndDeleteTicket, createPrivateTicket } from './tickets.js';
import { CONFIG } from './config.js';
import { deliverKit, getBridgeJob, getBridgeStatus } from './bridge.js';
import { PIX_KEY_DEFAULT, PIX_QR_FILENAME, PIX_QR_IMAGE_PATH } from './pix.js';
import { getSupabaseStatus, getWeeklyKitStock, reserveWeeklyKitStock, releaseWeeklyKitStock } from './supabase.js';
import { exportTicketTranscript } from './transcripts.js';
import { createBackup, listBackups } from './maintenance.js';
import { registerPlayerForMember, validateMinecraftNick, validateRegistrationForMember, refreshRegistrationPanel } from './registration.js';
import { publishTikTokVideo } from './tiktok.js';
import { normalizeChannelName } from './channel-discovery.js';

const closingTickets = new Set();
const orderDecisionsInFlight = new Set();
const deliveryAttemptsInFlight = new Set();
const stockReleaseAttemptsInFlight = new Set();
const pendingRegistrations = new Map();
const PENDING_REGISTRATION_TTL_MS = 5 * 60 * 1000;

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
  // Administrator bypasses channel overwrites. ManageGuild alone does not, so it
  // is not sufficient to review a private ticket unless the member has the staff role.
  return isAdministrator(interaction)
    || Boolean(config.staffRoleId && interaction.member?.roles?.cache?.has?.(config.staffRoleId));
}

function isKitPurchasable(kit) {
  return Boolean(kit)
    && kit.enabled !== false
    && kit.storeVisible !== false
    && kit.manuallyUnavailable !== true
    && kit.missingFromPlugin !== true
    && kit.forSale === true
    && kit.pluginForSale === true
    && !(Number.isInteger(kit.weeklyRemaining) && kit.weeklyRemaining <= 0);
}

function withWeeklyStock(kits, snapshot) {
  return kits.map(kit => {
    const current = snapshot.items?.[kit.id];
    const weeklyLimit = Number.isInteger(current?.limit) ? current.limit : snapshot.limit || 10;
    return {
      ...kit,
      weeklyRemaining: Number.isInteger(current?.remaining) ? current.remaining : weeklyLimit,
      weeklyLimit,
      weeklyWeekStart: snapshot.weekStart
    };
  });
}

function makeCatalogComponents(kits, page = 0) {
  const pageSize = Math.min(25, Math.max(1, Number(CONFIG.shop.maxKits) || 25));
  const totalPages = Math.max(1, Math.ceil(kits.length / pageSize));
  const components = [makeCatalogMenu(kits, page)];
  const pagination = makeCatalogPaginationRow(page, totalPages);
  if (pagination) components.push(pagination);
  return components;
}

function makeKitAdminComponents(kits, page = 0) {
  const totalPages = Math.max(1, Math.ceil(kits.length / 25));
  const components = [makeKitAdminMenu(kits, page)];
  const pagination = makeKitAdminPaginationRow(page, totalPages);
  if (pagination) components.push(pagination);
  return components;
}

async function withCurrentStock(guildId, kits) {
  const hasPurchasableKit = kits.some(kit => !kit.demo && isKitPurchasable(kit));
  if (!hasPurchasableKit) return kits;
  const snapshot = await getWeeklyKitStock(guildId);
  return kits.map(kit => kit.demo ? kit : withWeeklyStock([kit], snapshot)[0]);
}

export async function getShopKitsWithCurrentStock(guildId) {
  return withCurrentStock(guildId, getShopKits(guildId));
}

function catalogPromptText(kits) {
  return kits.some(kit => !kit.demo && isKitPurchasable(kit))
    ? CONFIG.shop.catalogPrompt + '\n\nCada kit tem até 10 unidades por semana. O estoque reinicia domingo às 00:00 (horário de Brasília).'
    : CONFIG.shop.catalogPrompt;
}

function weeklyStockErrorMessage(error) {
  return 'A loja não conseguiu consultar o estoque semanal no Supabase. Verifique a configuração do banco e execute supabase/SETUP.sql. ' +
    (error?.message ? 'Detalhe: ' + String(error.message).slice(0, 220) : '');
}

function replyPrivate(interaction, content, components = [], embeds = []) {
  const payload = { content, components, embeds, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId)
    ?? await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased() && typeof channel.send === 'function' ? channel : null;
}

async function refreshPublishedShopPanel(guild, guildId) {
  const config = getGuildConfig(guildId);
  if (!config.shopPanelChannelId) return null;
  try {
    const channel = await fetchTextChannel(guild, config.shopPanelChannelId);
    if (!channel) return false;
    const changes = await updatePanel(guild, config, 'shop', channel);
    updateGuildConfig(guildId, changes);
    return true;
  } catch (error) {
    console.error('[Asthen] Kit atualizado, mas não foi possível atualizar o painel da loja:', error.message);
    return false;
  }
}

function shopPanelRefreshNotice(refreshed) {
  return refreshed === false
    ? '\nNão consegui atualizar automaticamente a mensagem do canal #kits. Confira as permissões de envio e histórico do bot nesse canal.'
    : '';
}

export async function secureLogsChannel(channel, guild) {
  const everyoneId = guild.roles.everyone.id;
  const overwrites = [{
    id: everyoneId,
    deny: [PermissionsBitField.Flags.ViewChannel]
  }];
  for (const role of guild.roles.cache.values()) {
    if (role.id === everyoneId || !role.permissions.has(PermissionsBitField.Flags.Administrator)) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles
      ]
    });
  }
  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }
  await channel.permissionOverwrites.set(overwrites, 'ASTHEN: restringir #logs a administradores');
}



function makeKitEditModal(kit, field) {
  const fields = {
    displayName: { title: 'Nome na loja', label: 'Nome que o cliente verá', placeholder: 'Ex.: Kit do Guerreiro', max: 80, style: TextInputStyle.Short },
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

async function handleKitCommand(interaction) {
  if (!isAdministrator(interaction)) {
    return replyPrivate(interaction, 'Somente administradores podem configurar os kits.');
  }
  if (interaction.options.getSubcommand() !== 'configurar') {
    return replyPrivate(interaction, 'Use /kit configurar.');
  }
  const pluginKits = getGuildConfig(interaction.guildId).kits.filter(kit => kit.pluginManaged === true);
  if (!pluginKits.length) {
    return replyPrivate(interaction, 'Nenhum kit foi sincronizado ainda. Crie os kits no Minecraft e confira /admin minecraft status.');
  }
  return interaction.reply({
    content: 'Configuração de kits · selecione um kit para editar nome, descrição ou imagem.',
    components: makeKitAdminComponents(pluginKits, 0),
    flags: MessageFlags.Ephemeral
  });
}

async function handleKitAdminPage(interaction, requestedPage) {
  if (!isAdministrator(interaction)) {
    return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  }
  if (!Number.isInteger(requestedPage) || requestedPage < 0) {
    return replyPrivate(interaction, 'Página inválida. Abra /kit configurar novamente.');
  }
  const kits = getGuildConfig(interaction.guildId).kits.filter(kit => kit.pluginManaged === true);
  const totalPages = Math.max(1, Math.ceil(kits.length / 25));
  if (!kits.length || requestedPage >= totalPages) {
    return replyPrivate(interaction, 'Esta página não existe mais. Abra /kit configurar novamente.');
  }
  return interaction.update({
    content: 'Selecione um kit sincronizado do Minecraft para editar.',
    embeds: [],
    components: makeKitAdminComponents(kits, requestedPage)
  });
}

async function handleKitAdminSelection(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  const kitId = interaction.values[0];
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId && item.pluginManaged === true);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais sincronizado. Confira /admin minecraft status.');
  return interaction.update({
    content: 'Kit selecionado: **' + String(kit.displayName || makeKitDisplayName(kit.name)) + '**. Escolha o que deseja editar.',
    embeds: [makeKitPreviewEmbed(kit)],
    components: [makeKitEditFieldMenu(kit)]
  });
}

async function handleKitEditFieldSelection(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  const kitId = interaction.customId.split(':')[2];
  const field = interaction.values[0];
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId && item.pluginManaged === true);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais sincronizado com o Minecraft.');

  if (field === 'removeFromStore') {
    if (kit.storeVisible === false) return replyPrivate(interaction, 'Este kit já está fora da loja.');
    return interaction.update({
      content: 'Confirme a exclusão de **' + String(kit.displayName || makeKitDisplayName(kit.name)) + '** da loja do Discord.\n\nIsso não apaga o kit do Minecraft nem do Plugin-ASTHEN. Ele apenas deixa de aparecer no catálogo e não aceitará novos pedidos pela loja.',
      embeds: [makeKitPreviewEmbed(kit)],
      components: [makeKitStoreDeleteControls(kit)]
    });
  }

  if (field === 'restoreFromStore') {
    if (kit.storeVisible !== false) return replyPrivate(interaction, 'Este kit já aparece na loja.');
    await interaction.deferUpdate();
    const updated = updateKit(interaction.guildId, kitId, { storeVisible: true });
    if (!updated) return interaction.editReply({ content: 'Não foi possível recolocar o kit na loja.', embeds: [], components: [] });
    const refreshed = await refreshPublishedShopPanel(interaction.guild, interaction.guildId);
    return interaction.editReply({
      content: 'Kit recolocado no catálogo do Discord.' + shopPanelRefreshNotice(refreshed),
      embeds: [makeKitPreviewEmbed(updated)],
      components: [makeKitEditFieldMenu(updated)]
    });
  }

  if (!['displayName', 'description', 'imageUrl'].includes(field)) {
    return replyPrivate(interaction, 'Campo de edição inválido.');
  }
  return interaction.showModal(makeKitEditModal(kit, field));
}

async function handleKitStoreDeleteConfirm(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem excluir kits da loja.');
  const kitId = interaction.customId.split(':').at(-1);
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId && item.pluginManaged === true);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais sincronizado com o Minecraft.');
  if (kit.storeVisible === false) return replyPrivate(interaction, 'Este kit já foi retirado da loja.');

  await interaction.deferUpdate();
  const updated = updateKit(interaction.guildId, kitId, { storeVisible: false });
  if (!updated) return interaction.editReply({ content: 'Não foi possível retirar o kit da loja.', embeds: [], components: [] });
  const refreshed = await refreshPublishedShopPanel(interaction.guild, interaction.guildId);
  return interaction.editReply({
    content: 'Kit retirado da loja do Discord. Ele continua cadastrado no Minecraft/Plugin-ASTHEN e pode ser recolocado pelo menu de edição.' + shopPanelRefreshNotice(refreshed),
    embeds: [makeKitPreviewEmbed(updated)],
    components: [makeKitEditFieldMenu(updated)]
  });
}

async function handleKitStoreDeleteCancel(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  const kitId = interaction.customId.split(':').at(-1);
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId && item.pluginManaged === true);
  if (!kit) return replyPrivate(interaction, 'Este kit não está mais sincronizado com o Minecraft.');
  return interaction.update({
    content: 'Exclusão cancelada. O kit continua na loja.',
    embeds: [makeKitPreviewEmbed(kit)],
    components: [makeKitEditFieldMenu(kit)]
  });
}

async function handleKitEditModal(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem editar kits.');
  const [, , field, kitId] = interaction.customId.split(':');
  const current = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId && item.pluginManaged === true);
  if (!current) return replyPrivate(interaction, 'Este kit não está mais no catálogo.');

  const value = interaction.fields.getTextInputValue('value').trim();
  const changes = {};

  if (field === 'displayName') {
    if (value.length < 2) return replyPrivate(interaction, 'O nome exibido precisa ter pelo menos 2 caracteres.');
    changes.displayName = value;
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
  return interaction.reply({
    content: 'Informação do kit atualizada. Você pode selecionar outro campo para editar.',
    embeds: updated ? [makeKitPreviewEmbed(updated)] : [],
    components: updated ? [makeKitEditFieldMenu(updated)] : [],
    flags: MessageFlags.Ephemeral
  });
}

function makeMinecraftNickModal(customId, currentNick = '') {
  const input = new TextInputBuilder()
    .setCustomId('minecraft-nick')
    .setLabel('Nick do Minecraft')
    .setPlaceholder('Digite seu nick exatamente como aparece no servidor')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(32)
    .setRequired(true);

  if (currentNick) input.setValue(currentNick);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Identificação Minecraft')
    .addComponents(new ActionRowBuilder().addComponents(input));
}


async function openCatalog(interaction) {
  const player = getPlayerRegistration(interaction.user.id);
  if (!player?.minecraft_nick) {
    return replyPrivate(interaction, 'Antes de usar a loja, conclua seu registro Minecraft em #registro.');
  }

  const catalogKits = getShopKits(interaction.guildId);
  if (!catalogKits.length) return replyPrivate(interaction, 'A loja ainda não recebeu kits do servidor.');
  const existing = findOpenTicket(interaction.guildId, interaction.user.id, 'shop');
  if (existing) {
    const channel = await fetchTextChannel(interaction.guild, existing.channelId);
    if (channel) return interaction.reply({
      content: 'Você já tem um pedido em andamento. Continue a conversa no canal existente.',
      components: [makeChannelLinkRow(channel)],
      flags: MessageFlags.Ephemeral
    });
  }

  let stockedKits;
  try {
    stockedKits = await withCurrentStock(interaction.guildId, catalogKits);
  } catch (error) {
    return replyPrivate(interaction, weeklyStockErrorMessage(error));
  }

  const existingDraft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (existingDraft) {
    const currentKit = stockedKits.find(kit => kit.id === existingDraft.kit?.id);
    if (currentKit) {
      existingDraft.kit = { ...existingDraft.kit, ...currentKit };
      existingDraft.minecraftNick = player.minecraft_nick;
      existingDraft.platform = 'bedrock';
      existingDraft.stage = 'review';
      existingDraft.revision = randomUUID().slice(0, 8);
      savePurchaseDraft(interaction.guildId, interaction.user.id, existingDraft);
      return interaction.reply({
        content: 'Identificação Minecraft: **' + player.minecraft_nick + '**\nConfira os dados do pedido.',
        embeds: [makePurchaseReviewEmbed(existingDraft)],
        components: [makePurchaseReviewControls(existingDraft)],
        flags: MessageFlags.Ephemeral
      });
    }
    deletePurchaseDraft(interaction.guildId, interaction.user.id);
  }

  return interaction.reply({
    content: catalogPromptText(stockedKits),
    components: makeCatalogComponents(stockedKits, 0),
    flags: MessageFlags.Ephemeral
  });
}

async function continuePurchase(interaction) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft) return replyPrivate(interaction, 'Não encontrei uma compra em preparação. Abra a loja novamente.');
  if (draft.stage === 'creating') return replyPrivate(interaction, 'Seu pedido já está sendo criado. Aguarde alguns instantes.');

  const player = getPlayerRegistration(interaction.user.id);
  if (!player?.minecraft_nick) {
    return replyPrivate(interaction, 'Seu registro Minecraft não foi encontrado. Conclua o cadastro em #registro para continuar.');
  }

  draft.minecraftNick = player.minecraft_nick;
  draft.platform = 'bedrock';
  draft.stage = 'review';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return replyPrivate(
    interaction,
    'Identificação Minecraft: **' + player.minecraft_nick + '**. Confira os dados antes de continuar.',
    [makePurchaseReviewControls(draft)],
    [makePurchaseReviewEmbed(draft)]
  );
}

async function beginPurchaseWithKit(interaction, kitId, updateExistingMessage = false) {
  const config = getGuildConfig(interaction.guildId);
  const kit = kitId === 'asthen-demo-kit'
    ? getShopKits(interaction.guildId).find(item => item.id === kitId)
    : config.kits.find(item => item.id === kitId);

  if (kit?.demo) {
    const preview = {
      content: 'Amostra da loja. Este item não pode ser comprado e não cria cobrança, reserva de estoque ou entrega.',
      embeds: [makeKitPreviewEmbed(kit)],
      components: []
    };
    return updateExistingMessage
      ? interaction.update(preview)
      : interaction.reply({ ...preview, flags: MessageFlags.Ephemeral });
  }

  const player = getPlayerRegistration(interaction.user.id);
  if (!player?.minecraft_nick) {
    return replyPrivate(interaction, 'Antes de comprar, conclua seu registro Minecraft em #registro.');
  }
  if (!isKitPurchasable(kit)) {
    return replyPrivate(interaction, 'Este kit está indisponível para compra. Ele continua no catálogo para consulta.');
  }

  let stockSnapshot;
  try {
    stockSnapshot = await getWeeklyKitStock(interaction.guildId);
  } catch (error) {
    return replyPrivate(interaction, weeklyStockErrorMessage(error));
  }
  const stockedKit = withWeeklyStock([kit], stockSnapshot)[0];
  if (stockedKit.weeklyRemaining <= 0) {
    return replyPrivate(interaction, 'As 10 unidades deste kit já foram reservadas nesta semana. O estoque volta no domingo às 00:00 (horário de Brasília).');
  }

  const existing = findOpenTicket(interaction.guildId, interaction.user.id, 'shop');
  if (existing) {
    const channel = await fetchTextChannel(interaction.guild, existing.channelId);
    if (channel) return replyPrivate(interaction, 'Você já tem um pedido aberto.', [makeChannelLinkRow(channel)]);
  }

  const draft = {
    kit: {
      id: stockedKit.id,
      name: stockedKit.name,
      displayName: stockedKit.displayName || makeKitDisplayName(stockedKit.name),
      price: stockedKit.price,
      description: stockedKit.description,
      imageUrl: stockedKit.imageUrl || '',
      weeklyRemaining: stockedKit.weeklyRemaining,
      weeklyLimit: stockedKit.weeklyLimit,
      weeklyWeekStart: stockedKit.weeklyWeekStart
    },
    minecraftNick: player.minecraft_nick,
    platform: 'bedrock',
    stage: 'selected',
    revision: randomUUID().slice(0, 8)
  };
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);

  const payload = {
    content: 'Identificação Minecraft: **' + player.minecraft_nick + '**\n' + CONFIG.shop.previewPrompt,
    embeds: [makeKitPreviewEmbed(draft.kit)],
    components: [makeKitPreviewControls(draft)]
  };
  return updateExistingMessage
    ? interaction.update(payload)
    : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function handleCatalogPage(interaction, requestedPage) {
  if (!Number.isInteger(requestedPage) || requestedPage < 0) {
    return replyPrivate(interaction, 'Página de catálogo inválida. Abra a loja novamente.');
  }

  const catalogKits = getShopKits(interaction.guildId);
  let stockedKits;
  try {
    stockedKits = await withCurrentStock(interaction.guildId, catalogKits);
  } catch (error) {
    return replyPrivate(interaction, weeklyStockErrorMessage(error));
  }
  const pageSize = Math.min(25, Math.max(1, Number(CONFIG.shop.maxKits) || 25));
  const totalPages = Math.max(1, Math.ceil(stockedKits.length / pageSize));
  if (requestedPage >= totalPages) {
    return replyPrivate(interaction, 'Esta página não existe mais. Abra o catálogo novamente.');
  }

  return interaction.update({
    content: catalogPromptText(stockedKits),
    embeds: [],
    components: makeCatalogComponents(stockedKits, requestedPage)
  });
}

async function handleCatalogSelection(interaction) {
  // Painéis públicos antigos podem conter opções desatualizadas. Sempre abre
  // uma consulta privada do catálogo atual; menus privados continuam selecionando direto.
  const sourceIsEphemeral = interaction.message?.flags?.has?.(MessageFlags.Ephemeral) === true;
  if (!sourceIsEphemeral) return openCatalog(interaction);
  return beginPurchaseWithKit(interaction, interaction.values[0], true);
}

async function confirmSelectedKit(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision || draft.stage !== 'selected') {
    return replyPrivate(interaction, 'Esta prévia ficou desatualizada. Abra o catálogo novamente.');
  }

  const player = getPlayerRegistration(interaction.user.id);
  if (!player?.minecraft_nick) {
    return replyPrivate(interaction, 'Seu registro Minecraft não foi encontrado. Conclua o cadastro em #registro.');
  }

  draft.minecraftNick = player.minecraft_nick;
  draft.platform = 'bedrock';
  draft.stage = 'review';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return interaction.update({
    content: 'Identificação Minecraft: **' + player.minecraft_nick + '**\nConfira o kit e confirme o pedido.',
    embeds: [makePurchaseReviewEmbed(draft)],
    components: [makePurchaseReviewControls(draft)]
  });
}

async function switchPurchaseKit(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || draft.revision !== requestedRevision) {
    return replyPrivate(interaction, 'Esta prévia ficou desatualizada. Abra o catálogo novamente.');
  }
  const catalogKits = getShopKits(interaction.guildId);
  if (!catalogKits.length) return replyPrivate(interaction, 'A loja ainda não recebeu kits do servidor.');
  try {
    const stockedKits = await withCurrentStock(interaction.guildId, catalogKits);
    return interaction.update({
      content: catalogPromptText(stockedKits),
      embeds: [],
      components: makeCatalogComponents(stockedKits, 0)
    });
  } catch (error) {
    return replyPrivate(interaction, weeklyStockErrorMessage(error));
  }
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

async function forcePurchaseBedrock(interaction, requestedRevision) {
  const draft = getPurchaseDraft(interaction.guildId, interaction.user.id);
  if (!draft || (requestedRevision && draft.revision !== requestedRevision)) {
    return replyPrivate(interaction, 'Esta etapa da compra ficou desatualizada. Abra a loja novamente.');
  }
  draft.platform = 'bedrock';
  draft.stage = 'review';
  draft.revision = randomUUID().slice(0, 8);
  savePurchaseDraft(interaction.guildId, interaction.user.id, draft);
  return interaction.update({
    content: 'A loja ASTHEN agora aceita somente Bedrock. Confira os dados do pedido.',
    embeds: [makePurchaseReviewEmbed(draft)],
    components: [makePurchaseReviewControls(draft)]
  });
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

  const player = getPlayerRegistration(interaction.user.id);
  if (!player?.minecraft_nick) {
    return replyPrivate(interaction, 'Seu registro Minecraft não foi encontrado. Conclua o cadastro em #registro antes de confirmar.');
  }
  if (!draft || !draft.kit) {
    return replyPrivate(interaction, 'Não encontrei uma compra pronta para confirmar. Abra a loja e tente novamente.');
  }

  draft.minecraftNick = player.minecraft_nick;
  draft.platform = 'bedrock';
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

  let stockSnapshot;
  try {
    stockSnapshot = await getWeeklyKitStock(interaction.guildId);
  } catch (error) {
    return replyPrivate(interaction, weeklyStockErrorMessage(error));
  }
  const currentKitWithStock = withWeeklyStock([currentKit], stockSnapshot)[0];
  if (currentKitWithStock.weeklyRemaining <= 0) {
    return replyPrivate(interaction, 'As 10 unidades deste kit já foram reservadas nesta semana. Nenhum novo ticket foi criado; o estoque reinicia domingo às 00:00 (horário de Brasília).');
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
      kit: currentKitWithStock,
      minecraftNick: player.minecraft_nick,
      platform: draft.platform
    });

    if (!result.alreadyOpen) {
      await sendOrderTicketMessage(
        result.channel,
        interaction.user,
        currentKitWithStock,
        player.minecraft_nick,
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
  if (!isStaff(interaction, config)) return replyPrivate(interaction, 'Somente a equipe autorizada pode fechar este canal.');
  if (ticket.status !== 'open' || closingTickets.has(interaction.channelId)) return replyPrivate(interaction, 'Este ticket já está sendo fechado.');
  if (deliveryAttemptsInFlight.has(interaction.channelId)) return replyPrivate(interaction, 'A entrega ainda está sendo processada. Aguarde a confirmação antes de fechar este pedido.');
  if (ticket.type === 'shop' && ticket.orderStatus === 'approved'
      && (!ticket.deliveryStatus || ['PLATFORM_REQUIRED', 'QUEUED', 'TIMEOUT', 'WAITING', 'KIT_PENDING'].includes(ticket.deliveryStatus))) {
    return replyPrivate(interaction, 'Não é possível fechar este pedido enquanto a entrega estiver pendente ou sem confirmação. Estado atual: ' + ticket.deliveryStatus + '. Aguarde a atualização do Minecraft ou faça a reconciliação com a equipe.');
  }
  if (ticket.type === 'shop' && ticket.orderStatus === 'approved'
      && ticket.deliveryStatus !== 'KIT_DELIVERED' && !ticket.stockReleasedAt) {
    return replyPrivate(interaction, 'A entrega não foi confirmada. Antes de fechar este pedido, tente novamente ou use "Registrar cancelamento/estorno" depois de concluir o cancelamento/reembolso. A reserva semanal só é liberada após essa confirmação.');
  }

  const logsChannel = await fetchTextChannel(interaction.guild, config.logsChannelId);
  if (!logsChannel) return replyPrivate(interaction, 'Não posso fechar este ticket sem arquivar a conversa. Confira se o canal #logs existe e se o bot consegue enviar mensagens e anexos nele.');

  closingTickets.add(interaction.channelId);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (ticket.type === 'shop' && ticket.orderStatus === 'pending') {
      await logsChannel.send({
        embeds: [makeOrderLogEmbed({ ticket, decision: 'closed_without_result', staffUser: interaction.user })],
        allowedMentions: { users: [], roles: [] }
      });
      updateTicket(interaction.channelId, {
        orderStatus: 'closed_without_result',
        closedWithoutResultBy: interaction.user.id,
        closedWithoutResultAt: new Date().toISOString()
      });
    }

    let transcript = null;
    if (!ticket.transcriptExportedAt) {
      transcript = await exportTicketTranscript({
        channel: interaction.channel,
        ticket,
        logsChannel,
        closedBy: interaction.user
      });
      updateTicket(interaction.channelId, {
        transcriptExportedAt: transcript.exportedAt,
        transcriptMessageId: transcript.logMessageId,
        transcriptExportedBy: interaction.user.id,
        transcriptMessageCount: transcript.messageCount,
        transcriptAttachmentCount: transcript.attachmentCount
      });
      appendTicketHistory(interaction.channelId, {
        type: 'transcript_exported',
        eventId: 'transcript-exported:' + interaction.channelId,
        logMessageId: transcript.logMessageId,
        messageCount: transcript.messageCount,
        attachmentCount: transcript.attachmentCount
      });
    }

    await interaction.channel.send({
      content: 'Este atendimento foi arquivado em #logs por ' + interaction.user.toString() + '. O canal será excluído em 3 segundos.',
      allowedMentions: { users: [interaction.user.id], roles: [] }
    });
    await archiveAndDeleteTicket({ channel: interaction.channel, closedById: interaction.user.id });
    await interaction.editReply({
      content: transcript
        ? 'Ticket arquivado em #logs. Transcrição: ' + transcript.messageCount + ' mensagens · ' + transcript.attachmentCount + ' anexo(s).'
        : 'Ticket já possuía uma transcrição arquivada em #logs e foi fechado.'
    });
  } catch (error) {
    console.error('[Asthen Transcript] Não foi possível arquivar/fechar o ticket:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('Não consegui concluir o arquivamento. O canal foi mantido para não perder a conversa. Verifique as permissões e o tamanho dos anexos e tente novamente.').catch(() => {});
    }
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
  if (orderDecisionsInFlight.has(interaction.channelId)) {
    return replyPrivate(interaction, 'Este pedido já está sendo analisado por outro membro da equipe.');
  }

  orderDecisionsInFlight.add(interaction.channelId);
  try {
    const logsChannel = await fetchTextChannel(interaction.guild, config.logsChannelId);
    if (!logsChannel) return replyPrivate(interaction, 'O canal privado de logs não está configurado. Configure #logs no Discord e reinicie o bot.');

    let buyersChannel = null;
    if (decision === 'approved') {
      buyersChannel = await fetchTextChannel(interaction.guild, config.buyersChannelId);
      if (!buyersChannel) return replyPrivate(interaction, 'O canal de compradores não está configurado. Confira se existe #compradores e reinicie o bot.');
    }

    await interaction.deferUpdate();
    let reservation = null;
    const reservationId = 'ticket-' + ticket.channelId;

    if (decision === 'approved') {
      try {
        reservation = await reserveWeeklyKitStock({
          guildId: ticket.guildId || interaction.guildId,
          kitId: ticket.kitId,
          requestId: reservationId
        });
      } catch (error) {
        console.error('[Asthen Stock] Não foi possível reservar o estoque:', error);
        await interaction.followUp({
          content: 'Pagamento não aprovado pelo bot: não consegui reservar uma das 10 unidades semanais no Supabase. Confira a conexão e execute supabase/SETUP.sql; depois tente novamente.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!reservation.ok) {
        await interaction.followUp({
          content: 'Limite semanal esgotado: as 10 unidades deste kit já foram reservadas nesta semana. Não confirme este pagamento como aprovado; a equipe precisa resolver o pedido com o comprador.',
          flags: MessageFlags.Ephemeral
        });
        try {
          await interaction.message.edit({
            content: 'Aprovação bloqueada: limite semanal deste kit esgotado. O pedido continua pendente para a equipe resolver com o comprador.',
            components: [makeOrderControls()]
          });
        } catch (error) {
          console.warn('[Asthen Stock] Não foi possível atualizar a mensagem do pedido:', error.message);
        }
        return;
      }
    }

    const reviewedAt = new Date().toISOString();
    updateTicket(interaction.channelId, {
      orderStatus: decision,
      reviewedBy: interaction.user.id,
      reviewedAt,
      ...(reservation ? {
        stockReservationId: reservationId,
        stockWeekStart: reservation.week_start,
        stockReservedAt: reviewedAt,
        stockReservedCount: reservation.reserved_count,
        stockRemaining: reservation.remaining
      } : {})
    });
    appendTicketHistory(interaction.channelId, {
      type: 'order_decision',
      eventId: 'order-decision:' + interaction.channelId,
      decision,
      staffId: interaction.user.id,
      stockReservationId: reservation ? reservationId : null,
      stockWeekStart: reservation ? reservation.week_start : null,
      at: reviewedAt
    });

    if (reservation) {
      await refreshPublishedShopPanel(interaction.guild, interaction.guildId);
    }

    try {
      await logsChannel.send({
        embeds: [makeOrderLogEmbed({ ticket: { ...ticket, orderStatus: decision }, decision, staffUser: interaction.user })],
        allowedMentions: { users: [], roles: [] }
      });
    } catch (error) {
      console.error('[Asthen] Não foi possível registrar a decisão no canal de logs:', error);
    }

    if (decision === 'approved') {
      try {
        await buyersChannel.send({
          embeds: [makeBuyerAnnouncement(ticket)],
          allowedMentions: { users: [ticket.userId], roles: [] }
        });
      } catch (error) {
        console.error('[Asthen] Não foi possível publicar o anúncio de compra:', error);
      }
    }

    if (decision === 'rejected') {
      try {
        await interaction.message.edit({
          content: 'Pedido recusado por ' + interaction.user.toString() + '. O canal continua aberto para a equipe orientar o comprador.',
          components: [makeCloseRow()]
        });
      } catch (error) {
        console.error('[Asthen] Não foi possível atualizar a mensagem do pedido:', error);
      }
    }

    if (decision === 'approved') {
      try {
        await interaction.message.edit({
          content: 'Pagamento confirmado por ' + interaction.user.toString() +
            '. A entrega está sendo processada pelo Plugin-ASTHEN. O botão de estorno só deve ser usado depois de concluir o cancelamento fora do bot.',
          components: [makeApprovedOrderControls(), makeCloseRow()]
        });
      } catch (error) {
        console.warn('[Asthen] Pagamento aprovado, mas não foi possível atualizar os controles do pedido:', error.message);
        try {
          await interaction.channel.send({
            content: 'Pagamento aprovado. Use os controles abaixo para registrar um cancelamento/estorno, se necessário.',
            components: [makeApprovedOrderControls(), makeCloseRow()],
            allowedMentions: { users: [], roles: [] }
          });
        } catch (fallbackError) {
          console.error('[Asthen] Não foi possível publicar os controles alternativos do pedido:', fallbackError.message);
        }
      }
    }

    if (decision === 'approved') {
      const approvedTicket = getTicket(interaction.channelId);
      void processApprovedDelivery(interaction.channel, approvedTicket, { interaction })
        .catch(error => console.error('[Asthen] Falha ao iniciar entrega do kit:', error));
    }
  } finally {
    orderDecisionsInFlight.delete(interaction.channelId);
  }
}

async function handleBackupCommand(interaction) {
  if (!isAdministrator(interaction)) return replyPrivate(interaction, 'Somente administradores podem consultar ou criar backups.');
  const action = interaction.options.getSubcommand();
  if (action === 'listar' || action === 'status') {
    const backups = listBackups();
    if (!backups.length) return replyPrivate(interaction, 'Nenhum backup foi criado ainda. O backup automático será executado após a inicialização.');
    const lines = backups.slice(0, 10).map(item =>
      (item.valid ? 'OK' : 'ERRO') + ' · ' + item.id + ' · ' +
      (item.createdAt || 'data desconhecida') + ' · ' + (item.bytes / 1024).toFixed(1) + ' KB'
    );
    return replyPrivate(interaction, '**Backups ASTHEN · ' + backups.length + ' disponível(is)**\n' +
      lines.join('\n') + '\n\nRestauração: feche o bot e execute RESTAURAR.bat na pasta do projeto.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = createBackup({ reason: 'manual pelo Discord · administrador ' + interaction.user.id });
    return interaction.editReply('Backup criado e verificado: ' + result.id +
      '\nArquivos protegidos: ' + result.files + ' · ' + (result.bytes / 1024).toFixed(1) + ' KB.');
  } catch (error) {
    console.error('[Asthen Backup] Falha ao criar backup manual:', error);
    return interaction.editReply('Não consegui criar o backup. Verifique o espaço em disco e o console do bot.');
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
    ? status.kits.map(kit => {
      const price = Number.isSafeInteger(kit.price_cents) && kit.price_cents > 0
        ? 'R$ ' + (kit.price_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : 'sem preço';
      const sale = kit.for_sale === true ? 'à venda' : 'indisponível';
      return (kit.enabled ? '• ' : '• [desativado] ') + kit.name +
        ' (' + kit.items + ' itens) · ' + price + ' · ' + sale;
    }).join('\n')
    : 'Nenhum kit sincronizado ainda.';
  return replyPrivate(interaction, [
    '**Integração ASTHEN**',
    'API: ' + (status.running ? 'online' : 'offline'),
    'Endereço local: ' + (status.running ? 'http://' + status.host + ':' + status.port : 'não iniciada'),
    'Pedidos aguardando: ' + status.pending,
    'Plugin Minecraft: ' + (!status.lastPluginContactAt
      ? 'aguardando primeiro contato autenticado'
      : status.pluginOnline
        ? 'conectado'
        : 'sem comunicação há ' + Math.floor((Date.now() - status.lastPluginContactAt) / 1000) + 's'),
    'Último contato do plugin: ' + (status.lastPluginContactAt
      ? new Date(status.lastPluginContactAt).toLocaleString('pt-BR')
      : 'nenhum contato nesta execução'),
    'Pedido mais antigo na fila: ' + (status.oldestPendingAgeMs === null || status.oldestPendingAgeMs === undefined
      ? 'nenhum'
      : Math.floor(status.oldestPendingAgeMs / 1000) + 's'),
    'Kits recebidos do plugin: ' + status.kits.length,
    status.lastKitsSyncAt ? 'Última lista recebida: ' + status.lastKitsSyncAt : 'Aguardando primeira sincronização do plugin.',
    'Supabase: ' + (database.enabled ? 'configurado' : 'desativado'),
    'Estoque semanal: ' + (
      database.weeklyStockHealth === 'ready'
        ? 'conexão e tabela verificadas; 10 unidades por kit, reinício domingo 00:00 (Brasília)'
        : database.weeklyStockHealth === 'error'
          ? 'erro na consulta/liberação — ' + String(database.lastStockCheckError || 'verifique supabase/SETUP.sql')
          : database.weeklyStockHealth === 'not_checked'
            ? 'credenciais configuradas, mas o esquema ainda não foi verificado'
            : 'indisponível — configure o Supabase e execute supabase/SETUP.sql'
    ),
    database.lastSyncedAt ? 'Última sincronização do banco: ' + database.lastSyncedAt : '',
    database.lastError ? 'Aviso Supabase: ' + database.lastError : '',
    '',
    kits
  ].filter(Boolean).join('\n'));
}

async function requestStockRelease(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop') {
    return replyPrivate(interaction, 'Este canal não contém um pedido válido.');
  }
  if (!isStaff(interaction, getGuildConfig(interaction.guildId))) {
    return replyPrivate(interaction, 'Somente a equipe autorizada pode registrar o cancelamento/estorno.');
  }
  if (ticket.orderStatus !== 'approved') {
    return replyPrivate(interaction, 'Somente pedidos aprovados podem liberar uma reserva semanal.');
  }
  if (ticket.stockReleasedAt) {
    return replyPrivate(interaction, 'A reserva semanal deste pedido já foi liberada.');
  }
  if (!ticket.stockReservationId) {
    return replyPrivate(interaction, 'Este pedido não possui um identificador de reserva. A equipe precisa conferir o estoque manualmente.');
  }
  if (deliveryAttemptsInFlight.has(ticket.channelId)) {
    return replyPrivate(interaction, 'A entrega ainda está em processamento. Aguarde um resultado definitivo antes de cancelar.');
  }

  const status = String(ticket.deliveryStatus || 'UNKNOWN');
  if (status === 'KIT_PENDING') {
    return replyPrivate(interaction,
      'Este kit ainda está guardado como pendência no Minecraft e pode ser recebido depois. Resolva/remova a pendência no servidor antes de registrar um estorno.');
  }
  const safeFinalFailures = new Set([
    'PLAYER_OFFLINE', 'PLATFORM_MISMATCH', 'PLATFORM_UNVERIFIABLE',
    'KIT_NOT_FOUND', 'KIT_DISABLED', 'INVENTORY_FULL', 'DELIVERY_DISABLED',
    'KIT_CORRUPT', 'INVALID_REQUEST'
  ]);
  const pluginFinalTimeout = status === 'TIMEOUT'
    && (ticket.deliveryPluginFinal === true || getBridgeJob(ticket.deliveryRequestId || '')?.result?.status === 'TIMEOUT');
  if (status !== 'KIT_DELIVERED' && !safeFinalFailures.has(status) && !pluginFinalTimeout) {
    return replyPrivate(interaction,
      'Ainda não existe um resultado final seguro para liberar o estoque. Estado atual: ' + status +
      '. Não cancele enquanto a Bridge ou o Minecraft ainda puderem concluir a entrega.');
  }

  const modal = new ModalBuilder()
    .setCustomId('order:release-stock:submit')
    .setTitle('Registrar cancelamento / estorno');
  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Motivo do cancelamento ou estorno')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(5)
    .setMaxLength(300)
    .setRequired(true);
  const confirmation = new TextInputBuilder()
    .setCustomId('confirmation')
    .setLabel('Digite ESTORNO CONFIRMADO')
    .setStyle(TextInputStyle.Short)
    .setMinLength(18)
    .setMaxLength(18)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(reason),
    new ActionRowBuilder().addComponents(confirmation)
  );

  const gameConfirmation = new TextInputBuilder()
    .setCustomId('game-confirmation')
    .setLabel('Confirmação do estado do kit no Minecraft')
    .setPlaceholder(status === 'KIT_DELIVERED' ? 'KIT REMOVIDO' : 'NAO ENTREGUE')
    .setStyle(TextInputStyle.Short)
    .setMinLength(12)
    .setMaxLength(12)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(gameConfirmation));
  return interaction.showModal(modal);
}

async function submitStockRelease(interaction) {
  const channelId = interaction.channelId;
  if (stockReleaseAttemptsInFlight.has(channelId)) {
    return replyPrivate(interaction, 'A liberação desta reserva já está sendo processada.');
  }
  stockReleaseAttemptsInFlight.add(channelId);
  try {
    return await submitStockReleaseInternal(interaction);
  } finally {
    stockReleaseAttemptsInFlight.delete(channelId);
  }
}

async function submitStockReleaseInternal(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop' || ticket.orderStatus !== 'approved') {
    return replyPrivate(interaction, 'Este pedido não está aprovado ou já foi encerrado.');
  }
  if (!isStaff(interaction, getGuildConfig(interaction.guildId))) {
    return replyPrivate(interaction, 'Somente a equipe autorizada pode registrar o cancelamento/estorno.');
  }
  if (ticket.stockReleasedAt) {
    return replyPrivate(interaction, 'A reserva semanal deste pedido já foi liberada.');
  }
  if (deliveryAttemptsInFlight.has(ticket.channelId)) {
    return replyPrivate(interaction, 'A entrega ainda está em processamento. Aguarde um resultado definitivo.');
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const confirmation = interaction.fields.getTextInputValue('confirmation').trim().toUpperCase();
  if (reason.length < 5 || confirmation !== 'ESTORNO CONFIRMADO') {
    return replyPrivate(interaction, 'Confirmação inválida. Registre somente depois de concluir o cancelamento/estorno fora do bot.');
  }

  const status = String(ticket.deliveryStatus || 'UNKNOWN');
  const safeFinalFailures = new Set([
    'PLAYER_OFFLINE', 'PLATFORM_MISMATCH', 'PLATFORM_UNVERIFIABLE',
    'KIT_NOT_FOUND', 'KIT_DISABLED', 'INVENTORY_FULL', 'DELIVERY_DISABLED',
    'KIT_CORRUPT', 'INVALID_REQUEST'
  ]);
  const pluginFinalTimeout = status === 'TIMEOUT'
    && (ticket.deliveryPluginFinal === true || getBridgeJob(ticket.deliveryRequestId || '')?.result?.status === 'TIMEOUT');
  if (status === 'KIT_PENDING') {
    return replyPrivate(interaction, 'A pendência ainda pode ser recebida no Minecraft. Resolva-a no servidor antes de liberar o estoque.');
  }
  const gameConfirmation = interaction.fields.getTextInputValue('game-confirmation').trim().toUpperCase();
  if (status === 'KIT_DELIVERED') {
    if (gameConfirmation !== 'KIT REMOVIDO') {
      return replyPrivate(interaction, 'Não liberei o estoque. Primeiro remova o kit do jogador no Minecraft e confirme com KIT REMOVIDO.');
    }
  } else {
    if (gameConfirmation !== 'NAO ENTREGUE') {
      return replyPrivate(interaction, 'Confirme NAO ENTREGUE somente depois de verificar que nenhuma Shulker Box está entregue ou pendente.');
    }
    if (!safeFinalFailures.has(status) && !pluginFinalTimeout) {
      return replyPrivate(interaction, 'O estado ' + status + ' não permite liberar a reserva com segurança. Aguarde a reconciliação da entrega.');
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let release;
  try {
    release = await releaseWeeklyKitStock({
      guildId: ticket.guildId || interaction.guildId,
      requestId: ticket.stockReservationId
    });
  } catch (error) {
    console.error('[Asthen Stock] Não foi possível liberar a reserva semanal:', error);
    return interaction.editReply(
      'Não consegui confirmar a liberação no Supabase. O pedido continua aprovado e a reserva não foi marcada como liberada no bot. Você pode repetir esta ação com segurança; a operação do banco é idempotente.'
    );
  }

  if (!release.ok) {
    const detail = release.reason === 'reservation_not_found'
      ? 'A reserva não foi encontrada no Supabase.'
      : 'O Supabase não confirmou a liberação (' + String(release.reason || 'motivo desconhecido') + ').';
    return interaction.editReply(detail + ' Nenhum status local foi alterado.');
  }

  const releasedAt = new Date().toISOString();
  const updated = updateTicket(interaction.channelId, {
    orderStatus: 'cancelled',
    stockReleasedAt: releasedAt,
    stockReleaseReason: reason,
    stockReleasedBy: interaction.user.id,
    stockReleaseAlreadyApplied: release.already_released === true
  }) || ticket;
  appendTicketHistory(interaction.channelId, {
    type: 'stock_released',
    eventId: 'stock-release:' + ticket.stockReservationId,
    reservationId: ticket.stockReservationId,
    staffId: interaction.user.id,
    reason,
    alreadyReleased: release.already_released === true,
    remaining: release.remaining,
    at: releasedAt
  });

  await refreshPublishedShopPanel(interaction.guild, interaction.guildId);

  try {
    if (interaction.channel?.send) {
      await interaction.channel.send({
        content: '<@' + ticket.userId + '> O cancelamento/estorno foi registrado pela equipe e a reserva semanal do kit foi liberada.',
        allowedMentions: { users: [ticket.userId], roles: [] }
      });
    }
  } catch (error) {
    console.error('[Asthen Stock] Reserva liberada, mas a notificação no ticket não foi publicada:', error);
  }

  try {
    const config = getGuildConfig(interaction.guildId);
    const logsChannel = await fetchTextChannel(interaction.guild, config.logsChannelId);
    if (logsChannel) {
      await logsChannel.send({
        embeds: [makeOrderLogEmbed({ ticket: { ...updated, stockReleaseReason: reason }, decision: 'refunded', staffUser: interaction.user })],
        allowedMentions: { users: [], roles: [] }
      });
    }
  } catch (error) {
    console.error('[Asthen Stock] Reserva liberada, mas o log do estorno não foi publicado:', error);
  }

  await interaction.editReply(
    'Cancelamento registrado. A reserva semanal foi liberada no Supabase' +
    (release.already_released ? ' (a operação já havia sido aplicada)' : '') +
    '. Restante nesta semana: ' + String(release.remaining ?? '—') + '.'
  );
}

async function notifyStaffPrivately(interaction, content) {
  if (!interaction) return;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.warn('[Asthen] Não foi possível enviar o aviso privado à equipe:', error.message);
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function friendlyDeliveryMessage(status, originalMessage = '') {
  const original = String(originalMessage || '').toLowerCase();
  if (status === 'KIT_PENDING' && original.includes('offline')) {
    return 'O jogador estava offline. O plugin guardou o kit na fila e tentará entregá-lo automaticamente quando ele entrar no servidor. Isso exige kits.require-online: false no config.yml do plugin.';
  }
  if (status === 'KIT_PENDING') {
    return 'O inventário estava cheio. O plugin guardou o kit completo como pendente e avisou o jogador para liberar pelo menos um espaço. Depois de liberar espaço, ele deve usar /dk claim.';
  }
  const messages = {
    KIT_DELIVERED: 'O plugin confirmou a entrega do kit.',
    PLAYER_OFFLINE: 'O jogador está offline, mas o plugin recusou colocar o kit na fila. Ative kits.require-online: false no config.yml do plugin e repita a entrega.',
    KIT_NOT_FOUND: 'O kit não foi encontrado no servidor. A equipe precisa conferir se ele ainda existe no plugin.',
    PLATFORM_MISMATCH: 'O Floodgate não identificou essa conexão como Bedrock. Confira a gamertag e a conexão pelo Geyser.',
    PLATFORM_UNVERIFIABLE: 'O servidor não conseguiu verificar a conta Bedrock. Confira se o Floodgate está instalado e ativo.',
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

async function processApprovedDelivery(channel, ticket, options = {}) {
  if (!ticket?.channelId) throw new Error('Ticket inválido para iniciar entrega.');
  const alreadyHeld = deliveryAttemptsInFlight.has(ticket.channelId);
  if (alreadyHeld && options.lockAlreadyHeld !== true) {
    return { skipped: true, reason: 'delivery_in_flight' };
  }
  if (!alreadyHeld) deliveryAttemptsInFlight.add(ticket.channelId);
  try {
    return await processApprovedDeliveryInternal(channel, ticket, options);
  } finally {
    deliveryAttemptsInFlight.delete(ticket.channelId);
  }
}

async function processApprovedDeliveryInternal(channel, ticket, { newRequest = false, interaction = null, recovery = false } = {}) {
  const retryableFinalFailures = new Set([
    'PLAYER_OFFLINE',
    'PLATFORM_MISMATCH',
    'PLATFORM_UNVERIFIABLE',
    'KIT_NOT_FOUND',
    'KIT_DISABLED',
    'INVENTORY_FULL',
    'DELIVERY_DISABLED',
    'KIT_CORRUPT',
    'INVALID_REQUEST'
  ]);
  if (ticket.deliveryStatus === 'KIT_PENDING' || ticket.deliveryStatus === 'KIT_DELIVERED') {
    throw new Error('Este pedido já está pendente/entregue e não pode gerar outra entrega.');
  }
  const previousPluginTimedOut = ticket.deliveryStatus === 'TIMEOUT'
    && (ticket.deliveryPluginFinal === true || getBridgeJob(ticket.deliveryRequestId || '')?.result?.status === 'TIMEOUT');
  if (newRequest && !retryableFinalFailures.has(ticket.deliveryStatus) && !previousPluginTimedOut) {
    throw new Error('Não é seguro criar outro request_id para o estado ' + String(ticket.deliveryStatus || 'desconhecido') + '.');
  }
  const requestId = newRequest
    ? 'ticket-' + ticket.channelId + '-' + randomUUID().slice(0, 8)
    : (ticket.deliveryRequestId || 'ticket-' + ticket.channelId);
  const persistedJob = getBridgeJob(ticket.deliveryRequestId || requestId);
  const requestPlatform = newRequest ? 'bedrock' : (persistedJob?.payload?.platform || ticket.platform || 'bedrock');
  const current = updateTicket(ticket.channelId, {
    deliveryRequestId: requestId,
    platform: requestPlatform,
    deliveryStatus: 'QUEUED',
    deliveryUpdatedAt: new Date().toISOString(),
    deliveryError: null,
    deliveryPluginFinal: false,
    deliveryResultNotificationPending: true,
    deliveryResultNotificationSent: false
  }) || ticket;
  appendTicketHistory(ticket.channelId, {
    type: 'delivery_queued',
    eventId: 'delivery-queued:' + requestId,
    requestId,
    player: current.minecraftNick,
    platform: current.platform,
    kit: current.kitName,
    newAttempt: newRequest === true
  });

  // A primeira mensagem de resultado será enviada apenas depois da resposta do plugin.

  let result;
  try {
    result = await deliverWithTimeoutRetry({
      requestId,
      player: current.minecraftNick,
      platform: current.platform,
      kit: current.kitName,
      guildId: current.guildId,
      ticketId: current.channelId,
      timeoutMs: 60000
    });
  } catch (error) {
    const timedOut = error.code === 'BRIDGE_TIMEOUT';
    const nextStatus = timedOut ? 'TIMEOUT' : 'WAITING';
    updateTicket(ticket.channelId, {
      deliveryStatus: nextStatus,
      deliveryError: String(error.message || 'Falha ao solicitar a entrega.'),
      deliveryPluginFinal: false,
      deliveryUpdatedAt: new Date().toISOString()
    });
    appendTicketHistory(ticket.channelId, {
      type: 'delivery_transport_error',
      requestId,
      status: nextStatus,
      message: String(error.message || '').slice(0, 500)
    });
    try {
      await channel.send({
        content: timedOut
          ? 'O Minecraft não respondeu nas duas tentativas automáticas. O mesmo identificador foi mantido e o pedido continua salvo. A equipe pode consultar ou tentar novamente com o mesmo ID.'
          : 'A conexão com o Minecraft está indisponível. O pedido permanece salvo para recuperação; não crie outra compra.',
        components: [makeDeliveryRetryControls('same')]
      });
    } catch (notificationError) {
      console.error('[Asthen] Não foi possível publicar o aviso de falha de conexão:', notificationError.message);
    }
    try {
      await notifyStaffPrivately(
        interaction,
        (timedOut ? 'A entrega excedeu o tempo limite nas duas tentativas automáticas.' : 'Não foi possível alcançar a Bridge do Minecraft.') +
        ' O pedido foi preservado com o mesmo identificador. Detalhe técnico: ' +
        String(error.message || 'Sem resposta.')
      );
    } catch (staffError) {
      console.error('[Asthen] Não foi possível notificar a equipe sobre a falha de conexão:', staffError.message);
    }
    return;
  }

  const status = String(result.status || 'UNKNOWN');
  const resultAt = new Date().toISOString();
  updateTicket(ticket.channelId, {
    deliveryStatus: status,
    deliveryResponse: String(result.message || ''),
    deliveryUpdatedAt: resultAt,
    deliveryError: null,
    deliveryPluginFinal: true,
    deliveryResultNotificationSent: false
  });
  appendTicketHistory(ticket.channelId, {
    type: 'delivery_result',
    eventId: 'delivery-result:' + requestId,
    requestId,
    status,
    message: String(result.message || '').slice(0, 500),
    at: resultAt
  });

  const success = status === 'KIT_DELIVERED' || status === 'KIT_PENDING';
  const pluginFinalTimeout = status === 'TIMEOUT'
    && getBridgeJob(requestId)?.result?.status === 'TIMEOUT';
  const canRetryWithNewRequest = retryableFinalFailures.has(status) || pluginFinalTimeout;
  try {
    await channel.send({
      content: makeDeliveryMessage({
        ...result,
        status,
        userId: ticket.userId,
        player: result.player || current.minecraftNick,
        kitDisplayName: current.kitDisplayName,
        kit: current.kitName,
        message: friendlyDeliveryMessage(status, result.message),
        pendingReason: status === 'KIT_PENDING' && /offline/i.test(String(result.message || '')) ? 'offline' : 'inventory'
      }),
      ...(success ? {} : canRetryWithNewRequest ? { components: [makeDeliveryRetryControls('new')] } : {}),
      allowedMentions: { users: [ticket.userId], roles: [] }
    });
    updateTicket(ticket.channelId, {
      deliveryResultNotificationPending: false,
      deliveryResultNotificationSent: true,
      deliveryNotificationError: null
    });


  } catch (notificationError) {
    // The Minecraft result is already final. Never relabel a delivered kit as WAITING
    // merely because Discord failed to publish the embed.
    updateTicket(ticket.channelId, {
      deliveryResultNotificationPending: true,
      deliveryResultNotificationSent: false,
      deliveryNotificationError: String(notificationError.message || 'Falha ao notificar o ticket.')
    });
    console.error('[Asthen] A entrega foi processada, mas o embed do resultado não pôde ser publicado:', notificationError.message);
    try {
      await notifyStaffPrivately(interaction, 'A entrega respondeu com status ' + status +
        ', mas a mensagem de resultado não foi publicada no ticket. Request ID: ' + requestId);
    } catch (staffError) {
      console.error('[Asthen] Não foi possível notificar a equipe sobre a falha de mensagem:', staffError.message);
    }
  }

  if (!success) {
    try {
      await notifyStaffPrivately(
        interaction,
        'A entrega não foi concluída. Status: ' + status + '. ' +
        String(result.message || 'Confira a configuração do plugin.') +
        '\nO pedido foi preservado.'
      );
    } catch (staffError) {
      console.error('[Asthen] Não foi possível notificar a equipe sobre o resultado da entrega:', staffError.message);
    }
  }
}

async function setLegacyTicketPlatform(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop' || ticket.orderStatus !== 'approved') {
    return replyPrivate(interaction, 'Este canal não contém um pedido aprovado que precise da migração.');
  }
  if (!isStaff(interaction, getGuildConfig(interaction.guildId))) {
    return replyPrivate(interaction, 'Somente a equipe autorizada pode atualizar este pedido.');
  }
  const existingJob = getBridgeJob(ticket.deliveryRequestId || '');
  const platform = existingJob?.payload?.platform || 'bedrock';
  updateTicket(interaction.channelId, { platform });
  await interaction.reply({
    content: 'Este pedido foi migrado para Bedrock. Uma entrega já enfileirada mantém o payload original.',
    flags: MessageFlags.Ephemeral
  });
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
  if (deliveryAttemptsInFlight.has(ticket.channelId)) {
    return replyPrivate(interaction, 'Já existe uma tentativa de entrega em andamento para este pedido.');
  }
  if (ticket.deliveryStatus === 'KIT_PENDING') {
    return replyPrivate(interaction, 'O kit já está guardado no Minecraft. Não crie outra entrega; o plugin atualizará este pedido quando o jogador retirar a pendência.');
  }
  if (ticket.deliveryStatus === 'KIT_DELIVERED') {
    return replyPrivate(interaction, 'O plugin já confirmou a entrega deste kit. Uma nova tentativa não será criada.');
  }
  if (mode !== 'same' && mode !== 'new') {
    return replyPrivate(interaction, 'Modo de tentativa inválido.');
  }
  if (mode === 'same' && !ticket.deliveryRequestId) {
    return replyPrivate(interaction, 'Não encontrei o identificador da entrega anterior. A equipe precisa revisar o histórico antes de criar outra tentativa.');
  }

  const retryableFinalFailures = new Set([
    'PLAYER_OFFLINE',
    'PLATFORM_MISMATCH',
    'PLATFORM_UNVERIFIABLE',
    'KIT_NOT_FOUND',
    'KIT_DISABLED',
    'INVENTORY_FULL',
    'DELIVERY_DISABLED',
    'KIT_CORRUPT',
    'INVALID_REQUEST'
  ]);
  const previousJob = getBridgeJob(ticket.deliveryRequestId || '');
  const previousPluginTimedOut = ticket.deliveryStatus === 'TIMEOUT'
    && (ticket.deliveryPluginFinal === true || previousJob?.result?.status === 'TIMEOUT');
  if (mode === 'new' && !retryableFinalFailures.has(ticket.deliveryStatus) && !previousPluginTimedOut) {
    return replyPrivate(interaction,
      'Não é seguro criar outro request_id para este estado (' + String(ticket.deliveryStatus || 'desconhecido') +
      '). Se o timeout foi apenas de comunicação, reutilize o mesmo identificador; uma nova tentativa só é segura após TIMEOUT final confirmado pelo plugin.');
  }

  deliveryAttemptsInFlight.add(ticket.channelId);
  try {
    await interaction.reply({
      content: mode === 'new'
        ? 'Uma nova tentativa foi autorizada após falha final confirmada.'
        : 'A tentativa será reenviada com o mesmo identificador, sem criar outra compra.',
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    deliveryAttemptsInFlight.delete(ticket.channelId);
    throw error;
  }
  void processApprovedDelivery(interaction.channel, ticket, {
    newRequest: mode === 'new',
    interaction,
    lockAlreadyHeld: true
  }).catch(error => {
    console.error('[Asthen] Falha ao tentar entregar o kit:', error);
  });
}

async function openSupportTicket(interaction, kind) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const player = getPlayerRegistration(interaction.user.id);
  const result = await createPrivateTicket({
    guild: interaction.guild,
    user: interaction.user,
    type: kind,
    minecraftNick: player?.minecraft_nick || null
  });

  if (!result.alreadyOpen) {
    const config = getGuildConfig(interaction.guildId);
    const staffMention = config.staffRoleId ? '<@&' + config.staffRoleId + '>' : '';
    await result.channel.send({
      content: staffMention || undefined,
      embeds: [makeSupportTicketEmbed(kind, interaction.user, player?.minecraft_nick || '')],
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

async function handleRegistrationSubmit(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, 'Use o registro dentro do servidor ASTHEN.');
  const minecraftNick = interaction.fields.getTextInputValue('minecraft-nick');
  if (!validateMinecraftNick(minecraftNick)) {
    return replyPrivate(interaction, 'Informe um nick Minecraft válido, sem espaços no começo/fim e com até 32 caracteres.');
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    validateRegistrationForMember(member, minecraftNick);

    const now = Date.now();
    for (const [token, pending] of pendingRegistrations) {
      if (pending.expiresAt <= now) pendingRegistrations.delete(token);
    }
    const token = randomUUID();
    pendingRegistrations.set(token, {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      minecraftNick,
      expiresAt: now + PENDING_REGISTRATION_TTL_MS,
      processing: false
    });

    const previous = getPlayerRegistration(interaction.user.id);
    return interaction.reply({
      content:
        '**Confira seu registro Minecraft**\n' +
        'Nick informado: **' + minecraftNick + '**\n\n' +
        (previous ? 'Você já possui um registro. Esta confirmação atualizará o nick vinculado.' : 'Ao confirmar, seu Discord será vinculado a esse nick.') +
        '\n\nClique em **Confirmar e liberar acesso** para concluir. Depois da confirmação final, aguarde 3 segundos: o cargo Membro será aplicado e este canal ficará oculto automaticamente para você. **O canal não será apagado do servidor.**',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('registration:confirm:' + token)
          .setLabel('Confirmar e liberar acesso')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('registration:cancel:' + token)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary)
      )],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    return replyPrivate(interaction, error.message || 'Não foi possível preparar seu registro Minecraft.');
  }
}

async function handleRegistrationConfirmation(interaction, token) {
  const pending = pendingRegistrations.get(token);
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingRegistrations.delete(token);
    return interaction.update({
      content: 'Esta confirmação expirou. Clique em Registrar Minecraft para iniciar novamente.',
      embeds: [],
      components: []
    });
  }
  if (pending.userId !== interaction.user.id || pending.guildId !== interaction.guildId) {
    return replyPrivate(interaction, 'Esta confirmação pertence a outro usuário.');
  }
  if (pending.processing) {
    return replyPrivate(interaction, 'Seu registro já está sendo processado. Aguarde a confirmação.');
  }

  pending.processing = true;
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    validateRegistrationForMember(member, pending.minecraftNick);
  } catch (error) {
    pendingRegistrations.delete(token);
    return interaction.update({
      content: 'Não foi possível confirmar esse registro: ' + (error.message || 'Confira o nick e tente novamente.'),
      embeds: [],
      components: []
    });
  }

  await interaction.update({
    content:
      '**Confirmação final recebida.**\n\n' +
      'Aguarde **3 segundos**. O ASTHEN vai liberar o cargo Membro; assim que ele for aplicado, este canal ficará automaticamente oculto para você. **O canal não será excluído do servidor.**',
    embeds: [],
    components: []
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await registerPlayerForMember(member, pending.minecraftNick, 'autoatendimento');
    pendingRegistrations.delete(token);

    if (result.sync.errors.length) {
      return interaction.editReply({
        content:
          '**Nick salvo, mas a liberação ficou pendente.**\n' +
          'Nick: **' + result.record.minecraft_nick + '**\n' +
          result.sync.errors.map(item => '• ' + item).join('\n') +
          '\nA equipe foi avisada. O canal continuará acessível enquanto o cargo não for aplicado.',
        embeds: [],
        components: []
      });
    }

    return interaction.editReply({
      content:
        '**Registro concluído!**\n' +
        'Nick Minecraft: **' + result.record.minecraft_nick + '**\n' +
        'Cargo Membro liberado. O canal de registro vai desaparecer automaticamente da sua lista porque esse cargo não tem acesso a ele. O canal continua existindo para novos membros.',
      embeds: [],
      components: []
    });
  } catch (error) {
    pendingRegistrations.delete(token);
    console.error('[Asthen Registro] Falha ao concluir confirmação:', error);
    return interaction.editReply({
      content: 'Não foi possível concluir a liberação do cargo. A equipe precisa verificar o registro; tente novamente mais tarde.',
      embeds: [],
      components: []
    });
  }
}

async function handleRegistrationCancellation(interaction, token) {
  const pending = pendingRegistrations.get(token);
  if (!pending || pending.userId !== interaction.user.id || pending.guildId !== interaction.guildId) {
    return replyPrivate(interaction, 'Esta confirmação expirou ou não pertence a você.');
  }
  pendingRegistrations.delete(token);
  return interaction.update({
    content: 'Registro cancelado. Nenhuma alteração foi feita. Clique em Registrar Minecraft para tentar novamente.',
    embeds: [],
    components: []
  });
}

async function handleTikTokCommand(interaction) {
  if (!isAdministrator(interaction)) {
    return replyPrivate(interaction, 'Somente administradores podem publicar vídeos no canal de novidades.');
  }
  if (normalizeChannelName(interaction.channel?.name) !== 'comandosadm') {
    return replyPrivate(interaction, 'Use este comando no canal #comandos-adm. O vídeo será enviado automaticamente para #vídeos-novos.');
  }

  const link = interaction.options.getString('link', true);
  const frame = interaction.options.getAttachment('frame', false);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await publishTikTokVideo(interaction.guild, link, frame);
    const frameText = result.frameAttached
      ? 'A imagem enviada foi incluída no card.'
      : 'O card foi publicado sem imagem de capa.';
    return interaction.editReply(
      '**Publicação no ar em #' + result.channel.name + '!**\n' +
      (result.title ? '**' + result.title.replace(/[*_~|]/g, '') + '**\n' : '') +
      frameText + '\n[Ver anúncio no Discord](' + result.message.url + ')'
    );
  } catch (error) {
    console.error('[Asthen TikTok] Falha ao publicar vídeo:', error);
    return interaction.editReply('**Não foi possível publicar.** ' + (error.message || 'Confira o link e tente novamente.'));
  }
}
async function handleAdminCommand(interaction) {
  const group = interaction.options.getSubcommandGroup();
  if (group === 'videos') return handleTikTokCommand(interaction);
  if (group === 'backup') return handleBackupCommand(interaction);
  if (group === 'minecraft') return handleBridgeCommand(interaction);
  return replyPrivate(interaction, 'Grupo administrativo desconhecido.');
}

async function handleCommand(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, 'Use este comando dentro do servidor.');
  if (interaction.commandName === 'kit') return handleKitCommand(interaction);
  if (interaction.commandName === 'admin') return handleAdminCommand(interaction);
}

export async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) return handleCommand(interaction);

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('registration:confirm:')) {
      return handleRegistrationConfirmation(interaction, interaction.customId.split(':').at(-1));
    }
    if (interaction.customId.startsWith('registration:cancel:')) {
      return handleRegistrationCancellation(interaction, interaction.customId.split(':').at(-1));
    }
    if (interaction.customId === 'registration:open') {
      const player = getPlayerRegistration(interaction.user.id);
      return interaction.showModal(makeMinecraftNickModal('registration:submit', player?.minecraft_nick || ''));
    }
    if (interaction.customId.startsWith('support:open:')) {
      return openSupportTicket(interaction, interaction.customId.split(':')[2]);
    }

    if (interaction.customId === 'shop:catalog') return openCatalog(interaction);
    if (interaction.customId.startsWith('shop:page:')) {
      return handleCatalogPage(interaction, Number(interaction.customId.split(':')[2]));
    }
    if (interaction.customId.startsWith('kit:admin-page:edit:')) {
      return handleKitAdminPage(interaction, Number(interaction.customId.split(':')[3]));
    }
    if (interaction.customId.startsWith('kit:store-delete:confirm:')) return handleKitStoreDeleteConfirm(interaction);
    if (interaction.customId.startsWith('kit:store-delete:cancel:')) return handleKitStoreDeleteCancel(interaction);
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
      const player = getPlayerRegistration(interaction.user.id);
      return interaction.showModal(makeMinecraftNickModal('registration:submit', player?.minecraft_nick || ''));
    }
    if (interaction.customId.startsWith('shop:edit-platform:')) {
      return forcePurchaseBedrock(interaction, interaction.customId.split(':').at(-1));
    }
    if (interaction.customId.startsWith('shop:platform:')) {
      return forcePurchaseBedrock(interaction, interaction.customId.split(':').at(-1));
    }
    if (interaction.customId.startsWith('delivery:set-platform:')) {
      return setLegacyTicketPlatform(interaction);
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
    if (interaction.customId === 'order:release-stock') return requestStockRelease(interaction);
    if (interaction.customId.startsWith('delivery:retry:')) {
      return retryApprovedDelivery(interaction, interaction.customId.split(':')[2]);
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'support:select') {
    return openSupportTicket(interaction, interaction.values[0]);
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('shop:select')) {
    return handleCatalogSelection(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'kit:edit-select') {
    return handleKitAdminSelection(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('kit:edit-field:')) {
    return handleKitEditFieldSelection(interaction);
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'registration:submit') return handleRegistrationSubmit(interaction);
    if (interaction.customId === 'order:release-stock:submit') return submitStockRelease(interaction);
    if (interaction.customId.startsWith('kit:edit-modal:')) return handleKitEditModal(interaction);
  }}

/**
 * Reattaches to durable bridge jobs after a bot restart. If a crash occurred
 * after the ticket was marked QUEUED but before the job was persisted, it
 * recreates the job using the same deterministic request_id.
 */
export async function recoverApprovedDeliveries(client) {
  const recoverableStatuses = new Set([undefined, null, 'QUEUED', 'TIMEOUT', 'WAITING']);
  const candidates = listTickets().filter(ticket =>
    ticket.type === 'shop'
    && ticket.status !== 'closed'
    && ticket.orderStatus === 'approved'
    && recoverableStatuses.has(ticket.deliveryStatus)
  );

  for (const ticket of candidates) {
    if (deliveryAttemptsInFlight.has(ticket.channelId)) continue;
    const requestId = ticket.deliveryRequestId || ('ticket-' + ticket.channelId);
    const job = getBridgeJob(requestId);
    if (job?.result) continue; // the Bridge replays the persisted result to the ticket handler
    const platform = job?.payload?.platform || ticket.platform || 'bedrock';
    if (ticket.platform !== platform) updateTicket(ticket.channelId, { platform });

    const guild = client.guilds.cache.get(ticket.guildId)
      ?? await client.guilds.fetch(ticket.guildId).catch(() => null);
    if (!guild) continue;
    const channel = guild.channels.cache.get(ticket.channelId)
      ?? await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.send) continue;

    try {
      await processApprovedDelivery(channel, { ...ticket, platform }, { recovery: true });
    } catch (error) {
      console.error('[Asthen] Não foi possível retomar a entrega ' + requestId + ':', error.message);
    }
  }
}
