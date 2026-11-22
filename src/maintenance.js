import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getStoreDataDir, getGuildConfig, pruneOldStoreData } from './store.js';
import { getBridgeStatus } from './bridge.js';
import { getSupabaseStatus } from './supabase.js';

const BACKUP_FORMAT = 1;
const BACKUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MONITOR_INTERVAL_MS = 30 * 1000;
const BACKUP_MAX_COUNT = 30;
const BACKUP_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const ARCHIVE_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const BACKUP_ID_RE = /^asthen-\d{8}T\d{6}Z-[a-f0-9]{8}$/;
const SNAPSHOT_FILES = ['data/state.json', 'data/bridge-queue.json'];

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(directory, 0o700); } catch {}
  }
}

function privateFile(filePath) {
  if (process.platform !== 'win32') {
    try { fs.chmodSync(filePath, 0o600); } catch {}
  }
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getBackupDirectory(projectDir = process.cwd(), backupDir = null) {
  const configured = String(process.env.ASTHEN_BACKUP_DIR || '').trim();
  return path.resolve(backupDir || configured || path.join(projectDir, 'backups'));
}

function makeBackupId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return 'asthen-' + stamp + '-' + crypto.randomUUID().slice(0, 8);
}

function readManifest(backupPath) {
  const manifestPath = path.join(backupPath, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || manifest.format !== BACKUP_FORMAT || !Array.isArray(manifest.files)) {
    throw new Error('Formato de backup desconhecido.');
  }
  for (const item of manifest.files) {
    if (!item || !['.env', ...SNAPSHOT_FILES].includes(item.path)
        || !/^[a-f0-9]{64}$/.test(String(item.sha256 || ''))
        || !Number.isSafeInteger(item.size) || item.size < 0) {
      throw new Error('O manifesto contém um arquivo inválido.');
    }
  }
  return manifest;
}

export function verifyBackup(backupId, options = {}) {
  try {
    if (!BACKUP_ID_RE.test(String(backupId || ''))) throw new Error('Identificador de backup inválido.');
    const backupDir = getBackupDirectory(options.projectDir, options.backupDir);
    const backupPath = path.join(backupDir, backupId);
    const manifest = readManifest(backupPath);
    for (const item of manifest.files) {
      const filePath = path.join(backupPath, item.path);
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size !== item.size || hashFile(filePath) !== item.sha256) {
        throw new Error('Integridade inválida em ' + item.path + '.');
      }
    }
    return { valid: true, manifest };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export function listBackups(options = {}) {
  const backupDir = getBackupDirectory(options.projectDir, options.backupDir);
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && BACKUP_ID_RE.test(entry.name))
    .map(entry => {
      const directory = path.join(backupDir, entry.name);
      try {
        const manifest = readManifest(directory);
        const stat = fs.statSync(directory);
        return {
          id: entry.name,
          createdAt: manifest.createdAt,
          reason: manifest.reason || 'automatic',
          bytes: manifest.files.reduce((total, file) => total + file.size, 0),
          valid: verifyBackup(entry.name, options).valid,
          modifiedAt: stat.mtime.toISOString()
        };
      } catch {
        return { id: entry.name, createdAt: null, reason: 'manifesto inválido', bytes: 0, valid: false };
      }
    })
    .sort((a, b) => String(b.createdAt || b.modifiedAt).localeCompare(String(a.createdAt || a.modifiedAt)));
}

export function pruneBackups(options = {}) {
  const backupDir = getBackupDirectory(options.projectDir, options.backupDir);
  const now = Number(options.now ?? Date.now());
  const maxCount = Math.max(1, Number(options.maxCount ?? BACKUP_MAX_COUNT));
  const maxAgeMs = Math.max(1, Number(options.maxAgeMs ?? BACKUP_MAX_AGE_MS));
  const backups = listBackups(options);
  const remove = new Set(backups.filter(item => {
    const created = Date.parse(item.createdAt || item.modifiedAt || '');
    return Number.isFinite(created) && now - created > maxAgeMs;
  }).map(item => item.id));
  const remaining = backups.filter(item => !remove.has(item.id));
  for (const item of remaining.slice(maxCount)) remove.add(item.id);
  for (const id of remove) {
    fs.rmSync(path.join(backupDir, id), { recursive: true, force: true });
  }
  return remove.size;
}

