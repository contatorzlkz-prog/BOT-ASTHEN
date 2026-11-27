// Classificadores puros usados para identificar canais, cargos e donos de tickets.
// A configuração de cargos e permissões do Discord é mantida manualmente pelo servidor.

export function normalizePermissionName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const MANAGER_NAMES = new Set(['proprietario', 'gerhost', 'gerdiscord', 'gerserver']);
const PLATFORM_NAMES = new Set(['pc', 'mobile', 'console']);
const SERVICE_NAMES = new Set(['bot', 'asthinho', 'loritta', 'disboardorg']);
const ADMIN_CATEGORY_NAMES = new Set(['administracao', 'admin', 'moderacao', 'staff']);

export function classifyPermissionRole(value) {
  const name = normalizePermissionName(typeof value === 'string' ? value : value?.name);
  if (name === 'membro') return 'member';
  if (PLATFORM_NAMES.has(name)) return 'platform';
  if (MANAGER_NAMES.has(name)) return 'manager';
  if (name === 'staff') return 'staff';
  if (SERVICE_NAMES.has(name)) return 'service';
  if (name === 'booster') return 'booster';
  if (name.startsWith('ping')) return 'ping';
  return 'other';
}

export function classifyPermissionChannel({
  name,
  topic = '',
  parentName = '',
  channelId = '',
  registrationChannelId = ''
}) {
  const channel = normalizePermissionName(name);
  const parent = normalizePermissionName(parentName);
  if (channelId && registrationChannelId && channelId === registrationChannelId) return 'registration';
  if (channel === 'registro') return 'registration';
  if (channel === 'videosnovos') return 'video-feed';
  if (String(topic || '').startsWith('ASTHEN|type:')) return 'ticket';
  if (channel === 'logs') return 'logs';
  if (channel === 'comandosadm') return 'admin-command';
  if (channel === 'chatstaff' || channel === 'punicoes') return 'staff';
  if (ADMIN_CATEGORY_NAMES.has(parent)) return 'admin';
  return 'member';
}

export function ticketOwnerId(channel) {
  const match = String(channel?.topic || '').match(/(?:^|\|)owner:(\d{17,20})(?:\||$)/);
  return match ? match[1] : null;
}
