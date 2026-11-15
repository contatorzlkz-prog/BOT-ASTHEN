import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bridgeModule from '../bot-integration/asthen-bridge.js';

const { startBridge: createBridge } = bridgeModule;
let bridgeInstance = null;
let activeSecret = '';
let boundHost = null;
let boundPort = null;
let lastKits = [];
let lastKitsSyncAt = null;

function persistSecret(secret) {
  const envPath = path.resolve(process.cwd(), '.env');
  let contents = '';
  try {
    contents = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const line = 'DKB_SECRET=' + secret;
  if (/^[ \t]*DKB_SECRET[ \t]*=.*$/m.test(contents)) {
    contents = contents.replace(/^[ \t]*DKB_SECRET[ \t]*=.*$/m, line);
  } else {
    if (contents && !contents.endsWith('\n')) contents += '\n';
    contents += line + '\n';
  }
  const temporaryPath = envPath + '.tmp';
  fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, envPath);
}

export function ensureBridgeSecret() {
  let token = String(process.env.DKB_SECRET || '').trim();
  const generated = !token;
  if (!token) token = 'ASTHEN_' + crypto.randomBytes(32).toString('base64url');
  if (token.length < 32) {
    throw new Error('DKB_SECRET precisa ter pelo menos 32 caracteres. O valor salvo no .env será preservado entre atualizações.');
  }
  persistSecret(token);
  process.env.DKB_SECRET = token;
  activeSecret = token;
  return { token, generated };
}

export function getBridgeSecret() {
  return activeSecret || String(process.env.DKB_SECRET || '').trim();
}

export function getBridgeStatus() {
  return {
    running: Boolean(bridgeInstance),
    host: boundHost,
    port: boundPort,
    pending: bridgeInstance?.pendingCount?.() || 0,
    kits: (bridgeInstance?.kits?.() || lastKits).map(kit => ({ ...kit })),
    lastKitsSyncAt
  };
}

export async function startBridge({
  token = getBridgeSecret(),
  host = process.env.DKB_HOST?.trim() || '127.0.0.1',
  port = Number(process.env.DKB_PORT || 8787),
  leaseMs = 15000,
  onKits = () => {},
  log = console
} = {}) {
  if (bridgeInstance) throw new Error('A API de integração já está em execução.');
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('A chave DKB_SECRET não foi configurada corretamente.');
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) {
    throw new Error('DKB_PORT precisa ser uma porta válida entre 0 e 65535.');
  }

  const instance = createBridge({
    token,
    host,
    port: Number(port),
    leaseMs,
    onKits: kits => {
      lastKits = Array.isArray(kits) ? kits.map(kit => ({ ...kit })) : [];
      lastKitsSyncAt = new Date().toISOString();
      try {
        onKits(lastKits.map(kit => ({ ...kit })));
      } catch (error) {
        log.error('[Asthen Bridge] Não foi possível processar a lista de kits:', error);
      }
    },
    log
  });

  try {
    const listeningPort = await instance.listening;
    bridgeInstance = instance;
    activeSecret = token;
    boundHost = host;
    boundPort = listeningPort;
    return {
      host,
      port: listeningPort,
      close: async () => {
        await instance.close();
        if (bridgeInstance === instance) bridgeInstance = null;
      }
    };
  } catch (error) {
    await instance.close().catch(() => {});
    throw error;
  }
}

export function deliverKit(request) {
  if (!bridgeInstance) {
    return Promise.reject(Object.assign(new Error('A API de integração não está em execução.'), {
      code: 'BRIDGE_OFFLINE'
    }));
  }
  return bridgeInstance.deliverKit(request);
}
