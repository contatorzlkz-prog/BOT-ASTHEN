'use strict';
/**
 * asthen-bridge.js — o lado do BOT na integração com o plugin DiscordKitBridge.
 *
 * Sem dependências (Node 18+). Funciona assim:
 *   1. O bot sobe este servidor pequeno (startBridge) num endereço que o servidor Minecraft alcança.
 *   2. Quando a equipe APROVA uma compra, o bot chama bridge.deliverKit({...}).
 *   3. O plugin (que só faz conexões de SAÍDA) consulta /plugin/v1/pull, entrega o kit no jogo
 *      e devolve o resultado em /plugin/v1/result. A Promise de deliverKit então resolve.
 *
 * Segurança: todas as rotas exigem "Authorization: Bearer <token>" (mesmo token do config.yml do plugin).
 */

const http = require('http');
const crypto = require('crypto');

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const KIT_RE = /^[A-Za-z0-9_-]{1,32}$/;
const PLAYER_RE = /^[A-Za-z0-9_. ]{1,32}$/;
const JAVA_PLAYER_RE = /^[A-Za-z0-9_]{3,16}$/;

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

/**
 * @param {object} opts
 * @param {string} opts.token        segredo compartilhado (mín. 24 caracteres)
 * @param {number} [opts.port=8787]
 * @param {string} [opts.host='0.0.0.0']
 * @param {number} [opts.leaseMs=15000]  tempo até um pedido não respondido ser oferecido de novo ao plugin
 * @param {(kits: Array<{name:string, enabled:boolean, items:number, price:number|null, price_cents:number|null, for_sale:boolean}>) => void} [opts.onKits]
 */
function startBridge(opts) {
  const { token, port = Number(process.env.DKB_PORT || 8787), host = '127.0.0.1', leaseMs = 15000, maxBody = 64 * 1024, onKits = () => {}, log = console } = opts || {};
  if (typeof token !== 'string' || token.length < 24) throw new Error('token precisa ter pelo menos 24 caracteres');

  /** @type {Map<string, {payload:object, leasedAt:number, promise:Promise<object>, resolve:Function, reject:Function, timer:any}>} */
  const waiting = new Map();
  let lastKits = [];

  function send(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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
        const now = Date.now();
        const out = [];
        for (const entry of waiting.values()) {
          if (out.length >= limit) break;
          if (now - entry.leasedAt >= leaseMs) {
            entry.leasedAt = now; // "alugado": só volta a ser oferecido se o plugin não responder a tempo
            out.push(entry.payload);
          }
        }
        if (out.length === 0) {
          res.writeHead(204);
          return res.end();
        }
        return send(res, 200, { requests: out });
      }

      if (req.method === 'POST' && url.pathname === '/plugin/v1/result') {
        const body = await readJson(req);
        const entry = typeof body.request_id === 'string' ? waiting.get(body.request_id) : undefined;
        if (!entry) return send(res, 404, { success: false, status: 'NOT_FOUND' }); // o plugin para de reenviar
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
        try { onKits(lastKits); } catch (e) { log.error && log.error('[asthen-bridge] onKits falhou:', e); }
        return send(res, 200, { success: true });
      }

      return send(res, 404, { success: false, status: 'NOT_FOUND' });
    } catch (e) {
      return send(res, e.code === 413 || e.code === 400 ? e.code : 500, { success: false, status: 'ERROR', message: e.message });
    }
  });

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address().port));
  });

  /**
   * Pede ao plugin para entregar um kit. Chame SOMENTE depois que a compra foi aprovada.
   *
   * Resolve com o resultado do plugin, p. ex.:
   *   { success:true, status:'KIT_DELIVERED', request_id, player, platform, kit, message, history:[...] }
   * Estados de falha também RESOLVEM (success:false, status:'PLAYER_OFFLINE' | 'KIT_NOT_FOUND' | ...).
   * Só REJEITA se o plugin não responder dentro de timeoutMs.
   *
   * IMPORTANTE: se der timeout, repita o pedido com o MESMO requestId — o plugin nunca entrega duas
   * vezes o mesmo request_id e devolve o resultado original.
   *
   * @param {{requestId:string, player:string, platform:'bedrock'|'java', kit:string, timeoutMs?:number}} r
   */
  function deliverKit(r) {
    const { requestId, player, platform, kit, timeoutMs = 60000 } = r || {};
    if (!ID_RE.test(requestId || '')) return Promise.reject(new Error('requestId inválido'));
    if (!PLAYER_RE.test(player || '') || player.trim() !== player) return Promise.reject(new Error('Nick Minecraft inválido.'));
    if (platform === 'java' && !JAVA_PLAYER_RE.test(player)) return Promise.reject(new Error('Nick Java inválido. Use de 3 a 16 letras, números ou _.'));
    if (platform !== 'bedrock' && platform !== 'java') return Promise.reject(new Error('platform deve ser "bedrock" ou "java"'));
    if (!KIT_RE.test(kit || '')) return Promise.reject(new Error('Nome do kit inválido.'));

    const existing = waiting.get(requestId);
    if (existing) return existing.promise;

    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const timer = setTimeout(() => {
      waiting.delete(requestId);
      reject(Object.assign(new Error('o plugin não respondeu a tempo'), { code: 'BRIDGE_TIMEOUT', requestId }));
    }, timeoutMs);
    if (timer.unref) timer.unref();
    waiting.set(requestId, {
      payload: { request_id: requestId, player, platform, kit },
      leasedAt: 0,
      promise, resolve, reject, timer,
    });
    return promise;
  }

  return {
    listening,
    deliverKit,
    kits: () => lastKits.slice(),
    pendingCount: () => waiting.size,
    close: () => new Promise((r) => server.close(() => r())),
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
    onKits: (k) => console.log(`[asthen-bridge] plugin conectado. Kits: ${k.map((x) => x.name).join(', ') || '(nenhum)'}`),
  });
  b.listening.then((p) => console.log(`[asthen-bridge] aguardando o plugin na porta ${p}`));
}
