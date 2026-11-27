let syncTimer = null;
let retryTimer = null;
let syncInFlight = false;
let syncQueued = false;
let syncPromise = null;
let retryCount = 0;
let lastSyncError = null;
let lastLoggedSyncError = null;
let lastSyncedAt = null;
let lastStockCheckAt = null;
let lastStockCheckError = null;
let snapshotProvider = null;
let remoteReadReady = false;
let bootstrapRetryTimer = null;
let bootstrapContext = null;

export function normalizeSupabaseUrl(value) {
  const input = String(value || '').trim().replace(/\/+$/, '');
  return input.replace(/\/(?:rest\/v1|v1)$/i, '');
}

export function getSupabaseConfig() {
  const projectUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL);
  const secretKey = String(
    process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_KEY
      || ''
  ).trim();
  const table = String(process.env.SUPABASE_TABLE || 'asthen_bot_state').trim();
  const weeklyStockTable = String(process.env.SUPABASE_WEEKLY_STOCK_TABLE || 'asthen_bot_weekly_stock').trim();

  if (!projectUrl || !secretKey) return null;
  if (!/^https:\/\//i.test(projectUrl)) {
    throw new Error('SUPABASE_URL precisa ser a URL HTTPS base do projeto.');
  }
  if (![table, weeklyStockTable].every(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    throw new Error('O nome de uma tabela Supabase contém caracteres inválidos.');
  }
  return { projectUrl, secretKey, table, weeklyStockTable };
}

function buildHeaders(config, extra = {}) {
  const headers = {
    apikey: config.secretKey,
    'Content-Type': 'application/json',
    ...extra
  };

  // sb_secret_ keys are opaque API keys, not JWTs: send them only as apikey.
  // Legacy service_role keys are JWTs and still need the Authorization header.
  if (!config.secretKey.startsWith('sb_secret_')) {
    headers.Authorization = 'Bearer ' + config.secretKey;
  }
  return headers;
}

