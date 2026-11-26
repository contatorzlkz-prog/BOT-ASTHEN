import { ChannelType } from 'discord.js';

export const STANDARD_CHANNELS = Object.freeze([
  { key: 'supportPanelChannelId', name: 'atendimento' },
  { key: 'shopPanelChannelId', name: 'kits' },
  { key: 'logsChannelId', name: 'logs' },
  { key: 'buyersChannelId', name: 'compradores' },
  { key: 'registrationChannelId', name: 'registro' }
]);

export function normalizeChannelName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Finds standard channels by their final name, ignoring emoji and separators. */
export function discoverStandardChannels(channels) {
  const list = Array.from(channels?.values?.() ?? channels ?? []);
  const found = {};

  for (const binding of STANDARD_CHANNELS) {
    const channel = list.find(item =>
      item?.type === ChannelType.GuildText &&
      normalizeChannelName(item.name) === binding.name
    );
    if (channel) found[binding.key] = channel.id;
  }

  return found;
}

export function messageHasPanel(message, customId, botUserId) {
  if (!message || !customId || !botUserId || message.author?.id !== botUserId) return false;
  const acceptedIds = new Set([customId]);
  if (customId === 'shop:select:0') acceptedIds.add('shop:catalog');
  return Boolean(message.components?.some(row =>
    row.components?.some(component =>
      acceptedIds.has(component.customId || component.data?.custom_id)
    )
  ));
}
