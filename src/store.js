import { randomUUID } from 'node:crypto';
import { scheduleSupabaseSync, initializeSupabaseSync } from './supabase.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.ASTHEN_DATA_DIR?.trim() || path.resolve(currentDir, '../data'));
const dataFile = path.join(dataDir, 'state.json');

function secureLocalPath(target, mode) {
  // POSIX permission bits are meaningful on Linux/macOS. Windows uses inherited
  // NTFS ACLs; chmod there is not a reliable ACL-management mechanism.
  if (process.platform === 'win32') return;
  try { fs.chmodSync(target, mode); } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[Asthen] Não foi possível restringir permissões locais:', error.message);
  }
}

function ensureSecureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  secureLocalPath(dataDir, 0o700);
}

const emptyState = () => ({ guilds: {}, tickets: {}, purchaseDrafts: {}, players: {} });
let state = emptyState();
const pluginSyncedGuildsThisSession = new Set();

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

function formatBrlCents(cents) {
  const value = Number(cents);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 99999999) return '';
  return 'R$ ' + (value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function legacyPriceToCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > 999999.99) return null;
    return Math.round(value * 100);
  }

  let raw = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, '');
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) return null;
  return Math.round(amount * 100);
}

function defaultGuildConfig() {
  return {
    supportPanelChannelId: null,
    supportPanelMessageId: null,
    supportPanelVersion: null,
    supportCategoryId: null,
    shopPanelChannelId: null,
    shopPanelMessageId: null,
    shopPanelVersion: null,
    shopCategoryId: null,
    logsChannelId: null,
    buyersChannelId: null,
    staffRoleId: null,
    registrationChannelId: null,
    registrationPanelMessageId: null,
    registrationPanelVersion: null,
    memberRoleId: null,
    registrationBypassRoleIds: [],
    kits: []
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
  if (!Array.isArray(config.registrationBypassRoleIds)) config.registrationBypassRoleIds = [];
  config.registrationBypassRoleIds = [...new Set(config.registrationBypassRoleIds.map(String).filter(Boolean))];
  delete config.hiddenPluginKits;
  delete config.pluginSyncReceived;

  // Pix is fixed for this store; discard values left by the old /pix command.
  delete config.pixKey;
  delete config.pixInstructions;

  // Preserve previous plugin records; getShopKits hides legacy manual entries.
  config.kits = config.kits.map(kit => ({
    ...kit,
    displayName: kit.displayName || makeKitDisplayName(kit.name),
    description: String(kit.description || ''),
    imageUrl: String(kit.imageUrl || ''),
    price: String(kit.price || ''),
    priceCents: Number.isSafeInteger(Number(kit.priceCents)) && Number(kit.priceCents) > 0
      ? Number(kit.priceCents) : null,
    pluginForSale: kit.pluginForSale === true,
    forSale: kit.forSale === true,
    manuallyUnavailable: false,
    missingFromPlugin: kit.missingFromPlugin === true,
    pluginEnabled: typeof kit.pluginEnabled === 'boolean'
      ? kit.pluginEnabled
      : kit.missingFromPlugin === true ? false : kit.enabled !== false,
    storeVisible: kit.storeVisible !== false,
    storeConfigured: typeof kit.storeConfigured === 'boolean'
      ? kit.storeConfigured
      : Boolean(String(kit.description || '').trim()
        || String(kit.imageUrl || '').trim()
        || (String(kit.displayName || '').trim()
          && kit.displayName !== makeKitDisplayName(kit.name))),
    enabled: kit.enabled !== false
  }));

  return config;
}

function preserveCorruptStore(reason) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = dataFile + '.corrupt-' + timestamp + '.bak';
  try {
    fs.copyFileSync(dataFile, backupFile, fs.constants.COPYFILE_EXCL);
    secureLocalPath(backupFile, 0o600);
  } catch (backupError) {
    console.error('[Asthen] Não foi possível criar cópia de recuperação de state.json:', backupError.message);
  }
  throw new Error(
    'O arquivo data/state.json está inválido ou ilegível. O arquivo original foi preservado' +
    (fs.existsSync(backupFile) ? ' e uma cópia foi criada em ' + path.basename(backupFile) : '') +
    '. O bot não iniciou para evitar sobrescrever seus dados. Motivo: ' + reason
  );
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getStoreDataDir() {
  return dataDir;
}

export function loadStore() {
  ensureSecureDataDir();

  let contents;
  try {
    contents = fs.readFileSync(dataFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') preserveCorruptStore(error.message);
    state = emptyState();
    saveStore({ syncRemote: false });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    preserveCorruptStore('JSON inválido: ' + error.message);
  }

  if (!isPlainRecord(parsed)
      || (parsed.guilds !== undefined && !isPlainRecord(parsed.guilds))
      || (parsed.tickets !== undefined && !isPlainRecord(parsed.tickets))
      || (parsed.purchaseDrafts !== undefined && !isPlainRecord(parsed.purchaseDrafts))
      || (parsed.players !== undefined && !isPlainRecord(parsed.players))) {
    preserveCorruptStore('estrutura de dados incompatível');
  }

  state = {
    guilds: parsed.guilds || {},
    tickets: parsed.tickets || {},
    purchaseDrafts: parsed.purchaseDrafts || {},
    players: parsed.players || {}
  };
  for (const guildId of Object.keys(state.guilds)) ensureGuildConfig(guildId);
}

export function saveStore({ syncRemote = true } = {}) {
  ensureSecureDataDir();
  const temporaryFile = dataFile + '.tmp';
  const contents = JSON.stringify(state, null, 2) + '\n';
  try {
    const descriptor = fs.openSync(temporaryFile, 'w', 0o600);
    try {
      fs.writeFileSync(descriptor, contents, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporaryFile, dataFile);
    secureLocalPath(dataFile, 0o600);
    if (syncRemote) {
      const snapshot = JSON.parse(contents);
      scheduleSupabaseSync(snapshot);
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
        purchaseDrafts: remote.purchaseDrafts || {},
        players: remote.players || {}
      };
      for (const guildId of Object.keys(state.guilds)) ensureGuildConfig(guildId);
    },
    saveLocal: () => saveStore({ syncRemote: false })
  });
  return result;
}

export function getPlayerRegistration(discordId) {
  const id = String(discordId || '').trim();
  const record = id ? state.players[id] : null;
  return record ? { ...record } : null;
}

export function findPlayerRegistrationByNick(minecraftNick) {
  const normalized = String(minecraftNick || '').trim().toLocaleLowerCase('en-US');
  if (!normalized) return null;
  const record = Object.values(state.players).find(item =>
    String(item?.minecraft_nick || '').trim().toLocaleLowerCase('en-US') === normalized
  );
  return record ? { ...record } : null;
}

export function savePlayerRegistration(discordId, minecraftNick, guildId = null) {
  const id = String(discordId || '').trim();
  const rawNick = String(minecraftNick ?? '');
  const nick = rawNick.trim();
  if (!/^\d{17,20}$/.test(id)) throw new Error('ID do Discord inválido para o registro.');
  if (rawNick !== nick || !/^[A-Za-z0-9_. ]{1,32}$/.test(nick)) {
    throw new Error('Nick Minecraft inválido. Use de 1 a 32 caracteres válidos.');
  }
  const normalized = nick.toLocaleLowerCase('en-US');
  const conflict = Object.values(state.players).find(item =>
    item?.discord_id !== id
    && String(item?.minecraft_nick || '').trim().toLocaleLowerCase('en-US') === normalized
  );
  if (conflict) throw new Error('Este nick Minecraft já está vinculado a outra conta Discord.');
  const previous = state.players[id];
  const now = new Date().toISOString();
  const record = {
    discord_id: id,
    minecraft_nick: nick,
    created_at: previous?.created_at || now,
    updated_at: now,
    ...(guildId ? { guild_id: String(guildId) } : previous?.guild_id ? { guild_id: previous.guild_id } : {})
  };
  state.players[id] = record;
  saveStore();
  return { ...record };
}

export function getGuildConfig(guildId) {
  return ensureGuildConfig(guildId);
}

const DEMO_KIT = Object.freeze({
  id: 'asthen-demo-kit',
  name: 'ASTHEN_DEMO_KIT',
  displayName: 'Kit Demonstração',
  description: 'Amostra visual da loja ASTHEN. Este item é apenas demonstrativo: não gera compra, Pix, estoque nem entrega no Minecraft.',
  price: 'Apenas demonstração',
  priceCents: null,
  pluginForSale: false,
  forSale: false,
  pluginEnabled: false,
  enabled: false,
  manuallyUnavailable: false,
  missingFromPlugin: false,
  storeConfigured: true,
  itemCount: 0,
  demo: true
});

/**
 * Shows one non-purchasable sample only until the first plugin catalog sync.
 * The demo never enters state.json, Supabase, the inventory, or delivery queue.
 */
export function getShopKits(guildId) {
  const config = ensureGuildConfig(guildId);
  const pluginKits = config.kits.filter(kit => kit.pluginManaged === true);

  // Keep the demo only until the first real catalog arrives. An administrator
  // may intentionally hide every real kit from the Discord storefront.
  if (!pluginSyncedGuildsThisSession.has(guildId) || pluginKits.length === 0) {
    return [{ ...DEMO_KIT }];
  }
  return pluginKits.filter(kit => kit.storeVisible !== false);
}

export function updateGuildConfig(guildId, changes) {
  const config = ensureGuildConfig(guildId);
  Object.assign(config, changes);
  saveStore();
  return config;
}

/**
 * Reconcile the plugin's complete list without deleting historical products.
 * Missing products remain in the store as unavailable. Plugin 1.2.0 is authoritative for price and sale status.
 */
export function updateKit(guildId, kitId, changes) {
  const config = ensureGuildConfig(guildId);
  const index = config.kits.findIndex(kit => kit.id === kitId);
  if (index < 0) return null;
  config.kits[index] = { ...config.kits[index], ...changes };
  saveStore();
  return config.kits[index];
}

export function syncPluginKits(guildId, pluginKits) {
  const config = ensureGuildConfig(guildId);
  const incoming = Array.isArray(pluginKits)
    ? pluginKits.filter(item => item && typeof item.name === 'string'
      && /^[A-Za-z0-9_-]{1,32}$/.test(item.name))
    : null;
  if (!incoming) return { changed: false, kits: config.kits };
  const firstSyncThisGuild = !pluginSyncedGuildsThisSession.has(guildId);
  pluginSyncedGuildsThisSession.add(guildId);
  const incomingByName = new Map();
  for (const item of incoming) incomingByName.set(normalizeKitName(item.name), item);

  const existingByName = new Map(config.kits.map(kit => [normalizeKitName(kit.name), kit]));
  const syncedKits = [];

  for (const item of incoming) {
    const key = normalizeKitName(item.name);
    const old = existingByName.get(key);
    const pluginEnabled = item.enabled === true;
    const manuallyUnavailable = false;
    const hasSaleContract = Object.prototype.hasOwnProperty.call(item, 'for_sale')
      || Object.prototype.hasOwnProperty.call(item, 'price_cents');

    // Plugin 1.2.0 is authoritative: null price_cents / for_sale=false must clear
    // an old Discord-entered price instead of silently keeping a stale sale.
    const incomingCents = Number.isSafeInteger(item.price_cents) && item.price_cents > 0
      && item.price_cents <= 99999999
      ? item.price_cents
      : null;
    const priceCents = hasSaleContract
      ? incomingCents
      : Object.prototype.hasOwnProperty.call(item, 'price')
        ? legacyPriceToCents(item.price)
        : (Number.isSafeInteger(old?.priceCents) ? old.priceCents : legacyPriceToCents(old?.price));
    const pluginForSale = hasSaleContract
      ? item.for_sale === true && pluginEnabled && priceCents !== null
      : pluginEnabled && Number.isSafeInteger(priceCents) && priceCents > 0;
    const price = formatBrlCents(priceCents);
    const forSale = pluginForSale;
    const wasConfigured = typeof old?.storeConfigured === 'boolean'
      ? old.storeConfigured
      : Boolean(old && (
        String(old.description || '').trim()
        || String(old.imageUrl || '').trim()
        || (String(old.displayName || '').trim()
          && old.displayName !== makeKitDisplayName(old.name))
      ));
    syncedKits.push({
      id: old?.id || randomUUID().slice(0, 12),
      name: item.name,
      displayName: old?.displayName || makeKitDisplayName(item.name),
      price,
      priceCents,
      pluginForSale,
      forSale,
      description: String(old?.description || ''),
      imageUrl: String(old?.imageUrl || ''),
      enabled: pluginEnabled,
      pluginEnabled,
      manuallyUnavailable,
      missingFromPlugin: false,
      storeConfigured: wasConfigured,
      itemCount: Number.isFinite(Number(item.items)) ? Number(item.items) : (old?.itemCount || 0),
      storeVisible: old?.storeVisible !== false,
      pluginManaged: true
    });
  }

  const missingKits = config.kits
    .filter(kit => !incomingByName.has(normalizeKitName(kit.name)))
    .map(kit => ({
      ...kit,
      enabled: false,
      manuallyUnavailable: false,
      forSale: false,
      pluginForSale: false,
      pluginEnabled: false,
      missingFromPlugin: true
    }));

  const next = [...syncedKits, ...missingKits];
  const beforeJson = JSON.stringify({ kits: config.kits });
  const afterJson = JSON.stringify({ kits: next });
  if (beforeJson === afterJson) return { changed: firstSyncThisGuild, kits: config.kits };

  config.kits = next;
  saveStore();
  return { changed: true, kits: config.kits };
}

export function getTicket(channelId) {
  return state.tickets[channelId] ?? null;
}

export function findTicketByDeliveryRequestId(requestId) {
  const target = String(requestId || '');
  if (!target) return null;
  return Object.values(state.tickets).find(ticket =>
    ticket.type === 'shop' && ticket.deliveryRequestId === target
  ) ?? null;
}

export function listTickets() {
  return Object.values(state.tickets).map(ticket => ({ ...ticket }));
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

export function appendTicketHistory(channelId, event) {
  const ticket = state.tickets[channelId];
  if (!ticket || !event || typeof event.type !== 'string') return null;
  if (!Array.isArray(ticket.history)) ticket.history = [];
  if (event.eventId && ticket.history.some(item => item.eventId === event.eventId)) {
    return ticket.history[ticket.history.findIndex(item => item.eventId === event.eventId)];
  }
  const entry = {
    ...event,
    at: event.at || new Date().toISOString()
  };
  ticket.history.push(entry);
  // Keep the structured audit trail bounded while retaining recent operational events.
  if (ticket.history.length > 500) ticket.history.splice(0, ticket.history.length - 500);
  saveStore();
  return entry;
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
