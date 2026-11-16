'use strict';
/**
 * asthen-bridge.js — o lado do BOT na integração com o plugin DiscordKitBridge.
 *
 * Sem dependências (Node 18+). Funciona assim:
 *   1. O bot sobe este servidor pequeno em 127.0.0.1:8787.
 *   2. O plugin faz conexões de saída para GET /plugin/v1/pull.
 *   3. O plugin usa Long Polling: a conexão pode aguardar até 25 s por um pedido.
 *   4. Quando uma compra é aprovada, o bot acorda imediatamente um pull que esteja aguardando.
 *   5. O plugin entrega o kit e devolve o resultado em /plugin/v1/result.
 *
 * Compatibilidade: clientes antigos sem wait_ms continuam recebendo 204 imediato.
 * Segurança: todas as rotas exigem "Authorization: Bearer <token>".
 */

const http = require('http');
const crypto = require('crypto');

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const KIT_RE = /^[A-Za-z0-9_-]{1,32}$/;
const PLAYER_RE = /^[A-Za-z0-9_. ]{1,32}$/;
const JAVA_PLAYER_RE = /^[A-Za-z0-9_]{3,16}$/;
const DEFAULT_MAX_LONG_POLL_MS = 25_000;

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

/**
 * @param {object} opts
 * @param {string} opts.token        segredo compartilhado (mín. 24 caracteres)
 * @param {number} [opts.port=Number(process.env.DKB_PORT || 8787)]
 * @param {string} [opts.host='127.0.0.1']
 * @param {number} [opts.leaseMs=15000] tempo até um pedido não respondido ser oferecido novamente
 * @param {number} [opts.maxLongPollMs=25000] limite máximo de espera de um GET /pull
 * @param {(kits: Array<{name:string, enabled:boolean, items:number, price:number|null, price_cents:number|null, for_sale:boolean}>) => void} [opts.onKits]
 */
