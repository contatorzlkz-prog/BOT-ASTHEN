import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const dataFile = path.join(dataDir, 'state.json');

const demoKits = () => [
  { id: 'demo-kit-1', name: 'Kit Demo 1', price: 'R$ 5,00', description: 'Kit de demonstração. Edite ou remova antes de abrir a loja.' },
  { id: 'demo-kit-2', name: 'Kit Demo 2', price: 'R$ 10,00', description: 'Kit de demonstração. Edite ou remova antes de abrir a loja.' },
  { id: 'demo-kit-3', name: 'Kit Demo 3', price: 'R$ 15,00', description: 'Kit de demonstração. Edite ou remova antes de abrir a loja.' }
];

const emptyState = () => ({ guilds: {}, tickets: {}, purchaseDrafts: {} });
let state = emptyState();

function defaultGuildConfig() {
  return {
    supportPanelChannelId: null,
    supportPanelMessageId: null,
    supportCategoryId: null,
    shopPanelChannelId: null,
    shopPanelMessageId: null,
    shopCategoryId: null,
    logsChannelId: null,
    buyersChannelId: null,
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

  if (!('demoKitsLoaded' in config)) {
    if (Array.isArray(config.kits) && config.kits.length === 0) config.kits = demoKits();
    config.demoKitsLoaded = true;
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in config)) config[key] = value;
  }
  return config;
}

export function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    state = {
      guilds: parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {},
      tickets: parsed.tickets && typeof parsed.tickets === 'object' ? parsed.tickets : {},
      purchaseDrafts: parsed.purchaseDrafts && typeof parsed.purchaseDrafts === 'object'
        ? parsed.purchaseDrafts
        : {}
    };
    for (const guildId of Object.keys(state.guilds)) ensureGuildConfig(guildId);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[Asthen] O arquivo data/state.json não pôde ser lido. Um estado novo será criado.', error);
    }
    state = emptyState();
  }
  saveStore();
}

export function saveStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryFile = dataFile + '.tmp';
  const contents = JSON.stringify(state, null, 2) + '\n';
  try {
    const descriptor = fs.openSync(temporaryFile, 'w');
    try {
      fs.writeFileSync(descriptor, contents, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporaryFile, dataFile);
  } catch (error) {
    try { fs.rmSync(temporaryFile, { force: true }); } catch {}
    throw new Error('Falha ao salvar data/state.json: ' + error.message);
  }
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

function purchaseDraftKey(guildId, userId) {
  return guildId + ':' + userId;
}

export function getPurchaseDraft(guildId, userId) {
  return state.purchaseDrafts[purchaseDraftKey(guildId, userId)] ?? null;
}

export function savePurchaseDraft(guildId, userId, draft) {
  state.purchaseDrafts[purchaseDraftKey(guildId, userId)] = {
    ...draft,
    guildId,
    userId,
    updatedAt: new Date().toISOString()
  };
  saveStore();
  return state.purchaseDrafts[purchaseDraftKey(guildId, userId)];
}

export function deletePurchaseDraft(guildId, userId) {
  const key = purchaseDraftKey(guildId, userId);
  const existed = Boolean(state.purchaseDrafts[key]);
  delete state.purchaseDrafts[key];
  if (existed) saveStore();
  return existed;
}
