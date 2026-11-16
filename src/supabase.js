let syncTimer = null;
let retryTimer = null;
let syncInFlight = false;
let syncQueued = false;
let syncPromise = null;
let retryCount = 0;
let lastSyncError = null;
let lastLoggedSyncError = null;
let lastSyncedAt = null;
let snapshotProvider = null;

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
  return Boolean(
    snapshot
    && (
      Object.keys(snapshot.guilds || {}).length
      || Object.keys(snapshot.tickets || {}).length
      || Object.keys(snapshot.purchaseDrafts || {}).length
    )
  );
}

function normalizeSnapshot(value) {
  return {
    guilds: value?.guilds && typeof value.guilds === 'object' ? value.guilds : {},
    tickets: value?.tickets && typeof value.tickets === 'object' ? value.tickets : {},
    purchaseDrafts: value?.purchaseDrafts && typeof value.purchaseDrafts === 'object'
      ? value.purchaseDrafts
      : {}
  };
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
  if (!snapshotProvider) return false;
  if (syncInFlight) {
    syncQueued = true;
    return syncPromise || false;
  }
  return pushSnapshot(snapshotProvider());
}

export async function initializeSupabaseSync({
  getSnapshot,
  applySnapshot,
  saveLocal
}) {
  const config = getSupabaseConfig();
  if (!config) return { enabled: false, restored: false };

  snapshotProvider = getSnapshot;
  try {
    const response = await supabaseRequest(
      config,
      '?id=eq.main&select=payload&limit=1',
      { method: 'GET' }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      lastSyncError = 'Supabase respondeu HTTP ' + response.status + ' durante a leitura.' +
        (detail ? ' ' + detail.slice(0, 700) : '');
      if (lastLoggedSyncError !== lastSyncError) {
        console.warn('[Asthen Supabase] ' + lastSyncError + ' O bot continuará usando o arquivo local.');
        lastLoggedSyncError = lastSyncError;
      }
      if (response.status >= 500 || response.status === 429) scheduleSupabaseSync(getSnapshot());
      return { enabled: true, restored: false };
    }

    const rows = await response.json();
    const remoteSnapshot = Array.isArray(rows) && rows[0]?.payload
      ? normalizeSnapshot(rows[0].payload)
      : null;
    const localSnapshot = getSnapshot();

    if (!snapshotHasData(localSnapshot) && snapshotHasData(remoteSnapshot)) {
      applySnapshot(remoteSnapshot);
      saveLocal();
      lastSyncedAt = new Date().toISOString();
      lastSyncError = null;
      return { enabled: true, restored: true };
    }

    scheduleSupabaseSync(localSnapshot);
    return { enabled: true, restored: false };
  } catch (error) {
    lastSyncError = error.name === 'AbortError'
      ? 'Tempo limite ao conectar ao Supabase.'
      : 'Não foi possível ler o snapshot remoto do Supabase.';
    console.warn('[Asthen Supabase] ' + lastSyncError + ' O bot continuará usando o arquivo local.');
    scheduleSupabaseSync(getSnapshot());
    return { enabled: true, restored: false };
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
    throw new Error(
      'Não foi possível consultar o estoque semanal no Supabase (HTTP ' + response.status +
      '). Execute supabase/005_asthen_bot_weekly_kit_stock.sql.'
    );
  }

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
    throw new Error(
      'O Supabase não conseguiu reservar o estoque (HTTP ' + response.status +
      '). Confira a migração supabase/005_asthen_bot_weekly_kit_stock.sql.'
    );
  }
  let result = await response.json();
  if (Array.isArray(result)) result = result[0];
  if (!result || typeof result.ok !== 'boolean') {
    throw new Error('O Supabase respondeu com um resultado inválido para a reserva semanal.');
  }
  return { ...result, week_start: result.week_start || weekStart };
}

export function getSupabaseStatus() {
  const config = getSupabaseConfig();
  return {
    enabled: Boolean(config),
    weeklyStockTable: config?.weeklyStockTable || null,
    weeklyStockEnabled: Boolean(config),
    lastSyncedAt,
    lastError: lastSyncError
  };
}
