import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSupabaseConfig } from '../src/supabase.js';

test('configuração do Supabase usa somente a tabela de snapshot e a tabela de estoque', () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    kitsTable: process.env.SUPABASE_KITS_TABLE
  };
  process.env.SUPABASE_URL = 'https://asthen-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  process.env.SUPABASE_KITS_TABLE = 'asthen_bot_kits';
  try {
    const config = getSupabaseConfig();
    assert.equal(config.table, 'asthen_bot_state');
    assert.equal(config.weeklyStockTable, 'asthen_bot_weekly_stock');
    assert.equal(Object.hasOwn(config, 'kitsTable'), false);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previous.secret;
    if (previous.kitsTable === undefined) delete process.env.SUPABASE_KITS_TABLE;
    else process.env.SUPABASE_KITS_TABLE = previous.kitsTable;
  }
});

test('SETUP.sql cria snapshot e estoque sem depender da tabela redundante de kits', () => {
  const sql = readFileSync(new URL('../supabase/SETUP.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.asthen_bot_state/i);
  assert.match(sql, /create table if not exists public\.asthen_bot_weekly_stock/i);
  assert.match(sql, /create table if not exists public\.asthen_bot_stock_reservations/i);
  assert.match(sql, /create or replace function public\.reserve_asthen_weekly_kit_stock/i);
  assert.doesNotMatch(sql, /create table if not exists public\.asthen_bot_kits/i);
});