export function createBackup(options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const dataDir = path.resolve(options.dataDir || getStoreDataDir());
  const backupDir = getBackupDirectory(projectDir, options.backupDir);
  privateDirectory(backupDir);

  const createdAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const id = makeBackupId(new Date(createdAt));
  const temporaryDir = path.join(backupDir, '.' + id + '.tmp');
  const finalDir = path.join(backupDir, id);
  fs.rmSync(temporaryDir, { recursive: true, force: true });
  privateDirectory(temporaryDir);

  const sources = [
    { path: '.env', source: path.join(projectDir, '.env') },
    { path: 'data/state.json', source: path.join(dataDir, 'state.json') },
    { path: 'data/bridge-queue.json', source: path.join(dataDir, 'bridge-queue.json') }
  ];
  const files = [];
  try {
    for (const item of sources) {
      if (!fs.existsSync(item.source)) continue;
      const stat = fs.lstatSync(item.source);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Arquivo de backup não é um arquivo regular: ' + item.path);
      }
      const destination = path.join(temporaryDir, item.path);
      privateDirectory(path.dirname(destination));
      fs.copyFileSync(item.source, destination);
      privateFile(destination);
      files.push({
        path: item.path,
        size: fs.statSync(destination).size,
        sha256: hashFile(destination)
      });
    }

    const packagePath = path.join(projectDir, 'package.json');
    let version = 'desconhecida';
    try { version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || version; } catch {}
    const manifest = {
      format: BACKUP_FORMAT,
      id,
      createdAt,
      reason: String(options.reason || 'automatic').slice(0, 120),
      version,
      files
    };
    const manifestPath = path.join(temporaryDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    privateFile(manifestPath);
    fs.renameSync(temporaryDir, finalDir);
    privateDirectory(finalDir);
    pruneBackups({ projectDir, backupDir });
    return { id, createdAt, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) };
  } catch (error) {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
    throw new Error('Não foi possível criar o backup: ' + error.message);
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

export function assertBotStopped(dataDir = getStoreDataDir()) {
  const lockPath = path.join(path.resolve(dataDir), 'asthen.pid');
  if (!fs.existsSync(lockPath)) return true;
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    throw new Error('O arquivo data/asthen.pid está ilegível. Confira se o bot está fechado antes de removê-lo manualmente.');
  }
  if (processIsAlive(Number(lock.pid))) {
    throw new Error('O ASTHEN BOT ainda está em execução (PID ' + lock.pid + '). Feche o bot antes de restaurar.');
  }
  fs.rmSync(lockPath, { force: true });
  return true;
}

export function acquireRuntimeLock(dataDir = getStoreDataDir()) {
  privateDirectory(dataDir);
  const lockPath = path.join(path.resolve(dataDir), 'asthen.pid');
  if (fs.existsSync(lockPath)) {
    let previous;
    try { previous = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {}
    if (processIsAlive(Number(previous?.pid))) {
      throw new Error('Já existe um ASTHEN BOT em execução (PID ' + previous.pid + '). Não inicie uma segunda cópia.');
    }
    fs.rmSync(lockPath, { force: true });
  }

  const descriptor = fs.openSync(lockPath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString()
    }) + '\n', 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (Number(current.pid) === process.pid) fs.rmSync(lockPath, { force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[Asthen] Não foi possível remover o bloqueio de execução:', error.message);
    }
  };
}

