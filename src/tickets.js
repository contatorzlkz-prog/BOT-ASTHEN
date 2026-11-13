import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { findOpenTicket, getGuildConfig, saveTicket } from './store.js';

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 35) || 'membro';
}

export async function createPrivateTicket({ guild, user, type, kit = null, nickname = null }) {
  const config = getGuildConfig(guild.id);
  const categoryId = type === 'shop' ? config.shopCategoryId : config.supportCategoryId;

  if (!categoryId) {
    throw new Error(type === 'shop'
      ? 'A categoria da loja ainda não foi configurada. Peça à equipe para usar /asthen categoria loja.'
      : 'A categoria de suporte ainda não foi configurada. Peça à equipe para usar /asthen categoria suporte.');
  }
  if (!config.staffRoleId) {
    throw new Error('O cargo da equipe ainda não foi configurado. Peça à equipe para usar /asthen cargo-admin.');
  }

  const category = guild.channels.cache.get(categoryId);
  const staffRole = guild.roles.cache.get(config.staffRoleId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('A categoria configurada não existe mais. A equipe precisa configurá-la novamente.');
  }
  if (!staffRole) {
    throw new Error('O cargo da equipe configurado não existe mais. A equipe precisa configurá-lo novamente.');
  }

  const existing = findOpenTicket(guild.id, user.id);
  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channelId);
    if (existingChannel) {
      return { channel: existingChannel, alreadyOpen: true };
    }
  }

  const ticketLabel = type === 'shop' ? 'pedido' : `suporte-${slug(type)}`;
  const channelName = `${ticketLabel}-${slug(user.username)}`.slice(0, 90);
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
    },
    {
      id: staffRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

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

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `TICKET|type:${type}|owner:${user.id}`,
    permissionOverwrites: permissions,
    reason: `Ticket Asthen aberto por ${user.tag ?? user.username}`
  });

  const ticket = {
    channelId: channel.id,
    guildId: guild.id,
    userId: user.id,
    type,
    kitId: kit?.id ?? null,
    kitName: kit?.name ?? null,
    nickname,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  saveTicket(ticket);
  return { channel, alreadyOpen: false, ticket };
}

export function formatTicketTranscript(messages, ticket) {
  const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [
    'ASTHEN — TRANSCRIÇÃO DE TICKET',
    `Canal: ${ticket.channelId}`,
    `Servidor: ${ticket.guildId}`,
    `Criado por: ${ticket.userId}`,
    `Tipo: ${ticket.type}`,
    `Aberto em: ${ticket.createdAt}`,
    '----------------------------------------'
  ];

  for (const message of ordered) {
    const date = new Date(message.createdTimestamp).toISOString();
    const content = message.content?.replace(/\s+/g, ' ').trim() || '[sem texto]';
    lines.push(`[${date}] ${message.author?.tag ?? message.author?.username ?? 'Usuário'}: ${content}`);
    for (const attachment of message.attachments.values()) {
      lines.push(`  Anexo: ${attachment.url}`);
    }
  }
  return lines.join('\n');
}
