'use strict';

/**
 * ASTHEN bridge transport.
 * The durable job journal is authoritative; HTTP long-poll sockets and Promise
 * waiters are process-local and are reconstructed from the journal after restart.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const KIT_RE = /^[A-Za-z0-9_-]{1,32}$/;
const PLAYER_RE = /^[A-Za-z0-9_. ]{1,32}$/;
const JAVA_PLAYER_RE = /^[A-Za-z0-9_]{3,16}$/;
const DEFAULT_MAX_LONG_POLL_MS = 25_000;
const TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set([
  'OK', 'KIT_DELIVERED', 'KIT_PENDING', 'INVALID_REQUEST', 'UNAUTHORIZED',
  'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'PAYLOAD_TOO_LARGE', 'RATE_LIMITED',
  'PLAYER_OFFLINE', 'PLATFORM_MISMATCH', 'PLATFORM_UNVERIFIABLE',
  'KIT_NOT_FOUND', 'KIT_DISABLED', 'KIT_CORRUPT', 'INVENTORY_FULL',
  'DELIVERY_DISABLED', 'DUPLICATE_REQUEST', 'TIMEOUT', 'INTERNAL_ERROR'
]);

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validPayload(payload) {
  return isRecord(payload)
    && typeof payload.request_id === 'string'
    && ID_RE.test(payload.request_id)
    && typeof payload.player === 'string'
    && PLAYER_RE.test(payload.player)
    && (payload.platform === 'java' || payload.platform === 'bedrock')
    && (payload.platform !== 'java' || JAVA_PLAYER_RE.test(payload.player))
    && typeof payload.kit === 'string'
    && KIT_RE.test(payload.kit);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function startBridge(opts) {
  const {
    token,
    port = Number(process.env.DKB_PORT || 8787),
    host = '127.0.0.1',
    leaseMs = 90_000,
    maxLongPollMs = DEFAULT_MAX_LONG_POLL_MS,
    maxBody = 64 * 1024,
    maxLongPollConnections = 8,
    dataDir = process.env.ASTHEN_DATA_DIR || path.resolve(process.cwd(), 'data'),
    onKits = () => {},
    onResult = () => {},
    onDeliveryUpdate = () => {},
    log = console
  } = opts || {};

  if (typeof token !== 'string' || token.length < 24) {
    throw new Error('token precisa ter pelo menos 24 caracteres');
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) {
    throw new Error('port precisa ser uma porta válida entre 0 e 65535');
  }

  const queueFile = path.join(dataDir, 'bridge-queue.json');
  const jobs = new Map();
  const resultWaiters = new Map();
  const pendingPulls = new Set();
  let lastKits = [];
  let closing = false;
  let lastUnauthorizedWarningAt = 0;

  function persistJobs() {
    fs.mkdirSync(dataDir, { recursive: true });
    const body = JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      jobs: Array.from(jobs.values())
    }, null, 2) + '\n';
    const temporary = queueFile + '.tmp';
    const fd = fs.openSync(temporary, 'w', 0o600);
    try {
      fs.writeFileSync(fd, body, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, queueFile);
  }

  function loadJobs() {
    let raw;
    try {
      raw = fs.readFileSync(queueFile, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw new Error('Não foi possível ler a fila persistente da Bridge: ' + error.message);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const backup = queueFile + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
      try {
        fs.copyFileSync(queueFile, backup, fs.constants.COPYFILE_EXCL);
      } catch (backupError) {
        log.error && log.error('[asthen-bridge] não foi possível copiar a fila corrompida:', backupError.message);
      }
      throw new Error('A fila persistente da Bridge está corrompida. O arquivo original foi preservado. ' + error.message);
    }

    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
      const backup = queueFile + '.invalid-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
      try {
        fs.copyFileSync(queueFile, backup, fs.constants.COPYFILE_EXCL);
      } catch (backupError) {
        log.error && log.error('[asthen-bridge] não foi possível copiar a fila incompatível:', backupError.message);
      }
      throw new Error('A estrutura de data/bridge-queue.json é incompatível. O arquivo original foi preservado; não será iniciada uma fila vazia.');
    }

    for (const item of parsed.jobs) {
      if (!isRecord(item) || !validPayload(item.payload) || item.payload.request_id !== item.requestId) {
        throw new Error('A fila persistente contém um registro inválido. O arquivo foi preservado e a Bridge não vai iniciar.');
      }
      if (jobs.has(item.requestId)) {
        throw new Error('A fila persistente contém request_id duplicado: ' + item.requestId);
      }
      jobs.set(item.requestId, {
        requestId: item.requestId,
        payload: clone(item.payload),
        status: String(item.status || 'QUEUED'),
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
        leasedAt: Number(item.leasedAt) || 0,
        leaseUntil: Number(item.leaseUntil) || 0,
        attempts: Number.isInteger(item.attempts) && item.attempts >= 0 ? item.attempts : 0,
        guildId: typeof item.guildId === 'string' ? item.guildId : null,
        ticketId: typeof item.ticketId === 'string' ? item.ticketId : null,
        result: isRecord(item.result) ? clone(item.result) : null,
        deliveryUpdate: isRecord(item.deliveryUpdate) ? clone(item.deliveryUpdate) : null
      });
    }

    // The Bridge is a single-process service. On startup, every persisted lease
    // belongs to the previous process and must be made available immediately.
    // The request_id and payload stay unchanged, preserving idempotency.
    for (const job of jobs.values()) {
      if (job.status === 'LEASED') {
        job.status = 'QUEUED';
        job.leasedAt = 0;
        job.leaseUntil = 0;
      }
    }
    if (jobs.size) persistJobs();
  }

  function pruneTerminalJobs() {
    const cutoff = Date.now() - TERMINAL_RETENTION_MS;
    let changed = false;
    for (const [requestId, job] of jobs) {
      // KIT_PENDING remains unresolved and is never removed by retention.
      if (job.status !== 'KIT_PENDING'
          && job.result
          && job.updatedAt < cutoff) {
        jobs.delete(requestId);
        changed = true;
      }
    }
    if (changed) persistJobs();
  }

  function sendJson(res, status, body) {
    if (res.destroyed || res.writableEnded) return;
    const json = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(json);
  }

  function sendEmpty(res, status) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Cache-Control': 'no-store' });
    res.end();
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxBody) {
          reject(Object.assign(new Error('corpo grande demais'), { code: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!isRecord(parsed)) throw new Error('O corpo precisa ser um objeto JSON.');
          resolve(parsed);
        } catch (error) {
          reject(Object.assign(new Error('JSON inválido: ' + error.message), { code: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  function activePendingCount() {
    let count = 0;
    for (const job of jobs.values()) {
      if (job.status === 'QUEUED' || job.status === 'LEASED') count += 1;
    }
    return count;
  }

  function queueCounts() {
    const counts = { queued: 0, leased: 0, kitPending: 0, delivered: 0, failed: 0, total: jobs.size };
    for (const job of jobs.values()) {
      if (job.status === 'QUEUED') counts.queued += 1;
      else if (job.status === 'LEASED') counts.leased += 1;
      else if (job.status === 'KIT_PENDING') counts.kitPending += 1;
      else if (job.status === 'KIT_DELIVERED') counts.delivered += 1;
      else counts.failed += 1;
    }
    return counts;
  }

  function takeRequests(limit) {
    const now = Date.now();
    const out = [];
    const changed = [];
    for (const job of jobs.values()) {
      if (out.length >= limit) break;
      const available = job.status === 'QUEUED'
        || (job.status === 'LEASED' && job.leaseUntil <= now);
      if (!available) continue;
      changed.push({
        job,
        status: job.status,
        leasedAt: job.leasedAt,
        leaseUntil: job.leaseUntil,
        attempts: job.attempts,
        updatedAt: job.updatedAt
      });
      job.status = 'LEASED';
      job.leasedAt = now;
      job.leaseUntil = now + Math.max(1000, leaseMs);
      job.attempts += 1;
      job.updatedAt = now;
      out.push(clone(job.payload));
    }
    if (out.length) {
      try {
        persistJobs();
      } catch (error) {
        for (const previous of changed) {
          Object.assign(previous.job, {
            status: previous.status,
            leasedAt: previous.leasedAt,
            leaseUntil: previous.leaseUntil,
            attempts: previous.attempts,
            updatedAt: previous.updatedAt
          });
        }
        throw error;
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
    if (requests.length > 0) return sendJson(waiter.res, 200, { requests });
    sendEmpty(waiter.res, 204);
  }

  function wakePendingPulls() {
    for (const waiter of pendingPulls) {
      const requests = takeRequests(waiter.limit);
      if (requests.length > 0) finishPull(waiter, requests);
    }
  }

  function attachResultWaiter(job, timeoutMs) {
    const existing = resultWaiters.get(job.requestId);
    if (existing) return existing.promise;

    let resolve;
    let reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const timer = setTimeout(() => {
      const current = resultWaiters.get(job.requestId);
      if (current?.promise !== promise) return;
      resultWaiters.delete(job.requestId);
      reject(Object.assign(new Error('o plugin não respondeu a tempo; o pedido continua salvo na fila persistente'), {
        code: 'BRIDGE_TIMEOUT',
        requestId: job.requestId
      }));
    }, Math.max(1000, timeoutMs));
    timer.unref?.();
    resultWaiters.set(job.requestId, { promise, resolve, reject, timer });
    return promise;
  }

  function settleResultWaiter(requestId, result) {
    const waiter = resultWaiters.get(requestId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    resultWaiters.delete(requestId);
    waiter.resolve(clone(result));
  }

  function rejectResultWaiters(error) {
    for (const [requestId, waiter] of resultWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(Object.assign(new Error(error.message), { code: error.code, requestId }));
    }
    resultWaiters.clear();
  }

  function notifyCallback(callback, label, value) {
    try {
      Promise.resolve(callback(clone(value))).catch(error => {
        log.error && log.error('[asthen-bridge] ' + label + ' falhou depois da persistência:', error);
      });
    } catch (error) {
      log.error && log.error('[asthen-bridge] ' + label + ' falhou depois da persistência:', error);
    }
  }

  function acceptFinalResult(body) {
    const job = jobs.get(body.request_id);
    if (!job) return { status: 404, body: { success: false, status: 'NOT_FOUND' } };

    if ((body.player && body.player !== job.payload.player)
        || (body.platform && body.platform !== job.payload.platform)
        || (body.kit && body.kit !== job.payload.kit)) {
      return { status: 409, body: { success: false, status: 'PAYLOAD_MISMATCH' } };
    }

    if (job.result) {
      if (String(job.result.status || '') === String(body.status || '')
          && job.result.final === true) {
        notifyCallback(onResult, 'onResult duplicate replay', {
          request: job.payload,
          result: job.result,
          resumed: true
        });
        return { status: 200, body: { success: true, duplicate: true } };
      }
      return { status: 409, body: { success: false, status: 'RESULT_CONFLICT' } };
    }

    const hadWaiter = resultWaiters.has(job.requestId);
    const previous = {
      result: job.result,
      status: job.status,
      updatedAt: job.updatedAt,
      leaseUntil: job.leaseUntil
    };
    job.result = clone(body);
    job.status = body.status === 'KIT_PENDING'
      ? 'KIT_PENDING'
      : body.status === 'KIT_DELIVERED' ? 'KIT_DELIVERED' : 'FAILED';
    job.updatedAt = Date.now();
    job.leaseUntil = 0;
    try {
      persistJobs();
    } catch (error) {
      Object.assign(job, previous);
      throw error;
    }

    settleResultWaiter(job.requestId, body);
    notifyCallback(onResult, 'onResult', { request: job.payload, result: body, resumed: !hadWaiter });
    return { status: 200, body: { success: true } };
  }

  function acceptDeliveryUpdate(body) {
    const job = jobs.get(body.request_id);
    if (!job) return { status: 404, body: { success: false, status: 'NOT_FOUND' } };

    if (body.status !== 'KIT_DELIVERED') {
      return { status: 400, body: { success: false, status: 'INVALID_STATUS' } };
    }
    if ((body.player && body.player !== job.payload.player)
        || (body.platform && body.platform !== job.payload.platform)
        || (body.kit && body.kit !== job.payload.kit)) {
      return { status: 409, body: { success: false, status: 'PAYLOAD_MISMATCH' } };
    }

    if (job.status === 'KIT_DELIVERED') {
      if (job.deliveryUpdate?.status === 'KIT_DELIVERED') {
        notifyCallback(onDeliveryUpdate, 'onDeliveryUpdate', {
          request: job.payload,
          initialResult: job.result,
          update: job.deliveryUpdate,
          replayed: true
        });
        return { status: 200, body: { success: true, duplicate: true } };
      }
      return { status: 409, body: { success: false, status: 'INVALID_TRANSITION' } };
    }
    if (job.status !== 'KIT_PENDING' || !job.result || job.result.status !== 'KIT_PENDING') {
      return { status: 409, body: { success: false, status: 'INVALID_TRANSITION' } };
    }

    const update = {
      request_id: job.requestId,
      status: 'KIT_DELIVERED',
      player: job.payload.player,
      platform: job.payload.platform,
      kit: job.payload.kit,
      message: String(body.message || 'Kit entregue após retirada da pendência.').slice(0, 500),
      updated_at: String(body.updated_at || new Date().toISOString())
    };
    const previous = {
      deliveryUpdate: job.deliveryUpdate,
      status: job.status,
      updatedAt: job.updatedAt
    };
    job.deliveryUpdate = update;
    job.status = 'KIT_DELIVERED';
    job.updatedAt = Date.now();
    try {
      persistJobs();
    } catch (error) {
      Object.assign(job, previous);
      throw error;
    }

    notifyCallback(onDeliveryUpdate, 'onDeliveryUpdate', {
      request: job.payload,
      initialResult: job.result,
      update
    });
    return { status: 200, body: { success: true } };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
      if (!match || !safeEqual(match[1].trim(), token)) {
        const now = Date.now();
        // A public tunnel may receive scanners or a plugin still using an old
        // secret. Keep the first warning but avoid flooding the Windows console.
        if (now - lastUnauthorizedWarningAt >= 60_000) {
          log.warn && log.warn('[asthen-bridge] solicitação recusada: DKB_SECRET ausente ou diferente do segredo configurado no bot.');
          lastUnauthorizedWarningAt = now;
        }
        return sendJson(res, 401, { success: false, status: 'UNAUTHORIZED' });
      }

      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/plugin/v1/pull') {
        const rawLimit = url.searchParams.get('limit') || '5';
        const parsedLimit = Number.parseInt(rawLimit, 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(20, Math.max(1, parsedLimit)) : 5;
        const immediate = takeRequests(limit);
        if (immediate.length) return sendJson(res, 200, { requests: immediate });

        const rawWait = url.searchParams.get('wait_ms');
        const parsedWait = rawWait === null ? 0 : Number.parseInt(rawWait, 10);
        const waitMs = Number.isFinite(parsedWait)
          ? Math.min(Math.max(0, parsedWait), Math.max(0, maxLongPollMs))
          : 0;
        if (waitMs <= 0) return sendEmpty(res, 204);

        if (pendingPulls.size >= Math.max(1, maxLongPollConnections)) {
          return sendJson(res, 429, { success: false, status: 'TOO_MANY_LONG_POLLS' });
        }

        const waiter = { res, limit, timer: null };
        pendingPulls.add(waiter);
        waiter.timer = setTimeout(() => finishPull(waiter, []), waitMs);
        res.once('close', () => {
          if (!res.writableEnded) removePullWaiter(waiter);
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/plugin/v1/result') {
        const body = await readJson(req);
        if (typeof body.request_id !== 'string' || !ID_RE.test(body.request_id) || body.final !== true
            || typeof body.status !== 'string' || !FINAL_STATUSES.has(body.status)
            || (body.message !== undefined && typeof body.message !== 'string')
            || (body.message && body.message.length > 1000)) {
          return sendJson(res, 400, { success: false, status: 'INVALID_RESULT' });
        }
        const accepted = acceptFinalResult(body);
        return sendJson(res, accepted.status, accepted.body);
      }

      if (req.method === 'POST' && url.pathname === '/plugin/v1/delivery-update') {
        const body = await readJson(req);
        if (typeof body.request_id !== 'string' || !ID_RE.test(body.request_id)) {
          return sendJson(res, 400, { success: false, status: 'INVALID_REQUEST_ID' });
        }
        const accepted = acceptDeliveryUpdate(body);
        return sendJson(res, accepted.status, accepted.body);
      }

      if (req.method === 'POST' && url.pathname === '/plugin/v1/kits') {
        const body = await readJson(req);
        if (!Array.isArray(body.kits)) {
          return sendJson(res, 400, { success: false, status: 'INVALID_KIT_LIST' });
        }
        lastKits = clone(body.kits);
        try {
          onKits(clone(lastKits));
        } catch (error) {
          log.error && log.error('[asthen-bridge] onKits falhou:', error);
        }
        return sendJson(res, 200, { success: true });
      }

      return sendJson(res, 404, { success: false, status: 'NOT_FOUND' });
    } catch (error) {
      log.error && log.error('[asthen-bridge] erro HTTP:', error.message);
      if (!res.headersSent) {
        return sendJson(res, error.code === 413 || error.code === 400 ? error.code : 500, {
          success: false,
          status: 'ERROR',
          message: 'Não foi possível processar a solicitação.'
        });
      }
      if (!res.writableEnded) res.destroy();
    }
  });

  loadJobs();
  pruneTerminalJobs();

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address().port));
  });

  // Reconcile durable results with the Discord ticket store after a process restart.
  // Pending delivery updates supersede the earlier KIT_PENDING notification.
  listening.then(() => {
    for (const job of jobs.values()) {
      if (job.deliveryUpdate) {
        notifyCallback(onDeliveryUpdate, 'onDeliveryUpdate replay', {
          request: job.payload,
          initialResult: job.result,
          update: job.deliveryUpdate,
          replayed: true
        });
      } else if (job.result) {
        notifyCallback(onResult, 'onResult replay', {
          request: job.payload,
          result: job.result,
          resumed: true
        });
      }
    }
  }).catch(error => {
    log.error && log.error('[asthen-bridge] falha ao reconciliar resultados persistidos:', error);
  });

  function deliverKit(request) {
    if (closing) {
      return Promise.reject(Object.assign(new Error('Bridge está encerrando; o pedido não foi aceito nesta execução'), {
        code: 'BRIDGE_SHUTTING_DOWN'
      }));
    }
    const {
      requestId,
      player,
      platform,
      kit,
      timeoutMs = 60_000,
      guildId = null,
      ticketId = null
    } = request || {};
    const payload = { request_id: requestId, player, platform, kit };
    if (!validPayload(payload)) {
      if (typeof requestId !== 'string' || !ID_RE.test(requestId)) return Promise.reject(new Error('requestId inválido'));
      if (platform === 'java' && !JAVA_PLAYER_RE.test(player || '')) {
        return Promise.reject(new Error('Nick Java inválido. Use de 3 a 16 letras, números ou _.'));
      }
      if (platform !== 'bedrock' && platform !== 'java') {
        return Promise.reject(new Error('platform deve ser "bedrock" ou "java"'));
      }
      if (!PLAYER_RE.test(player || '') || player.trim() !== player) return Promise.reject(new Error('Nick Minecraft inválido.'));
      return Promise.reject(new Error('Nome do kit inválido.'));
    }

    let job = jobs.get(requestId);
    if (job) {
      if (JSON.stringify(job.payload) !== JSON.stringify(payload)
          || (job.guildId && guildId && job.guildId !== guildId)
          || (job.ticketId && ticketId && job.ticketId !== ticketId)) {
        return Promise.reject(Object.assign(new Error('requestId já existe com outro conteúdo ou ticket; não será criada uma segunda entrega'), {
          code: 'REQUEST_ID_CONFLICT',
          requestId
        }));
      }
      if (job.result) return Promise.resolve(clone(job.result));
      const promise = attachResultWaiter(job, timeoutMs);
      try {
        wakePendingPulls();
      } catch (error) {
        log.error && log.error('[asthen-bridge] não foi possível acordar um pull com pedido persistido:', error.message);
      }
      return promise;
    }

    job = {
      requestId,
      payload,
      guildId: typeof guildId === 'string' ? guildId : null,
      ticketId: typeof ticketId === 'string' ? ticketId : null,
      status: 'QUEUED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      leasedAt: 0,
      leaseUntil: 0,
      attempts: 0,
      result: null,
      deliveryUpdate: null
    };

    jobs.set(requestId, job);
    try {
      persistJobs();
    } catch (error) {
      jobs.delete(requestId);
      return Promise.reject(Object.assign(new Error('Não foi possível persistir o pedido antes de enfileirar: ' + error.message), {
        code: 'BRIDGE_PERSIST_FAILED',
        requestId
      }));
    }

    const promise = attachResultWaiter(job, timeoutMs);
    wakePendingPulls();
    return promise;
  }

  function close() {
    if (closing) return Promise.resolve();
    closing = true;
    const error = Object.assign(new Error('Bridge shutting down; pedidos permanecem salvos'), { code: 'BRIDGE_SHUTTING_DOWN' });
    rejectResultWaiters(error);
    for (const waiter of [...pendingPulls]) {
      removePullWaiter(waiter);
      sendJson(waiter.res, 503, { success: false, status: 'BRIDGE_SHUTTING_DOWN' });
    }
    return new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      // Close idle and keep-alive sockets so shutdown/test teardown cannot hang.
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    });
  }

  return {
    listening,
    deliverKit,
    kits: () => clone(lastKits),
    pendingCount: activePendingCount,
    longPollCount: () => pendingPulls.size,
    queueCounts,
    getJob: requestId => {
      const job = jobs.get(requestId);
      return job ? clone(job) : null;
    },
    close
  };
}

module.exports = { startBridge };

if (require.main === module) {
  const token = process.env.DKB_SECRET;
  if (!token) {
    console.error('Defina DKB_SECRET com o mesmo token do config.yml do plugin (bridge.secret).');
    process.exit(1);
  }
  const bridge = startBridge({
    token,
    port: Number(process.env.DKB_PORT || 8787),
    onKits: kits => console.log('[asthen-bridge] kits sincronizados: ' + kits.length)
  });
  bridge.listening.then(actualPort => {
    console.log('[asthen-bridge] aguardando o plugin na porta ' + actualPort);
  });
}
