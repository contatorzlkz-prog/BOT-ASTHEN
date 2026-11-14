import crypto from 'node:crypto';

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

  if (!projectUrl || !secretKey) return null;
  if (!/^https:\/\//i.test(projectUrl)) {
    throw new Error('SUPABASE_URL precisa ser a URL HTTPS base do projeto.');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new Error('SUPABASE_TABLE contém caracteres inválidos.');
  }
  return { projectUrl, secretKey, table };
}

function buildHeaders(config, extra = {}) {
  return {
    apikey: config.secretKey,
    Authorization: 'Bearer ' + config.secretKey,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(config, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(config.projectUrl + '/rest/v1/' + config.table + path, {
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

    retryCount = 0;
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
    lastSyncedAt,
    lastError: lastSyncError
  };
}
