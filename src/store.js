import { randomUUID } from 'node:crypto';
import { scheduleSupabaseSync, scheduleSupabaseKitsSync, initializeSupabaseSync } from './supabase.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const dataFile = path.join(dataDir, 'state.json');

function normalizeKitName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function makeKitDisplayName(name) {
  return String(name || 'Kit')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

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
    kits: [],
    hiddenPluginKits: []
  };
}

function ensureGuildConfig(guildId) {
  if (!state.guilds[guildId]) state.guilds[guildId] = defaultGuildConfig();
  const config = state.guilds[guildId];
  const defaults = defaultGuildConfig();

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in config)) config[key] = value;
  }

  if (!Array.isArray(config.kits)) config.kits = [];
  if (!Array.isArray(config.hiddenPluginKits)) config.hiddenPluginKits = [];

  // Pix is fixed for this store; discard values left by the old /pix command.
  delete config.pixKey;
  delete config.pixInstructions;

  // Preserve all existing products. Missing plugin kits are marked unavailable by syncPluginKits.
  config.hiddenPluginKits = [];
  config.kits = config.kits.map(kit => ({
    ...kit,
    displayName: kit.displayName || makeKitDisplayName(kit.name),
    description: String(kit.description || ''),
    imageUrl: String(kit.imageUrl || ''),
    price: String(kit.price || ''),
    manuallyUnavailable: kit.manuallyUnavailable === true,
    missingFromPlugin: kit.missingFromPlugin === true,
    pluginEnabled: typeof kit.pluginEnabled === 'boolean' ? kit.pluginEnabled : kit.enabled !== false,
    enabled: kit.enabled !== false && kit.manuallyUnavailable !== true
  }));

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
  saveStore({ syncRemote: false });
}

export function saveStore({ syncRemote = true } = {}) {
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
    if (syncRemote) {
      const snapshot = JSON.parse(contents);
      scheduleSupabaseSync(snapshot);
      scheduleSupabaseKitsSync(snapshot);
    }
  } catch (error) {
    try { fs.rmSync(temporaryFile, { force: true }); } catch {}
    throw new Error('Falha ao salvar data/state.json: ' + error.message);
  }
}

export async function initializeStoreSync() {
  const result = await initializeSupabaseSync({
    getSnapshot: () => JSON.parse(JSON.stringify(state)),
    applySnapshot: remote => {
      state = {
        guilds: remote.guilds || {},
        tickets: remote.tickets || {},
        purchaseDrafts: remote.purchaseDrafts || {}
      };
      for (const guildId of Object.keys(state.guilds)) ensureGuildConfig(guildId);
    },
    saveLocal: () => saveStore({ syncRemote: false })
  });
  const snapshot = JSON.parse(JSON.stringify(state));
  scheduleSupabaseKitsSync(snapshot);
  return result;
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
  if (config.kits.length >= 200) throw new Error('O catálogo já atingiu o limite de 200 kits.');
  if (config.kits.some(item => normalizeKitName(item.name) === normalizeKitName(kit.name))) {
    throw new Error('Já existe um kit com esse identificador.');
  }
  config.kits.push({
    ...kit,
    displayName: kit.displayName || makeKitDisplayName(kit.name),
    pluginManaged: Boolean(kit.pluginManaged)
  });
  saveStore();
}

export function updateKit(guildId, kitId, changes) {
  const config = ensureGuildConfig(guildId);
  const index = config.kits.findIndex(kit => kit.id === kitId);
  if (index < 0) return null;
  config.kits[index] = { ...config.kits[index], ...changes };
  saveStore();
  return config.kits[index];
}

export function removeKit(guildId, kitId) {
  const config = ensureGuildConfig(guildId);
  const index = config.kits.findIndex(kit => kit.id === kitId);
  if (index < 0) return false;

  // The old remove action now disables the product without deleting its data.
  config.kits[index] = {
    ...config.kits[index],
    enabled: false,
    manuallyUnavailable: true
  };
  saveStore();
  return true;
}

/**
 * Reconcile the plugin's complete list without deleting historical products.
 * Missing products remain in the store as unavailable. Optional plugin prices are supported.
 */
export function syncPluginKits(guildId, pluginKits) {
  const config = ensureGuildConfig(guildId);
  const incoming = Array.isArray(pluginKits)
    ? pluginKits.filter(item => item && typeof item.name === 'string'
      && /^[A-Za-z0-9_-]{1,32}$/.test(item.name))
    : null;
  if (!incoming) return { changed: false, kits: config.kits };

  const incomingByName = new Map();
  for (const item of incoming) incomingByName.set(normalizeKitName(item.name), item);

  const existingByName = new Map(config.kits.map(kit => [normalizeKitName(kit.name), kit]));
  const syncedKits = [];

  for (const item of incoming) {
    const key = normalizeKitName(item.name);
    const old = existingByName.get(key);
    const pluginEnabled = item.enabled === true;
    const manuallyUnavailable = old?.manuallyUnavailable === true;
    const hasPluginPrice = Object.prototype.hasOwnProperty.call(item, 'price') && item.price !== null;
    syncedKits.push({
      id: old?.id || randomUUID().slice(0, 12),
      name: item.name,
      displayName: old?.displayName || makeKitDisplayName(item.name),
      price: hasPluginPrice ? String(item.price).trim() : String(old?.price || ''),
      description: String(old?.description || ''),
      imageUrl: String(old?.imageUrl || ''),
      enabled: pluginEnabled && !manuallyUnavailable,
      pluginEnabled,
      manuallyUnavailable,
      missingFromPlugin: false,
      itemCount: Number.isFinite(Number(item.items)) ? Number(item.items) : (old?.itemCount || 0),
      pluginManaged: true
    });
  }

  const missingKits = config.kits
    .filter(kit => !incomingByName.has(normalizeKitName(kit.name)))
    .map(kit => ({
      ...kit,
      enabled: false,
      pluginEnabled: false,
      missingFromPlugin: true
    }));

  const next = [...syncedKits, ...missingKits];
  const beforeJson = JSON.stringify({ kits: config.kits, hidden: config.hiddenPluginKits });
  const afterJson = JSON.stringify({ kits: next, hidden: [] });
  if (beforeJson === afterJson) return { changed: false, kits: config.kits };

  config.kits = next;
  config.hiddenPluginKits = [];
  saveStore();
  return { changed: true, kits: config.kits };
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