async function supabaseRequest(config, path, options = {}, table = config.table) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(config.projectUrl + '/rest/v1/' + table + path, {
      ...options,
      headers: buildHeaders(config, options.headers),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}


function snapshotHasData(snapshot) {
  return Boolean(snapshot && (
    Object.keys(snapshot.guilds || {}).length || Object.keys(snapshot.tickets || {}).length
    || Object.keys(snapshot.purchaseDrafts || {}).length || Object.keys(snapshot.players || {}).length
    || Object.values(snapshot.tombstones || {}).some(bucket => Object.keys(bucket || {}).length)
  ));
}

function normalizeSnapshot(value) {
  return {
    guilds: value?.guilds && typeof value.guilds === 'object' && !Array.isArray(value.guilds) ? value.guilds : {},
    tickets: value?.tickets && typeof value.tickets === 'object' && !Array.isArray(value.tickets) ? value.tickets : {},
    purchaseDrafts: value?.purchaseDrafts && typeof value.purchaseDrafts === 'object' && !Array.isArray(value.purchaseDrafts) ? value.purchaseDrafts : {},
    players: value?.players && typeof value.players === 'object' && !Array.isArray(value.players) ? value.players : {},
    tombstones: {
      tickets: value?.tombstones?.tickets && typeof value.tombstones.tickets === 'object' && !Array.isArray(value.tombstones.tickets) ? value.tombstones.tickets : {},
      purchaseDrafts: value?.tombstones?.purchaseDrafts && typeof value.tombstones.purchaseDrafts === 'object' && !Array.isArray(value.tombstones.purchaseDrafts) ? value.tombstones.purchaseDrafts : {},
      players: value?.tombstones?.players && typeof value.tombstones.players === 'object' && !Array.isArray(value.tombstones.players) ? value.tombstones.players : {}
    }
  };
}
function recordTimestamp(value) {
  if (!value || typeof value !== 'object') return 0;
  for (const key of ['updated_at', 'updatedAt', 'closedAt', 'created_at', 'createdAt', 'at']) {
    const timestamp = Date.parse(value[key] || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}
function mergeHistory(localHistory = [], remoteHistory = []) {
  const entries = new Map();
  for (const item of [...remoteHistory, ...localHistory]) {
    if (!item || typeof item !== 'object') continue;
    const key = item.eventId || [item.type || '', item.requestId || '', item.status || '', item.at || '', item.message || ''].join('|');
    entries.set(key, item);
  }
  return [...entries.values()].sort((a, b) =>
    (Date.parse(a.at || '') || 0) - (Date.parse(b.at || '') || 0)
  ).slice(-500);
}
function mergeRecord(local, remote, { history = false } = {}) {
  if (!local) return remote;
  if (!remote) return local;
  if (typeof local !== 'object' || Array.isArray(local) || typeof remote !== 'object' || Array.isArray(remote)) return local;
  const localTime = recordTimestamp(local), remoteTime = recordTimestamp(remote);
  const older = localTime >= remoteTime ? remote : local;
  const newer = localTime >= remoteTime ? local : remote;
  const merged = { ...older, ...newer };
  if (history) merged.history = mergeHistory(local.history || [], remote.history || []);
  return merged;
}
function mergeGuildConfig(local, remote) {
  const merged = mergeRecord(local, remote);
  const localTime = recordTimestamp(local), remoteTime = recordTimestamp(remote);
  const ordered = localTime >= remoteTime ? [remote?.kits || [], local?.kits || []] : [local?.kits || [], remote?.kits || []];
  const kits = new Map();
  for (const list of ordered) for (const kit of list) {
    if (!kit || typeof kit !== 'object') continue;
    const key = String(kit.name || kit.id || '').toLowerCase();
    if (key) kits.set(key, kit);
  }
  if (local?.kits || remote?.kits) merged.kits = [...kits.values()];
  return merged;
}
function mergeMap(local = {}, remote = {}, mergeEntry = mergeRecord) {
  const result = {};
  for (const key of new Set([...Object.keys(remote || {}), ...Object.keys(local || {})])) {
    result[key] = local?.[key] && remote?.[key]
      ? mergeEntry(local[key], remote[key])
      : (local?.[key] ?? remote?.[key]);
  }
  return result;
}
function mergeTombstones(local = {}, remote = {}) {
  const result = {};
  for (const bucket of ['tickets', 'purchaseDrafts', 'players']) {
    result[bucket] = {};
    const keys = new Set([...Object.keys(local?.[bucket] || {}), ...Object.keys(remote?.[bucket] || {})]);
    for (const key of keys) {
      const timestamp = Math.max(Date.parse(local?.[bucket]?.[key] || '') || 0, Date.parse(remote?.[bucket]?.[key] || '') || 0);
      if (timestamp) result[bucket][key] = new Date(timestamp).toISOString();
    }
  }
  return result;
}
function removeDeletedRecords(records, tombstones = {}) {
  const result = { ...records };
  for (const [key, deletedAt] of Object.entries(tombstones || {})) {
    const deletedTime = Date.parse(deletedAt || '') || 0;
    if (deletedTime && key in result && recordTimestamp(result[key]) <= deletedTime) delete result[key];
  }
  return result;
}
export function mergeSnapshots(localValue, remoteValue) {
  const local = normalizeSnapshot(localValue), remote = normalizeSnapshot(remoteValue);
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const guilds = mergeMap(local.guilds, remote.guilds, mergeGuildConfig);
  const tickets = mergeMap(local.tickets, remote.tickets, (a, b) => mergeRecord(a, b, { history: true }));
  const purchaseDrafts = mergeMap(local.purchaseDrafts, remote.purchaseDrafts);
  const players = mergeMap(local.players, remote.players);
  return {
    guilds,
    tickets: removeDeletedRecords(tickets, tombstones.tickets),
    purchaseDrafts: removeDeletedRecords(purchaseDrafts, tombstones.purchaseDrafts),
    players: removeDeletedRecords(players, tombstones.players),
    tombstones
  };
}
function scheduleBootstrapRetry() {
  if (bootstrapRetryTimer || !bootstrapContext) return;
  bootstrapRetryTimer = setTimeout(() => {
    bootstrapRetryTimer = null;
    void initializeSupabaseSync(bootstrapContext);
  }, 30_000);
  bootstrapRetryTimer.unref?.();
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryCount += 1;
  const delay = Math.min(60_000, 1000 * (2 ** Math.min(retryCount, 6)));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushSupabaseSync();
  }, delay);
  retryTimer.unref?.();
}

async function pushSnapshotOnce(snapshot) {
  const config = getSupabaseConfig();
  if (!config) return false;

  try {
    const response = await supabaseRequest(config, '?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: 'main',
        payload: snapshot,
        updated_at: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const summary = detail ? ' ' + detail.slice(0, 700) : '';
      const error = new Error('Supabase respondeu HTTP ' + response.status + ' ao salvar o snapshot.' + summary);
      error.status = response.status;
      error.retryable = response.status >= 500 || response.status === 429;
      throw error;
    }

    retryCount = 0;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    lastSyncError = null;
    lastLoggedSyncError = null;
    lastSyncedAt = new Date().toISOString();
    return true;
  } catch (error) {
    lastSyncError = error.name === 'AbortError'
      ? 'Tempo limite ao conectar ao Supabase.'
      : (error?.message || lastSyncError || 'Não foi possível sincronizar com o Supabase.');
    if (lastLoggedSyncError !== lastSyncError) {
      console.warn('[Asthen Supabase] ' + lastSyncError + ' O backup local continua disponível.');
      lastLoggedSyncError = lastSyncError;
    }
    // Schema/permission errors (4xx) do not heal by retrying every minute.
    if (error.retryable !== false) scheduleRetry();
    return false;
  }
}

async function pushSnapshot(snapshot) {
  if (syncInFlight) {
    syncQueued = true;
    return syncPromise || false;
  }

  syncInFlight = true;
  syncPromise = (async () => {
    let nextSnapshot = snapshot;
    let allSuccessful = true;
    do {
      syncQueued = false;
      // Always prefer the latest scheduled snapshot, never an older queued copy.
      if (snapshotProvider) nextSnapshot = snapshotProvider();
      const successful = await pushSnapshotOnce(nextSnapshot);
      allSuccessful = successful && allSuccessful;
    } while (syncQueued);
    return allSuccessful;
  })();

  try {
    return await syncPromise;
  } finally {
    syncInFlight = false;
    syncPromise = null;
    if (syncQueued && snapshotProvider) {
      syncQueued = false;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void flushSupabaseSync();
      }, 0);
      syncTimer.unref?.();
    }
  }
}
export function scheduleSupabaseSync(snapshot) {
  if (!getSupabaseConfig()) return;
  snapshotProvider = () => snapshot;
  if (!remoteReadReady) return;
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushSupabaseSync();
  }, 500);
  syncTimer.unref?.();
}

