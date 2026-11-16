import test from 'node:test';
import assert from 'node:assert/strict';
import { flushSupabaseSync, initializeSupabaseSync, scheduleSupabaseSync } from '../src/supabase.js';

test('flush aguarda sincronização em andamento e envia o snapshot mais recente', async () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    fetch: globalThis.fetch
  };
  process.env.SUPABASE_URL = 'https://asthen-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key_for_isolated_tests';
  process.env.SUPABASE_TABLE = 'asthen_bot_state';
  process.env.SUPABASE_KITS_TABLE = 'asthen_bot_kits';
  process.env.SUPABASE_WEEKLY_STOCK_TABLE = 'asthen_bot_weekly_stock';

  const firstPostStarted = new Promise(resolve => {
    globalThis.__asthenFirstPostStarted = resolve;
  });
  let releaseFirstPost;
  const firstPostGate = new Promise(resolve => {
    releaseFirstPost = resolve;
  });
  const snapshots = [];

  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'GET') {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const body = JSON.parse(options.body || '{}');
    snapshots.push(body.payload);
    if (snapshots.length === 1) {
      globalThis.__asthenFirstPostStarted();
      await firstPostGate;
    }
    return new Response(null, { status: 204 });
  };

  try {
    let current = { guilds: {}, tickets: {}, purchaseDrafts: {} };
    await initializeSupabaseSync({
      getSnapshot: () => current,
      applySnapshot: remote => { current = remote; },
      saveLocal: () => {}
    });

    current = { guilds: {}, tickets: { version: 1 }, purchaseDrafts: {} };
    scheduleSupabaseSync(current);
    const firstFlush = flushSupabaseSync();
    await firstPostStarted;

    current = { guilds: {}, tickets: { version: 2 }, purchaseDrafts: {} };
    scheduleSupabaseSync(current);
    const secondFlush = flushSupabaseSync();

    let secondSettled = false;
    secondFlush.then(() => { secondSettled = true; });
    await Promise.resolve();
    assert.equal(secondSettled, false, 'flush concorrente não pode retornar antes da sincronização mais recente');

    releaseFirstPost();
    const [firstResult, secondResult] = await Promise.all([firstFlush, secondFlush]);
    assert.equal(firstResult, true);
    assert.equal(secondResult, true);
    assert.equal(snapshots.length, 2);
    assert.deepEqual(snapshots[1], current);
  } finally {
    releaseFirstPost?.();
    delete globalThis.__asthenFirstPostStarted;
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previous.secret;
  }
});
