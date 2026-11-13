import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const dataFile = path.join(dataDir, 'state.json');

const emptyState = () => ({ guilds: {}, tickets: {} });
let state = emptyState();

function ensureGuildConfig(guildId) {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = {
      supportCategoryId: null,
      shopCategoryId: null,
      staffRoleId: null,
      supportPanelChannelId: null,
      shopPanelChannelId: null,
      logChannelId: null,
      pixKey: null,
      pixInstructions: '',
      kits: []
    };
  }
  return state.guilds[guildId];
}

export function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    state = {
      guilds: parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {},
      tickets: parsed.tickets && typeof parsed.tickets === 'object' ? parsed.tickets : {}
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[Asthen] Não foi possível ler data/state.json. Um estado novo será criado.', error);
    }
    state = emptyState();
  }
  saveStore();
}

export function saveStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temporaryFile, dataFile);
}

export function getGuildConfig(guildId) {
  return ensureGuildConfig(guildId);
}

export function updateGuildConfig(guildId, changes) {
  const config = ensureGuildConfig(guildId);
  Object.assign(config, changes);
  saveStore();
  return config;
}

export function addKit(guildId, kit) {
  const config = ensureGuildConfig(guildId);
  config.kits.push(kit);
  saveStore();
}

export function removeKit(guildId, kitId) {
  const config = ensureGuildConfig(guildId);
  const before = config.kits.length;
  config.kits = config.kits.filter(kit => kit.id !== kitId);
  saveStore();
  return config.kits.length !== before;
}

export function getTicket(channelId) {
  return state.tickets[channelId] ?? null;
}

export function findOpenTicket(guildId, userId) {
  return Object.values(state.tickets).find(ticket =>
    ticket.guildId === guildId && ticket.userId === userId && ticket.status === 'open'
  ) ?? null;
}

export function saveTicket(ticket) {
  state.tickets[ticket.channelId] = ticket;
  saveStore();
}

export function updateTicket(channelId, changes) {
  const ticket = state.tickets[channelId];
  if (!ticket) return null;
  Object.assign(ticket, changes);
  saveStore();
  return ticket;
}