export function restoreBackup(backupId, options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const dataDir = path.resolve(options.dataDir || getStoreDataDir());
  const backupDir = getBackupDirectory(projectDir, options.backupDir);
  if (options.checkRuntime !== false) assertBotStopped(dataDir);

  const verified = verifyBackup(backupId, { projectDir, backupDir });
  if (!verified.valid) throw new Error('Backup não restaurado: ' + verified.error);

  const safetyBackup = createBackup({
    projectDir,
    dataDir,
    backupDir,
    reason: 'segurança antes de restaurar ' + backupId
  });

  const backupPath = path.join(backupDir, backupId);
  const manifestPaths = new Set(verified.manifest.files.map(item => item.path));
  const temporaryData = dataDir + '.restore-' + crypto.randomUUID();
  const previousData = dataDir + '.before-restore-' + crypto.randomUUID();
  const envPath = path.join(projectDir, '.env');
  const temporaryEnv = envPath + '.restore-' + crypto.randomUUID();
  const previousEnv = envPath + '.before-restore-' + crypto.randomUUID();
  let movedData = false;
  let installedData = false;
  let movedEnv = false;

  try {
    if (fs.existsSync(dataDir)) fs.cpSync(dataDir, temporaryData, { recursive: true });
    else privateDirectory(temporaryData);

    for (const relative of SNAPSHOT_FILES) {
      const name = path.basename(relative);
      const target = path.join(temporaryData, name);
      fs.rmSync(target, { force: true });
      if (manifestPaths.has(relative)) {
        fs.copyFileSync(path.join(backupPath, relative), target);
        privateFile(target);
      }
    }
    fs.rmSync(path.join(temporaryData, 'asthen.pid'), { force: true });

    if (manifestPaths.has('.env')) {
      fs.copyFileSync(path.join(backupPath, '.env'), temporaryEnv);
      privateFile(temporaryEnv);
    }

    if (fs.existsSync(dataDir)) {
      fs.renameSync(dataDir, previousData);
      movedData = true;
    }
    fs.renameSync(temporaryData, dataDir);
    installedData = true;

    if (manifestPaths.has('.env')) {
      if (fs.existsSync(envPath)) {
        fs.renameSync(envPath, previousEnv);
        movedEnv = true;
      }
      fs.renameSync(temporaryEnv, envPath);
      privateFile(envPath);
    }

    if (movedData) fs.rmSync(previousData, { recursive: true, force: true });
    if (movedEnv) fs.rmSync(previousEnv, { force: true });
    return { restored: backupId, safetyBackup: safetyBackup.id, createdAt: verified.manifest.createdAt };
  } catch (error) {
    fs.rmSync(temporaryData, { recursive: true, force: true });
    fs.rmSync(temporaryEnv, { force: true });
    if (movedData && fs.existsSync(previousData)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.renameSync(previousData, dataDir);
    } else if (installedData) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    if (movedEnv && fs.existsSync(previousEnv)) {
      fs.rmSync(envPath, { force: true });
      fs.renameSync(previousEnv, envPath);
    }
    throw new Error('Restauração interrompida; os dados anteriores foram preservados. ' + error.message);
  }
}

function pruneLocalArchives(dataDir, now = Date.now()) {
  const archivesDir = path.join(dataDir, 'archives');
  if (!fs.existsSync(archivesDir)) return 0;
  let removed = 0;
  for (const guildEntry of fs.readdirSync(archivesDir, { withFileTypes: true })) {
    if (!guildEntry.isDirectory()) continue;
    const guildDir = path.join(archivesDir, guildEntry.name);
    for (const ticketEntry of fs.readdirSync(guildDir, { withFileTypes: true })) {
      if (!ticketEntry.isDirectory()) continue;
      const ticketDir = path.join(guildDir, ticketEntry.name);
      const stat = fs.statSync(ticketDir);
      if (now - stat.mtimeMs > ARCHIVE_RETENTION_MS) {
        fs.rmSync(ticketDir, { recursive: true, force: true });
        removed += 1;
      }
    }
    if (fs.readdirSync(guildDir).length === 0) fs.rmSync(guildDir, { recursive: true, force: true });
  }
  return removed;
}

async function sendOperationalLog(client, message) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = getGuildConfig(guild.id);
      if (!config.logsChannelId) continue;
      const channel = guild.channels.cache.get(config.logsChannelId)
        || await guild.channels.fetch(config.logsChannelId).catch(() => null);
      if (!channel?.send) continue;
      await channel.send({ content: message, allowedMentions: { parse: [] } });
    } catch (error) {
      console.warn('[Asthen Monitor] Não foi possível publicar no canal de logs:', error.message);
    }
  }
}

