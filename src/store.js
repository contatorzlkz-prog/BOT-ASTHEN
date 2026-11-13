import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const dataFile = path.join(dataDir, 'state.json');

const demoKits = () => [
  { id: 'demo-kit-1', name: 'Kit Demo 1', price: 'R$ 5,00', description: 'Kit de demonstração. Edite ou remova antes de usar.' },
  { id: 'demo-kit-2', name: 'Kit Demo 2', price: 'R$ 10,00', description: 'Kit de demonstração. Edite ou remova antes de usar.' },
  { id: 'demo-kit-3', name: 'Kit Demo 3', price: 'R$ 15,00', description: 'Kit de demonstração. Edite ou remova antes de usar.' }
];

const emptyState = () => ({ guilds: {}, tickets: {} });
let state = emptyState();

function defaultGuildConfig() {
  return {
    supportPanelChannelId: null,
    supportPanelMessageId: null,
    supportCategoryId: null,
    shopPanelChannelId: null,
    shopPanelMessageId: null,
    shopCategoryId: null,
    staffRoleId: null,
    pixKey: null,
    pixInstructions: '',
    kits: demoKits(),
    demoKitsLoaded: true
  };
}

function ensureGuildConfig(guildId) {
  if (!state.guilds[guildId]) state.guilds[guildId] = defaultGuildConfig();
  const config = state.guilds[guildId];
  const defaults = defaultGuildConfig();

  // Adiciona os exemplos apenas uma vez na migração de configurações antigas.
  if (!('demoKitsLoaded' in config)) {
    if (Array.isArray(config.kits) && config.kits.length === 0) config.kits = demoKits();
    config.demoKitsLoaded = true;
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in config)) config[key] = value;
  }

  // Migra a configuração antiga: os canais de painel já indicavam o destino dos tickets.
  if (!config.supportCategoryId && config.supportPanelChannelId) {
    config.supportCategoryId = null;
  }
  if (!config.shopCategoryId && config.shopPanelChannelId) {
    config.shopCategoryId = null;
  }
  return config;
}

export function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    state = {
      guilds: parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {},
      tickets: parsed.tickets && typeof parsed.tickets === 'object' ? parsed.tickets : {}
    };
    for (const guildId of Object.keys(state.guilds)) ensureGuildConfig(guildId);
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
  if (config.kits.length >= 25) throw new Error('A loja já tem 25 kits. Remova um antes de adicionar outro.');
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

export function findOpenTicket(guildId, userId, type = null) {
  return Object.values(state.tickets).find(ticket => {
    if (ticket.guildId !== guildId || ticket.userId !== userId || ticket.status === 'closed') return false;
    if (type === 'shop') return ticket.type === 'shop';
    if (type === 'support') return ticket.type !== 'shop';
    return true;
  }) ?? null;
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