function startBridge(opts) {
  const {
    token,
    port = Number(process.env.DKB_PORT || 8787),
    host = '127.0.0.1',
    leaseMs = 15000,
    maxLongPollMs = DEFAULT_MAX_LONG_POLL_MS,
    maxBody = 64 * 1024,
    onKits = () => {},
    log = console
  } = opts || {};

  if (typeof token !== 'string' || token.length < 24) {
    throw new Error('token precisa ter pelo menos 24 caracteres');
  }

  /** @type {Map<string, {payload:object, leasedAt:number, promise:Promise<object>, resolve:Function, reject:Function, timer:any}>} */
  const waiting = new Map();
  /** @type {Set<{res: import('http').ServerResponse, limit:number, timer:NodeJS.Timeout|null}>} */
  const pendingPulls = new Set();
  let lastKits = [];

  function send(res, code, obj) {
    if (res.destroyed || res.writableEnded) return;
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > maxBody) {
          reject(Object.assign(new Error('corpo grande demais'), { code: 413 }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(Object.assign(new Error('JSON inválido'), { code: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  // Marca os pedidos como alugados antes de responder, impedindo que dois pulls
  // simultâneos recebam o mesmo pedido.
  function takeRequests(limit) {
    const now = Date.now();
    const out = [];

    for (const entry of waiting.values()) {
      if (out.length >= limit) break;
      if (now - entry.leasedAt >= leaseMs) {
        entry.leasedAt = now;
        out.push(entry.payload);
      }
    }
    return out;
  }

  function removePullWaiter(waiter) {
    if (waiter.timer) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
    pendingPulls.delete(waiter);
  }

  function finishPull(waiter, requests) {
    if (!pendingPulls.has(waiter)) return;
    removePullWaiter(waiter);

    if (waiter.res.destroyed || waiter.res.writableEnded) return;
    if (requests.length > 0) return send(waiter.res, 200, { requests });

    waiter.res.writeHead(204, { 'Cache-Control': 'no-store' });
    waiter.res.end();
  }

  // Uma aprovação chama esta função e desperta o primeiro pull que estiver ocioso.
  function wakePendingPulls() {
    for (const waiter of pendingPulls) {
      const requests = takeRequests(waiter.limit);
      if (requests.length > 0) finishPull(waiter, requests);
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const m = /^Bearer\s+(.+)$/i.exec((req.headers.authorization || '').trim());
      if (!m || !safeEqual(m[1].trim(), token)) {
        log.warn && log.warn('[asthen-bridge] chamada recusada: token inválido');
        return send(res, 401, { success: false, status: 'UNAUTHORIZED' });
      }

      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/plugin/v1/pull') {
        const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '5', 10) || 5));
        const immediate = takeRequests(limit);
        if (immediate.length > 0) return send(res, 200, { requests: immediate });

        // Sem wait_ms, preserva o comportamento antigo: 204 imediatamente.
        const parsedWait = Number.parseInt(url.searchParams.get('wait_ms') || '0', 10);
        const waitMs = Number.isFinite(parsedWait)
          ? Math.min(Math.max(0, parsedWait), Math.max(0, maxLongPollMs))
          : 0;

        if (waitMs <= 0) {
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          return res.end();
        }

        const waiter = { res, limit, timer: null };
        pendingPulls.add(waiter);
        waiter.timer = setTimeout(() => finishPull(waiter, []), waitMs);

        // Remove a espera se o cliente cancelar a conexão ou perder a rede.
        res.once('close', () => {
          if (!res.writableEnded) removePullWaiter(waiter);
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/plugin/v1/result') {
        const body = await readJson(req);
        const entry = typeof body.request_id === 'string' ? waiting.get(body.request_id) : undefined;
        if (!entry) return send(res, 404, { success: false, status: 'NOT_FOUND' });
        if (body.final === true) {
          clearTimeout(entry.timer);
          waiting.delete(body.request_id);
          entry.resolve(body);
        }
        return send(res, 200, { success: true });
      }

      if (req.method === 'POST' && url.pathname === '/plugin/v1/kits') {
        const body = await readJson(req);
        lastKits = Array.isArray(body.kits) ? body.kits : [];
        try {
          onKits(lastKits);
        } catch (e) {
          log.error && log.error('[asthen-bridge] onKits falhou:', e);
        }
        return send(res, 200, { success: true });
      }

      return send(res, 404, { success: false, status: 'NOT_FOUND' });
    } catch (e) {
      return send(res, e.code === 413 || e.code === 400 ? e.code : 500, {
        success: false,
        status: 'ERROR',
        message: e.message
      });
    }
  });

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address().port));
  });

  /**
   * Pede ao plugin para entregar um kit. Chame SOMENTE depois que a compra foi aprovada.
   *
   * Resolve com o resultado do plugin. Só rejeita se o plugin não responder dentro de timeoutMs.
   * Se der timeout, repita o pedido com o MESMO requestId para evitar duplicidade.
   *
   * @param {{requestId:string, player:string, platform:'bedrock'|'java', kit:string, timeoutMs?:number}} r
   */
  function deliverKit(r) {
    const { requestId, player, platform, kit, timeoutMs = 60000 } = r || {};
    if (!ID_RE.test(requestId || '')) return Promise.reject(new Error('requestId inválido'));
    if (!PLAYER_RE.test(player || '') || player.trim() !== player) {
      return Promise.reject(new Error('Nick Minecraft inválido.'));
    }
    if (platform === 'java' && !JAVA_PLAYER_RE.test(player)) {
      return Promise.reject(new Error('Nick Java inválido. Use de 3 a 16 letras, números ou _.'));
    }
    if (platform !== 'bedrock' && platform !== 'java') {
      return Promise.reject(new Error('platform deve ser "bedrock" ou "java"'));
    }
    if (!KIT_RE.test(kit || '')) return Promise.reject(new Error('Nome do kit inválido.'));

    const existing = waiting.get(requestId);
    if (existing) return existing.promise;

    let resolve, reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const timer = setTimeout(() => {
      waiting.delete(requestId);
      reject(Object.assign(new Error('o plugin não respondeu a tempo'), {
        code: 'BRIDGE_TIMEOUT',
        requestId
      }));
    }, timeoutMs);
    if (timer.unref) timer.unref();

    waiting.set(requestId, {
      payload: { request_id: requestId, player, platform, kit },
      leasedAt: 0,
      promise,
      resolve,
      reject,
      timer
    });

    wakePendingPulls();
    return promise;
  }

  function close() {
    // Não deixa requisições long-poll abertas impedirem o encerramento do bot.
    for (const waiter of [...pendingPulls]) {
      removePullWaiter(waiter);
      send(waiter.res, 503, { success: false, status: 'BRIDGE_SHUTTING_DOWN' });
    }
    return new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  return {
    listening,
    deliverKit,
    kits: () => lastKits.slice(),
    pendingCount: () => waiting.size,
    longPollCount: () => pendingPulls.size,
    close
  };
}

module.exports = { startBridge };

// Execução direta: apenas sobe o servidor (útil para testar a conexão com o plugin).
if (require.main === module) {
  const token = process.env.DKB_SECRET;
  if (!token) {
    console.error('Defina DKB_SECRET com o mesmo token do config.yml do plugin (bridge.secret).');
    process.exit(1);
  }
  const b = startBridge({
    token,
    port: Number(process.env.PORT || 8787),
    onKits: (k) => console.log('[asthen-bridge] plugin conectado. Kits: ' +
      (k.map((x) => x.name).join(', ') || '(nenhum)'))
  });
  b.listening.then((p) => console.log('[asthen-bridge] aguardando o plugin na porta ' + p));
}
