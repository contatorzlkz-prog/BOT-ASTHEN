import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const KIT_RE = /^[A-Za-z0-9_-]{1,32}$/;
const JAVA_PLAYER_RE = /^[A-Za-z0-9_]{3,16}$/;

const waiting = new Map();
let activeSecret = '';
let server = null;
let boundHost = null;
let boundPort = null;
let lastKits = [];

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function safeEqual(received, expected) {
  return crypto.timingSafeEqual(digest(received), digest(expected));
}

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
    throw new Error('DKB_SECRET precisa ter pelo menos 32 caracteres. Use /bridge regenerar para criar uma chave segura.');
  }

  persistSecret(token);
  process.env.DKB_SECRET = token;
  activeSecret = token;
  return { token, generated };
}

export function getBridgeSecret() {
  return activeSecret || String(process.env.DKB_SECRET || '').trim();
}

export function regenerateBridgeSecret() {
  const token = 'ASTHEN_' + crypto.randomBytes(32).toString('base64url');
  persistSecret(token);
  process.env.DKB_SECRET = token;
  activeSecret = token;
  return token;
}

export function getBridgeStatus() {
  const address = server && server.listening ? server.address() : null;
  return {
    running: Boolean(server && server.listening),
    host: boundHost,
    port: address && typeof address === 'object' ? address.port : boundPort,
    pending: waiting.size,
    kits: lastKits.map(kit => ({ ...kit }))
  };
}

async function readJson(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error('O corpo da requisição é maior que o permitido.');
      error.code = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON inválido.');
    error.code = 400;
    throw error;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

export async function startBridge({
  token = getBridgeSecret(),
  host = '127.0.0.1',
  port = 8787,
  leaseMs = 15000,
  maxBodyBytes = 64 * 1024,
  onKits = () => {},
  log = console
} = {}) {
  if (server && server.listening) {
    throw new Error('A API de integração já está em execução.');
  }
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('A chave DKB_SECRET não foi configurada corretamente.');
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) {
    throw new Error('DKB_PORT precisa ser uma porta válida entre 0 e 65535.');
  }

  activeSecret = token;
  boundHost = host;
  boundPort = Number(port);

  const api = http.createServer(async (request, response) => {
    try {
      const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || '').trim());
      if (!match || !safeEqual(match[1].trim(), activeSecret)) {
        return sendJson(response, 401, { success: false, status: 'UNAUTHORIZED' });
      }

      const url = new URL(request.url || '/', 'http://127.0.0.1');

      if (request.method === 'GET' && url.pathname === '/plugin/v1/pull') {
        const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '5', 10) || 5;
        const limit = Math.min(20, Math.max(1, requestedLimit));
        const now = Date.now();
        const requests = [];

        for (const entry of waiting.values()) {
          if (requests.length >= limit) break;
          if (now - entry.leasedAt >= leaseMs) {
            entry.leasedAt = now;
            requests.push(entry.payload);
          }
        }

        if (!requests.length) {
          response.writeHead(204);
          return response.end();
        }
        return sendJson(response, 200, { requests });
      }

      if (request.method === 'POST' && url.pathname === '/plugin/v1/result') {
        const body = await readJson(request, maxBodyBytes);
        const requestId = typeof body.request_id === 'string' ? body.request_id : '';
        const entry = waiting.get(requestId);
        if (!entry) return sendJson(response, 404, { success: false, status: 'NOT_FOUND' });

        if (body.final === true) {
          clearTimeout(entry.timer);
          waiting.delete(requestId);
          entry.resolve(body);
        }
        return sendJson(response, 200, { success: true });
      }

      if (request.method === 'POST' && url.pathname === '/plugin/v1/kits') {
        const body = await readJson(request, maxBodyBytes);
        lastKits = Array.isArray(body.kits)
          ? body.kits
            .filter(item => item && typeof item.name === 'string')
            .map(item => ({
              name: item.name,
              enabled: item.enabled === true,
              items: Number.isFinite(Number(item.items)) ? Number(item.items) : 0
            }))
            .slice(0, 200)
          : [];
        try {
          onKits(lastKits.map(item => ({ ...item })));
        } catch (error) {
          log.error('[Asthen Bridge] Não foi possível processar a lista de kits:', error);
        }
        return sendJson(response, 200, { success: true });
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, {
          success: true,
          status: 'OK',
          pending: waiting.size,
          kits: lastKits.length
        });
      }

      return sendJson(response, 404, { success: false, status: 'NOT_FOUND' });
    } catch (error) {
      if (!response.headersSent) {
        const status = error.code === 413 || error.code === 400 ? error.code : 500;
        sendJson(response, status, { success: false, status: 'ERROR', message: error.message });
      } else {
        response.destroy();
      }
    }
  });

  server = api;
  await new Promise((resolve, reject) => {
    const onError = error => {
      api.removeListener('listening', onListening);
      server = null;
      reject(error);
    };
    const onListening = () => {
      api.removeListener('error', onError);
      resolve();
    };
    api.once('error', onError);
    api.once('listening', onListening);
    api.listen(Number(port), host);
  });

  const address = api.address();
  boundPort = address && typeof address === 'object' ? address.port : Number(port);

  return {
    host,
    port: boundPort,
    close: async () => {
      for (const [requestId, entry] of waiting) {
        clearTimeout(entry.timer);
        entry.reject(new Error('A API de integração foi encerrada.'));
        waiting.delete(requestId);
      }
      if (api.listening) {
        await new Promise(resolve => api.close(resolve));
      }
      if (server === api) server = null;
    }
  };
}

export function deliverKit({
  requestId,
  player,
  platform = 'java',
  kit,
  timeoutMs = 60000
} = {}) {
  if (!server || !server.listening) {
    return Promise.reject(Object.assign(new Error('A API de integração não está em execução.'), { code: 'BRIDGE_OFFLINE' }));
  }
  if (!ID_RE.test(requestId || '')) return Promise.reject(new Error('Identificador do pedido inválido.'));
  if (!JAVA_PLAYER_RE.test(player || '')) return Promise.reject(new Error('Nick Java inválido. Use de 3 a 16 letras, números ou _.'));
  if (platform !== 'java') return Promise.reject(new Error('Esta loja está configurada somente para Minecraft Java.'));
  if (!KIT_RE.test(kit || '')) return Promise.reject(new Error('Nome do kit inválido. Use letras, números, _ ou - (até 32 caracteres).'));

  const existing = waiting.get(requestId);
  if (existing) return existing.promise;

  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const timer = setTimeout(() => {
    waiting.delete(requestId);
    rejectPromise(Object.assign(new Error('O plugin não respondeu dentro do tempo esperado.'), {
      code: 'BRIDGE_TIMEOUT',
      requestId
    }));
  }, Math.max(5000, Number(timeoutMs) || 60000));
  if (timer.unref) timer.unref();

  waiting.set(requestId, {
    payload: { request_id: requestId, player, platform, kit },
    leasedAt: 0,
    promise,
    resolve: resolvePromise,
    timer
  });

  return promise;
}