export async function flushSupabaseSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!snapshotProvider || !remoteReadReady) return false;
  if (syncInFlight) {
    syncQueued = true;
    return syncPromise || false;
  }
  return pushSnapshot(snapshotProvider());
}

export async function initializeSupabaseSync(context) {
  const config = getSupabaseConfig();
  if (!config) return { enabled: false, restored: false, syncReady: false };
  bootstrapContext = context;
  const { getSnapshot, applySnapshot, saveLocal } = context;
  snapshotProvider = getSnapshot;
  try {
    const response = await supabaseRequest(config, '?id=eq.main&select=payload,updated_at&limit=1', { method: 'GET' });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      lastSyncError = 'Supabase respondeu HTTP ' + response.status + ' durante a leitura.' + (detail ? ' ' + detail.slice(0, 700) : '');
      if (lastLoggedSyncError !== lastSyncError) {
        console.warn('[Asthen Supabase] ' + lastSyncError + ' O bot continuará usando o arquivo local.');
        lastLoggedSyncError = lastSyncError;
      }
      if (response.status >= 500 || response.status === 429) scheduleBootstrapRetry();
      return { enabled: true, restored: false, syncReady: false };
    }

    const rows = await response.json();
    const remoteSnapshot = Array.isArray(rows) && rows[0]?.payload ? normalizeSnapshot(rows[0].payload) : normalizeSnapshot(null);
    const localSnapshot = normalizeSnapshot(getSnapshot());
    const mergedSnapshot = mergeSnapshots(localSnapshot, remoteSnapshot);
    const restored = !snapshotHasData(localSnapshot) && snapshotHasData(mergedSnapshot);
    if (JSON.stringify(mergedSnapshot) !== JSON.stringify(localSnapshot)) {
      applySnapshot(mergedSnapshot);
      saveLocal();
    }

    remoteReadReady = true;
    if (bootstrapRetryTimer) clearTimeout(bootstrapRetryTimer);
    bootstrapRetryTimer = null;
    lastSyncedAt = rows?.[0]?.updated_at || new Date().toISOString();
    lastSyncError = null;
    lastLoggedSyncError = null;
    scheduleSupabaseSync(getSnapshot());
    return { enabled: true, restored, syncReady: true };
  } catch (error) {
    lastSyncError = error.name === 'AbortError' ? 'Tempo limite ao conectar ao Supabase.' : 'Não foi possível ler o snapshot remoto do Supabase.';
    console.warn('[Asthen Supabase] ' + lastSyncError + ' O bot continuará usando o arquivo local.');
    scheduleBootstrapRetry();
    return { enabled: true, restored: false, syncReady: false };
  }
}

