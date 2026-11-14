import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBridge, deliverKit, getBridgeStatus } from '../src/bridge.js';

const secret = 'ASTHEN_TEST_SECRET_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let bridge;
let baseUrl;

before(async () => {
  bridge = await startBridge({ token: secret, host: '127.0.0.1', port: 0 });
  baseUrl = 'http://127.0.0.1:' + bridge.port;
});

after(async () => {
  if (bridge) await bridge.close();
});

function authHeaders(extra = {}) {
  return {
    Authorization: 'Bearer ' + secret,
    ...extra
  };
}

test('a API recusa chamadas sem a chave correta', async () => {
  const response = await fetch(baseUrl + '/plugin/v1/pull');
  assert.equal(response.status, 401);
});

test('a fila vazia responde HTTP 204', async () => {
  const response = await fetch(baseUrl + '/plugin/v1/pull', {
    headers: authHeaders()
  });
  assert.equal(response.status, 204);
});

test('a API entrega pedidos ao plugin e recebe o resultado final', async () => {
  const requestId = 'test-request-001';
  const pendingResult = deliverKit({
    requestId,
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro',
    timeoutMs: 5000
  });

  const pull = await fetch(baseUrl + '/plugin/v1/pull?limit=5', {
    headers: authHeaders()
  });
  assert.equal(pull.status, 200);

  const payload = await pull.json();
  assert.equal(payload.requests.length, 1);
  assert.deepEqual(payload.requests[0], {
    request_id: requestId,
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro'
  });

  const posted = await fetch(baseUrl + '/plugin/v1/result', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      request_id: requestId,
      final: true,
      success: true,
      status: 'KIT_DELIVERED',
      player: 'PlayerTeste',
      platform: 'java',
      kit: 'Kit_Ferro',
      message: 'Kit entregue.'
    })
  });
  assert.equal(posted.status, 200);
  assert.deepEqual(await pendingResult, {
    request_id: requestId,
    final: true,
    success: true,
    status: 'KIT_DELIVERED',
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro',
    message: 'Kit entregue.'
  });
});

test('a API informa estado e rejeita nick ou nome de kit inválido', async () => {
  const status = getBridgeStatus();
  assert.equal(status.running, true);
  assert.equal(status.port, bridge.port);

  await assert.rejects(
    deliverKit({ requestId: 'bad-player', player: 'Nick com espaço', platform: 'java', kit: 'Kit_Ferro' }),
    /Nick Java inválido/
  );
  await assert.rejects(
    deliverKit({ requestId: 'bad-kit', player: 'PlayerTeste', platform: 'java', kit: 'Kit Com Espaço' }),
    /Nome do kit inválido/
  );
});
