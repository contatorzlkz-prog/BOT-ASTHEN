import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithKeyedLock } from '../src/keyed-lock.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('operações da mesma chave são serializadas', async () => {
  let active = 0;
  let maximum = 0;
  const order = [];

  const operation = id => runWithKeyedLock('guild:user:shop', async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    order.push('start-' + id);
    await wait(15);
    order.push('end-' + id);
    active -= 1;
    return id;
  });

  const result = await Promise.all([operation(1), operation(2), operation(3)]);
  assert.deepEqual(result, [1, 2, 3]);
  assert.equal(maximum, 1);
  assert.deepEqual(order, [
    'start-1', 'end-1',
    'start-2', 'end-2',
    'start-3', 'end-3'
  ]);
});

test('chaves diferentes não bloqueiam umas às outras', async () => {
  let active = 0;
  let maximum = 0;

  const operation = key => runWithKeyedLock(key, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await wait(20);
    active -= 1;
  });

  await Promise.all([operation('guild:user:shop'), operation('guild:user:support')]);
  assert.equal(maximum, 2);
});

test('uma falha não deixa a chave bloqueada', async () => {
  await assert.rejects(
    runWithKeyedLock('same-key', async () => { throw new Error('expected'); }),
    /expected/
  );
  assert.equal(await runWithKeyedLock('same-key', async () => 'released'), 'released');
});