/**
 * Returns the Sunday that starts the current sales week in Brasilia.
 * Uses the IANA timezone instead of the bot host's local timezone.
 */
export function getBrasiliaWeekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localDate = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  ));
  localDate.setUTCDate(localDate.getUTCDate() - localDate.getUTCDay());
  return localDate.toISOString().slice(0, 10);
}

/**
 * Returns the next Sunday at 00:00 in Brasilia, as an absolute Date.
 * This avoids relying on the host machine's local timezone or a fixed UTC offset.
 */
export function getNextBrasiliaSundayAt(now = new Date()) {
  const timeZone = 'America/Sao_Paulo';
  const getParts = date => Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value])
  );
  const current = getParts(now);
  const currentDateUtc = Date.UTC(
    Number(current.year),
    Number(current.month) - 1,
    Number(current.day)
  );
  const currentWeekday = new Date(currentDateUtc).getUTCDay();
  const daysUntilSunday = 7 - currentWeekday;
  const targetDateUtc = currentDateUtc + daysUntilSunday * 24 * 60 * 60 * 1000;

  const offsetAt = date => {
    const parts = getParts(date);
    const wallClockAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
  };

  let targetTimestamp = targetDateUtc - offsetAt(new Date(targetDateUtc));
  targetTimestamp = targetDateUtc - offsetAt(new Date(targetTimestamp));
  return new Date(targetTimestamp);
}

function requireWeeklyStockConfig() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('O Supabase é obrigatório para controlar o limite semanal. Configure SUPABASE_URL e SUPABASE_SECRET_KEY.');
  }
  return config;
}

/**
 * Kits without a row still have all 10 units available for this week.
 */
export async function getWeeklyKitStock(guildId) {
  if (!String(guildId || '').trim()) throw new Error('O servidor Discord não foi informado para consultar o estoque.');
  const config = requireWeeklyStockConfig();
  const weekStart = getBrasiliaWeekStart();
  const query = new URLSearchParams({
    select: 'kit_id,reserved_count,weekly_limit',
    guild_id: 'eq.' + String(guildId),
    week_start: 'eq.' + weekStart
  });
  const response = await supabaseRequest(
    config,
    '?' + query.toString(),
    { method: 'GET' },
    config.weeklyStockTable
  );
  if (!response.ok) {
    lastStockCheckAt = new Date().toISOString();
    lastStockCheckError = 'Consulta do estoque: HTTP ' + response.status;
    throw new Error(
      'Não foi possível consultar o estoque semanal no Supabase (HTTP ' + response.status +
      '). Confira a tabela e execute supabase/SETUP.sql.'
    );
  }

  lastStockCheckAt = new Date().toISOString();
  lastStockCheckError = null;
  const rows = await response.json();
  const items = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const limit = Number.isInteger(Number(row.weekly_limit)) && Number(row.weekly_limit) > 0
      ? Number(row.weekly_limit) : 10;
    const reserved = Number.isInteger(Number(row.reserved_count)) && Number(row.reserved_count) > 0
      ? Number(row.reserved_count) : 0;
    items[String(row.kit_id)] = {
      reserved,
      limit,
      remaining: Math.max(0, limit - reserved)
    };
  }
  return { weekStart, limit: 10, items };
}

