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

async function postResult(requestId, extra = {}) {
  return fetch(baseUrl + '/plugin/v1/result', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      request_id: requestId,
      final: true,
      success: true,
      status: 'KIT_DELIVERED',
      ...extra
    })
  });
}

test('a API recusa chamadas sem a chave correta', async () => {
  const response = await fetch(baseUrl + '/plugin/v1/pull');
  assert.equal(response.status, 401);
});

test('a fila vazia responde HTTP 204 sem ativar Long Polling', async () => {
  const response = await fetch(baseUrl + '/plugin/v1/pull', {
    headers: authHeaders()
  });
  assert.equal(response.status, 204);
});

test('Long Polling acorda imediatamente quando um pedido chega', async () => {
  const requestId = 'test-long-poll-001';
  const startedAt = Date.now();

  // Abre o pull primeiro; o bot deve acordá-lo quando deliverKit inserir o pedido.
  const pullPromise = fetch(baseUrl + '/plugin/v1/pull?limit=5&wait_ms=20000', {
    headers: authHeaders()
  });
  await new Promise(resolve => setTimeout(resolve, 100));

  const pendingResult = deliverKit({
    requestId,
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro',
    timeoutMs: 5000
  });

  const pull = await pullPromise;
  assert.equal(pull.status, 200);
  assert.ok(Date.now() - startedAt < 2000, 'o pull deveria ser acordado sem esperar os 20 segundos');
  const payload = await pull.json();
  assert.deepEqual(payload.requests, [{
    request_id: requestId,
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro'
  }]);

  const posted = await postResult(requestId, {
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro',
    message: 'Kit entregue.'
  });
  assert.equal(posted.status, 200);
  assert.equal((await pendingResult).status, 'KIT_DELIVERED');
});

test('Long Polling termina com HTTP 204 quando o prazo expira sem pedido', async () => {
  const startedAt = Date.now();
  const response = await fetch(baseUrl + '/plugin/v1/pull?wait_ms=100', {
    headers: authHeaders()
  });
  assert.equal(response.status, 204);
  assert.ok(Date.now() - startedAt >= 70);
  assert.ok(Date.now() - startedAt < 2000);
});

test('a API entrega pedidos ao plugin e recebe o resultado final no modo antigo', async () => {
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

  const posted = await postResult(requestId, {
    player: 'PlayerTeste',
    platform: 'java',
    kit: 'Kit_Ferro',
    message: 'Kit entregue.'
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


test('plugin 1.3.0 posts pending-delivery completion through /plugin/v1/events', async () => {
  const requestId = 'test-event-route-001';
  const pendingResult = deliverKit({
    requestId,
    player: 'Elber Player',
    platform: 'bedrock',
    kit: 'Kit_Ferro',
    timeoutMs: 5000
  });
  const pull = await fetch(baseUrl + '/plugin/v1/pull?limit=5', { headers: authHeaders() });
  assert.equal(pull.status, 200);
  const queued = await pull.json();
  assert.equal(queued.requests[0].request_id, requestId);
  const initial = await postResult(requestId, {
    player: 'Elber Player',
    platform: 'bedrock',
    kit: 'Kit_Ferro',
    status: 'KIT_PENDING',
    message: 'Inventário cheio; kit guardado.'
  });
  assert.equal(initial.status, 200);
  assert.equal((await pendingResult).status, 'KIT_PENDING');
  const event = {
    event_id: requestId + ':KIT_DELIVERED',
    request_id: requestId,
    status: 'KIT_DELIVERED',
    final: true,
    success: true,
    player: 'Elber Player',
    kit: 'Kit_Ferro',
    at: Date.now()
  };
  const delivered = await fetch(baseUrl + '/plugin/v1/events', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(event)
  });
  assert.equal(delivered.status, 200);
  assert.deepEqual(await delivered.json(), { success: true });
  const duplicate = await fetch(baseUrl + '/plugin/v1/events', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(event)
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
});

test('a API aceita Bedrock e valida Java separadamente', async () => {
  const requestId = 'test-bedrock-001';
  const pendingResult = deliverKit({
    requestId,
    player: 'Elber Player',
    platform: 'bedrock',
    kit: 'Kit_Ferro',
    timeoutMs: 5000
  });

  const pull = await fetch(baseUrl + '/plugin/v1/pull?limit=5', {
    headers: authHeaders()
  });
  const payload = await pull.json();
  assert.deepEqual(payload.requests.find(item => item.request_id === requestId), {
    request_id: requestId,
    player: 'Elber Player',
    platform: 'bedrock',
    kit: 'Kit_Ferro'
  });

  const posted = await postResult(requestId, {
    player: 'Elber Player',
    platform: 'bedrock',
    kit: 'Kit_Ferro',
    message: 'Kit entregue.'
  });
  assert.equal(posted.status, 200);
  assert.equal((await pendingResult).status, 'KIT_DELIVERED');

  await assert.rejects(
    deliverKit({ requestId: 'bad-java', player: 'Nick Com Espaco', platform: 'java', kit: 'Kit_Ferro' }),
    /Nick Java inválido/
  );
});

test('a API informa estado e rejeita nick ou nome de kit inválido', async () => {
  const status = getBridgeStatus();
  assert.equal(status.running, true);
  assert.equal(status.port, bridge.port);

  await assert.rejects(
    deliverKit({ requestId: 'bad-player', player: 'Nick Com Espaco', platform: 'java', kit: 'Kit_Ferro' }),
    /Nick Java inválido/
  );
  await assert.rejects(
    deliverKit({ requestId: 'bad-kit', player: 'PlayerTeste', platform: 'java', kit: 'Kit Com Espaço' }),
    /Nome do kit inválido/
  );
});
