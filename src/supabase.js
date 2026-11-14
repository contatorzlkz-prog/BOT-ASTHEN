let syncTimer = null;
let retryTimer = null;
let syncInFlight = false;
let syncQueued = false;
let retryCount = 0;
let lastSyncError = null;
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
  const kitsTable = String(process.env.SUPABASE_KITS_TABLE || 'asthen_bot_kits').trim();

  if (!projectUrl || !secretKey) return null;
  if (!/^https:\/\//i.test(projectUrl)) {
    throw new Error('SUPABASE_URL precisa ser a URL HTTPS base do projeto.');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(kitsTable)) {
    throw new Error('O nome de uma tabela Supabase contém caracteres inválidos.');
  }
  return { projectUrl, secretKey, table, kitsTable };
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

async function pushKitRows(config, snapshot) {
  const guilds = snapshot?.guilds && typeof snapshot.guilds === 'object' ? snapshot.guilds : {};

  for (const [guildId, guild] of Object.entries(guilds)) {
    const now = new Date().toISOString();
    const kits = Array.isArray(guild?.kits) ? guild.kits : [];
    const rows = kits
      .filter(kit => kit && typeof kit.id === 'string' && typeof kit.name === 'string')
      .map(kit => ({
        guild_id: String(guildId),
        kit_id: kit.id,
        plugin_name: kit.name,
        display_name: String(kit.displayName || kit.name.replace(/[_-]+/g, ' ')),
        description: String(kit.description || ''),
        price: String(kit.price || ''),
        image_url: String(kit.imageUrl || ''),
        plugin_enabled: kit.enabled !== false,
        item_count: Number.isFinite(Number(kit.itemCount)) ? Number(kit.itemCount) : 0,
        updated_at: now
      }));

    if (rows.length) {
      const upsert = await supabaseRequest(config, '?on_conflict=guild_id,kit_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
      }, config.kitsTable);
      if (!upsert.ok) {
        throw new Error('Supabase respondeu HTTP ' + upsert.status + ' ao salvar os kits.');
      }
    }

    const filters = new URLSearchParams({ guild_id: 'eq.' + guildId });
    if (rows.length) {
      const keepIds = rows.map(row => '"' + row.kit_id.replace(/"/g, '') + '"').join(',');
      filters.set('kit_id', 'not.in.(' + keepIds + ')');
    }

    const cleanup = await supabaseRequest(config, '?' + filters.toString(), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }, config.kitsTable);
    if (!cleanup.ok) {
      throw new Error('Supabase respondeu HTTP ' + cleanup.status + ' ao remover kits antigos.');
    }
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

async function pushSnapshot(snapshot) {
  const config = getSupabaseConfig();
  if (!config) return false;

  if (syncInFlight) {
    syncQueued = true;
    return false;
  }

  syncInFlight = true;
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
      lastSyncError = 'Supabase respondeu HTTP ' + response.status + '.';
      throw new Error(lastSyncError);
    }

    await pushKitRows(config, snapshot);

    retryCount = 0;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    lastSyncError = null;
    lastSyncedAt = new Date().toISOString();
    return true;
  } catch (error) {
    lastSyncError = error.name === 'AbortError'
      ? 'Tempo limite ao conectar ao Supabase.'
      : (lastSyncError || 'Não foi possível sincronizar com o Supabase.');
    console.warn('[Asthen Supabase] ' + lastSyncError + ' O backup local continua disponível.');
    scheduleRetry();
    return false;
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void flushSupabaseSync();
      }, 250);
      syncTimer.unref?.();
    }
  }
}

export function scheduleSupabaseSync(snapshot) {
  if (!getSupabaseConfig()) return;
  snapshotProvider = () => snapshot;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushSupabaseSync();
  }, 500);
  syncTimer.unref?.();
}

export function scheduleSupabaseKitsSync(snapshot) {
  // The normalized kit table is synchronized in the same debounced write as the state snapshot.
  scheduleSupabaseSync(snapshot);
}

export async function flushSupabaseSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!snapshotProvider) return false;
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
      lastSyncError = 'Supabase respondeu HTTP ' + response.status + ' durante a leitura.';
      console.warn('[Asthen Supabase] ' + lastSyncError + ' O bot continuará usando o arquivo local.');
      scheduleSupabaseSync(getSnapshot());
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

export function getSupabaseStatus() {
  return {
    enabled: Boolean(getSupabaseConfig()),
    kitsTable: getSupabaseConfig()?.kitsTable || null,
    lastSyncedAt,
    lastError: lastSyncError
  };
}
