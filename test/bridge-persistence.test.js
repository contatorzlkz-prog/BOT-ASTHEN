import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startBridge, deliverKit } from '../src/bridge.js';

const secret = 'ASTHEN_TEST_SECRET_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function pull(baseUrl, query = '?limit=5') {
  return fetch(baseUrl + '/plugin/v1/pull' + query, {
    headers: { Authorization: 'Bearer ' + secret }
  });
}

async function post(baseUrl, route, body) {
  return fetch(baseUrl + route, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

test('Bridge recupera a mesma solicitação e request_id depois de reiniciar', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'asthen-bridge-restart-'));
  const previousDataDir = process.env.ASTHEN_DATA_DIR;
  process.env.ASTHEN_DATA_DIR = root;
  let bridge;
  let firstWaiter;

  try {
    bridge = await startBridge({ token: secret, host: '127.0.0.1', port: 0, leaseMs: 100 });
    const baseUrl = 'http://127.0.0.1:' + bridge.port;
    firstWaiter = deliverKit({
      requestId: 'ticket-persist-001',
      player: 'PlayerPersist',
      platform: 'java',
      kit: 'Kit_Ferro',
      timeoutMs: 5000
    });
    firstWaiter.catch(() => {});

    const firstPull = await pull(baseUrl);
    assert.equal(firstPull.status, 200);
    const firstPayload = await firstPull.json();
    assert.equal(firstPayload.requests[0].request_id, 'ticket-persist-001');

    await bridge.close();
    bridge = null;
    await assert.rejects(firstWaiter, error => error.code === 'BRIDGE_SHUTTING_DOWN');

    await new Promise(resolve => setTimeout(resolve, 140));
    bridge = await startBridge({ token: secret, host: '127.0.0.1', port: 0, leaseMs: 100 });
    const restartedBaseUrl = 'http://127.0.0.1:' + bridge.port;

    const recoveredWaiter = deliverKit({
      requestId: 'ticket-persist-001',
      player: 'PlayerPersist',
      platform: 'java',
      kit: 'Kit_Ferro',
      timeoutMs: 5000
    });
    const recoveredPull = await pull(restartedBaseUrl);
    assert.equal(recoveredPull.status, 200);
    const recoveredPayload = await recoveredPull.json();
    assert.deepEqual(recoveredPayload.requests[0], firstPayload.requests[0]);

    const posted = await post(restartedBaseUrl, '/plugin/v1/result', {
      request_id: 'ticket-persist-001',
      final: true,
      success: true,
      status: 'KIT_DELIVERED',
      player: 'PlayerPersist',
      platform: 'java',
      kit: 'Kit_Ferro'
    });
    assert.equal(posted.status, 200);
    assert.equal((await recoveredWaiter).status, 'KIT_DELIVERED');
    assert.equal(bridge.queueCounts().delivered, 1);
  } finally {
    if (bridge) await bridge.close();
    if (previousDataDir === undefined) delete process.env.ASTHEN_DATA_DIR;
    else process.env.ASTHEN_DATA_DIR = previousDataDir;
    rmSync(root, { recursive: true, force: true });
  }
});

test('KIT_PENDING pode ser atualizado para KIT_DELIVERED com idempotência', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'asthen-bridge-update-'));
  const previousDataDir = process.env.ASTHEN_DATA_DIR;
  process.env.ASTHEN_DATA_DIR = root;
  let bridge;

  try {
    const updates = [];
    bridge = await startBridge({
      token: secret,
      host: '127.0.0.1',
      port: 0,
      onDeliveryUpdate: event => updates.push(event.update)
    });
    const baseUrl = 'http://127.0.0.1:' + bridge.port;

    const pending = deliverKit({
      requestId: 'ticket-pending-001',
      player: 'PlayerPending',
      platform: 'bedrock',
      kit: 'Kit_Ferro',
      timeoutMs: 5000
    });
    const pulled = await pull(baseUrl);
    assert.equal(pulled.status, 200);

    const initial = await post(baseUrl, '/plugin/v1/result', {
      request_id: 'ticket-pending-001',
      final: true,
      success: true,
      status: 'KIT_PENDING',
      player: 'PlayerPending',
      platform: 'bedrock',
      kit: 'Kit_Ferro',
      message: 'Inventário cheio'
    });
    assert.equal(initial.status, 200);
    assert.equal((await pending).status, 'KIT_PENDING');
    assert.equal(bridge.queueCounts().kitPending, 1);

    const updateBody = {
      request_id: 'ticket-pending-001',
      status: 'KIT_DELIVERED',
      player: 'PlayerPending',
      platform: 'bedrock',
      kit: 'Kit_Ferro',
      message: 'O kit foi retirado.',
      updated_at: new Date().toISOString()
    };
    const updated = await post(baseUrl, '/plugin/v1/delivery-update', updateBody);
    assert.equal(updated.status, 200);
    const duplicate = await post(baseUrl, '/plugin/v1/delivery-update', updateBody);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(bridge.queueCounts().delivered, 1);
    assert.equal(updates.length, 2, 'reenvio idempotente permite tentar novamente a notificação sem duplicar o estado');

    const unknown = await post(baseUrl, '/plugin/v1/delivery-update', {
      ...updateBody,
      request_id: 'request-desconhecido'
    });
    assert.equal(unknown.status, 404);
  } finally {
    if (bridge) await bridge.close();
    if (previousDataDir === undefined) delete process.env.ASTHEN_DATA_DIR;
    else process.env.ASTHEN_DATA_DIR = previousDataDir;
    rmSync(root, { recursive: true, force: true });
  }
});
