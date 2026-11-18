import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBrasiliaWeekStart,
  getNextBrasiliaSundayAt,
  getWeeklyKitStock,
  reserveWeeklyKitStock
} from '../src/supabase.js';

test('semana comercial começa domingo à meia-noite no horário de Brasília', () => {
  assert.equal(getBrasiliaWeekStart(new Date('2026-11-15T02:59:59.000Z')), '2026-11-08');
  assert.equal(getBrasiliaWeekStart(new Date('2026-11-15T03:00:00.000Z')), '2026-11-15');
  assert.equal(getBrasiliaWeekStart(new Date('2026-11-22T02:59:59.000Z')), '2026-11-15');
  assert.equal(
    getNextBrasiliaSundayAt(new Date('2026-11-18T18:00:00.000Z')).toISOString(),
    '2026-11-22T03:00:00.000Z'
  );
  assert.equal(
    getNextBrasiliaSundayAt(new Date('2026-11-22T03:00:00.000Z')).toISOString(),
    '2026-11-29T03:00:00.000Z'
  );
});

function withSupabaseEnv(run) {
  const keys = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_WEEKLY_STOCK_TABLE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key';
  process.env.SUPABASE_WEEKLY_STOCK_TABLE = 'asthen_bot_weekly_stock';
  return Promise.resolve().then(run).finally(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test('consulta estoque atual e considera 10 unidades quando ainda não existe registro', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = async url => {
      requestedUrl = String(url);
      return new Response(JSON.stringify([
        { kit_id: 'kit-1', reserved_count: 7, weekly_limit: 10 }
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const stock = await getWeeklyKitStock('guild-1');
      const query = new URL(requestedUrl).searchParams;
      assert.equal(query.get('guild_id'), 'eq.guild-1');
      assert.equal(query.get('week_start'), 'eq.' + getBrasiliaWeekStart());
      assert.equal(stock.items['kit-1'].remaining, 3);
      assert.equal(stock.items['kit-1'].reserved, 7);
      assert.equal(stock.items['kit-2'], undefined);
      assert.equal(stock.limit, 10);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('reserva estoque pelo RPC com chave idempotente do ticket', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedBody = null;
    globalThis.fetch = async (url, options) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        ok: true,
        already_reserved: false,
        week_start: requestedBody.p_week_start,
        reserved_count: 1,
        weekly_limit: 10,
        remaining: 9
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const result = await reserveWeeklyKitStock({
        guildId: 'guild-1',
        kitId: 'kit-1',
        requestId: 'ticket-123'
      });
      assert.ok(requestedUrl.endsWith('/rest/v1/rpc/reserve_asthen_weekly_kit_stock'));
      assert.equal(requestedBody.p_guild_id, 'guild-1');
      assert.equal(requestedBody.p_kit_id, 'kit-1');
      assert.equal(requestedBody.p_request_id, 'ticket-123');
      assert.equal(result.remaining, 9);
      assert.equal(result.ok, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