export function startMaintenance(client) {
  let stopped = false;
  let backupRunning = false;
  let cleanupRunning = false;
  let previousApiState = null;
  let previousPluginState = null;
  let previousSupabaseState = null;
  let backupHadError = false;

  const runBackup = async () => {
    if (stopped || backupRunning) return;
    backupRunning = true;
    try {
      const result = createBackup({ reason: 'automatic' });
      console.log('[Asthen Backup] Backup criado: ' + result.id + ' (' + result.files + ' arquivo(s)).');
      if (backupHadError) {
        await sendOperationalLog(client, '[ASTHEN] Backup automático normalizado. Último backup: ' + result.id);
      }
      backupHadError = false;
    } catch (error) {
      console.error('[Asthen Backup] Falha no backup automático:', error.message);
      if (!backupHadError) await sendOperationalLog(client, '[ASTHEN] ALERTA: o backup automático falhou. Verifique o console e a pasta backups/.');
      backupHadError = true;
    } finally {
      backupRunning = false;
    }
  };

  const runCleanup = async () => {
    if (stopped || cleanupRunning) return;
    cleanupRunning = true;
    try {
      const dataDir = getStoreDataDir();
      const store = pruneOldStoreData();
      const archives = pruneLocalArchives(dataDir);
      const backups = pruneBackups();
      if (store.drafts || store.tickets || archives || backups) {
        console.log('[Asthen Cleanup] Rascunhos: ' + store.drafts +
          ', tickets arquivados: ' + store.tickets +
          ', arquivos locais: ' + archives +
          ', backups antigos: ' + backups + '.');
      }
    } catch (error) {
      console.error('[Asthen Cleanup] Falha na limpeza automática:', error.message);
      await sendOperationalLog(client, '[ASTHEN] ALERTA: a limpeza automática encontrou um erro. Verifique o console.');
    } finally {
      cleanupRunning = false;
    }
  };

  const checkConnections = async () => {
    if (stopped) return;
    const bridge = getBridgeStatus();
    const apiState = bridge.running ? 'online' : 'offline';
    if (previousApiState === 'online' && apiState === 'offline') {
      await sendOperationalLog(client, '[ASTHEN] ALERTA: a API local da Bridge Minecraft ficou offline.');
    } else if (previousApiState === 'offline' && apiState === 'online') {
      await sendOperationalLog(client, '[ASTHEN] API local da Bridge Minecraft voltou a funcionar.');
    }
    previousApiState = apiState;

    const pluginState = !bridge.lastPluginContactAt
      ? 'never'
      : bridge.pluginOnline ? 'online' : 'offline';
    if (previousPluginState === 'online' && pluginState === 'offline') {
      const last = new Date(bridge.lastPluginContactAt).toLocaleString('pt-BR');
      await sendOperationalLog(client, '[ASTHEN] ALERTA: o Minecraft/Plugin-ASTHEN parou de responder. Último contato autenticado: ' + last + '.');
    } else if (previousPluginState === 'offline' && pluginState === 'online') {
      await sendOperationalLog(client, '[ASTHEN] Minecraft/Plugin-ASTHEN voltou a se comunicar com a Bridge.');
    }
    previousPluginState = pluginState;

    const supabase = getSupabaseStatus();
    const dbState = supabase.weeklyStockHealth;
    if (previousSupabaseState === 'ready' && dbState === 'error') {
      await sendOperationalLog(client, '[ASTHEN] ALERTA: o Supabase apresentou erro na consulta/liberação do estoque semanal.');
    } else if (previousSupabaseState === 'error' && dbState === 'ready') {
      await sendOperationalLog(client, '[ASTHEN] A conexão do Supabase e a consulta do estoque semanal foram restabelecidas.');
    }
    previousSupabaseState = dbState;
  };

  const backupTimer = setInterval(() => { void runBackup(); }, BACKUP_INTERVAL_MS);
  const cleanupTimer = setInterval(() => { void runCleanup(); }, CLEANUP_INTERVAL_MS);
  const monitorTimer = setInterval(() => { void checkConnections(); }, MONITOR_INTERVAL_MS);
  const initialBackupTimer = setTimeout(() => { void runBackup(); }, 5000);
  const initialCleanupTimer = setTimeout(() => { void runCleanup(); }, 60_000);
  const initialMonitorTimer = setTimeout(() => { void checkConnections(); }, MONITOR_INTERVAL_MS);
  for (const timer of [backupTimer, cleanupTimer, monitorTimer, initialBackupTimer, initialCleanupTimer, initialMonitorTimer]) {
    timer.unref?.();
  }

  return () => {
    stopped = true;
    for (const timer of [backupTimer, cleanupTimer, monitorTimer, initialBackupTimer, initialCleanupTimer, initialMonitorTimer]) {
      clearInterval(timer);
      clearTimeout(timer);
    }
  };
}
