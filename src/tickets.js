import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { findOpenTicket, getGuildConfig, saveTicket, updateTicket } from './store.js';
import { CONFIG } from './config.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'membro';
}

export async function createPrivateTicket({ guild, user, type, kit = null, minecraftNick = null }) {
  const config = getGuildConfig(guild.id);
  const isShop = type === 'shop';
  const panelId = isShop ? config.shopPanelChannelId : config.supportPanelChannelId;

  if (!panelId) {
    throw new Error(isShop
      ? 'A loja ainda não foi configurada. Use /configurar e informe o canal da loja.'
      : 'O suporte ainda não foi configurado. Use /configurar e informe o canal de suporte.');
  }

  const existing = findOpenTicket(guild.id, user.id, isShop ? 'shop' : 'support');
  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channelId)
      ?? await guild.channels.fetch(existing.channelId).catch(() => null);
    if (existingChannel) return { channel: existingChannel, alreadyOpen: true };
    updateTicket(existing.channelId, { status: 'closed', closedAt: new Date().toISOString() });
  }

  const panelChannel = guild.channels.cache.get(panelId)
    ?? await guild.channels.fetch(panelId).catch(() => null);
  if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
    throw new Error('O canal configurado não existe mais. Execute /configurar novamente.');
  }

  const parent = panelChannel.parentId || null;
  if (parent && !guild.channels.cache.has(parent)) {
    throw new Error('A categoria do canal configurado não existe mais. Execute /configurar novamente.');
  }

  const staffRole = config.staffRoleId ? guild.roles.cache.get(config.staffRoleId) : null;
  const botMember = guild.members.me;
  const permissions = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (staffRole) {
    permissions.push({
      id: staffRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  if (botMember) {
    permissions.push({
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels
      ]
    });
  }

  const prefix = isShop ? 'pedido' : 'ticket';
  const channelName = (prefix + '-' + slug(user.username)).slice(0, 90);
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent,
    topic: 'ASTHEN|type:' + type + '|owner:' + user.id,
    permissionOverwrites: permissions,
    reason: 'Ticket aberto por ' + (user.tag ?? user.username)
  });

  const ticket = {
    channelId: channel.id,
    guildId: guild.id,
    userId: user.id,
    type,
    kitId: kit?.id ?? null,
    kitName: kit?.name ?? null,
    kitPrice: kit?.price ?? null,
    kitDescription: kit?.description ?? null,
    minecraftNick,
    orderStatus: isShop ? 'pending' : null,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  saveTicket(ticket);
  return { channel, alreadyOpen: false, ticket };
}

export async function archiveAndDeleteTicket({ channel, closedById }) {
  updateTicket(channel.id, {
    status: 'closed',
    closedBy: closedById,
    closedAt: new Date().toISOString()
  });

  await sleep(CONFIG.tickets.closeDelaySeconds * 1000);
  try {
    await channel.delete('Ticket fechado');
  } catch (error) {
    if (error?.code !== 10003) throw error;
  }
}
