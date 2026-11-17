import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseWeeklyKitStock, getSupabaseStatus } from '../src/supabase.js';

test('liberação semanal envia a chave idempotente e aceita repetição', async () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    table: process.env.SUPABASE_TABLE,
    stockTable: process.env.SUPABASE_WEEKLY_STOCK_TABLE,
    fetch: globalThis.fetch
  };
  process.env.SUPABASE_URL = 'https://asthen-stock-release-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_stock_release_test_key';
  process.env.SUPABASE_TABLE = 'asthen_bot_state';
  process.env.SUPABASE_WEEKLY_STOCK_TABLE = 'asthen_bot_weekly_stock';

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body || '{}') });
    const alreadyReleased = calls.length > 1;
    return new Response(JSON.stringify({
      ok: true,
      already_released: alreadyReleased,
      remaining: alreadyReleased ? 8 : 8,
      reserved_count: 2,
      weekly_limit: 10
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const first = await releaseWeeklyKitStock({ guildId: 'guild-1', requestId: 'ticket-123' });
    const second = await releaseWeeklyKitStock({ guildId: 'guild-1', requestId: 'ticket-123' });

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/rpc\/release_asthen_weekly_kit_stock$/);
    assert.deepEqual(calls[0].body, { p_guild_id: 'guild-1', p_request_id: 'ticket-123' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.already_released, true);
    assert.equal(getSupabaseStatus().weeklyStockHealth, 'ready');
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previous.secret;
    if (previous.table === undefined) delete process.env.SUPABASE_TABLE; else process.env.SUPABASE_TABLE = previous.table;
    if (previous.stockTable === undefined) delete process.env.SUPABASE_WEEKLY_STOCK_TABLE; else process.env.SUPABASE_WEEKLY_STOCK_TABLE = previous.stockTable;
  }
});