/**
 * The database function serializes approvals and treats requestId as an idempotency key.
 */
export async function reserveWeeklyKitStock({ guildId, kitId, requestId } = {}) {
  if (!String(guildId || '').trim() || !String(kitId || '').trim() || !String(requestId || '').trim()) {
    throw new Error('Não foi possível reservar o estoque: servidor, kit ou pedido ausente.');
  }
  const config = requireWeeklyStockConfig();
  const weekStart = getBrasiliaWeekStart();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(config.projectUrl + '/rest/v1/rpc/reserve_asthen_weekly_kit_stock', {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        p_guild_id: String(guildId),
        p_kit_id: String(kitId),
        p_request_id: String(requestId),
        p_week_start: weekStart
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo limite ao reservar a unidade semanal no Supabase. O pagamento não foi aprovado pelo bot.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    lastStockCheckAt = new Date().toISOString();
    lastStockCheckError = 'Reserva de estoque: HTTP ' + response.status;
    throw new Error(
      'O Supabase não conseguiu reservar o estoque (HTTP ' + response.status +
      '). Confira a tabela e a função de reserva em supabase/SETUP.sql.'
    );
  }
  let result = await response.json();
  if (Array.isArray(result)) result = result[0];
  if (!result || typeof result.ok !== 'boolean') {
    lastStockCheckAt = new Date().toISOString();
    lastStockCheckError = 'A função de reserva retornou uma resposta inválida.';
    throw new Error('O Supabase respondeu com um resultado inválido para a reserva semanal.');
  }
  lastStockCheckAt = new Date().toISOString();
  lastStockCheckError = null;
  return { ...result, week_start: result.week_start || weekStart };
}

/**
 * Releases one approved reservation after staff has completed the cancellation/refund
 * outside the bot. The SQL function is idempotent by (guild_id, request_id).
 */
export async function releaseWeeklyKitStock({ guildId, requestId } = {}) {
  if (!String(guildId || '').trim() || !String(requestId || '').trim()) {
    throw new Error('Não foi possível liberar o estoque: servidor ou identificador da reserva ausente.');
  }
  const config = requireWeeklyStockConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(config.projectUrl + '/rest/v1/rpc/release_asthen_weekly_kit_stock', {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        p_guild_id: String(guildId),
        p_request_id: String(requestId)
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo limite ao liberar a unidade semanal no Supabase. Repita a ação com o mesmo pedido; a operação é idempotente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    lastStockCheckAt = new Date().toISOString();
    lastStockCheckError = 'Liberação de estoque: HTTP ' + response.status;
    throw new Error(
      'O Supabase não conseguiu liberar a reserva (HTTP ' + response.status +
      '). Confira a função release_asthen_weekly_kit_stock em supabase/SETUP.sql.'
    );
  }

  let result = await response.json();
  if (Array.isArray(result)) result = result[0];
  if (!result || typeof result.ok !== 'boolean') {
    lastStockCheckAt = new Date().toISOString();
    lastStockCheckError = 'A função de liberação retornou uma resposta inválida.';
    throw new Error('O Supabase respondeu com um resultado inválido para a liberação do estoque.');
  }
  lastStockCheckAt = new Date().toISOString();
  lastStockCheckError = null;
  return result;
}

export function getSupabaseStatus() {
  const config = getSupabaseConfig();
  const weeklyStockHealth = !config
    ? 'disabled'
    : lastStockCheckError
      ? 'error'
      : lastStockCheckAt
        ? 'ready'
        : 'not_checked';
  return {
    enabled: Boolean(config),
    weeklyStockTable: config?.weeklyStockTable || null,
    weeklyStockEnabled: Boolean(config),
    weeklyStockHealth,
    lastStockCheckAt,
    lastStockCheckError,
    lastSyncedAt,
    lastError: lastSyncError,
    snapshotReadReady: remoteReadReady
  };
}
