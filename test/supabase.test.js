import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSnapshots, normalizeSupabaseUrl } from '../src/supabase.js';

test('normaliza URL base do Supabase', () => {
  assert.equal(
    normalizeSupabaseUrl('https://exemplo.supabase.co/rest/v1/'),
    'https://exemplo.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('https://exemplo.supabase.co/v1'),
    'https://exemplo.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('https://exemplo.supabase.co'),
    'https://exemplo.supabase.co'
  );
});

test('não transforma URL vazia em endereço válido', () => {
  assert.equal(normalizeSupabaseUrl(''), '');
  assert.equal(normalizeSupabaseUrl(null), '');
});


test('merge de snapshots preserva configurações, tickets, pedidos e jogadores', () => {
  const merged = mergeSnapshots(
    {
      guilds: { g1: { supportPanelChannelId: 'local-channel', kits: [{ name: 'Kit_A', price: 'R$ 4,00' }] } },
      tickets: {},
      purchaseDrafts: { 'g1:u1': { guildId: 'g1', userId: 'u1', updatedAt: '2026-11-27T12:00:00.000Z' } },
      players: { 'g1:u1': { discord_id: 'u1', guild_id: 'g1', minecraft_nick: 'Nick_Local', updated_at: '2026-11-27T12:00:00.000Z' } }
    },
    {
      guilds: { g1: { logsChannelId: 'remote-logs', kits: [{ name: 'Kit_B', price: 'R$ 8,00' }], updatedAt: '2026-11-26T12:00:00.000Z' } },
      tickets: { c1: { channelId: 'c1', status: 'open', updatedAt: '2026-11-27T11:00:00.000Z' } },
      purchaseDrafts: { 'g1:u2': { guildId: 'g1', userId: 'u2', updatedAt: '2026-11-27T11:00:00.000Z' } },
      players: { 'g1:u2': { discord_id: 'u2', guild_id: 'g1', minecraft_nick: 'Nick_Remoto', updated_at: '2026-11-27T11:00:00.000Z' } }
    }
  );
  assert.equal(merged.guilds.g1.supportPanelChannelId, 'local-channel');
  assert.equal(merged.guilds.g1.logsChannelId, 'remote-logs');
  assert.deepEqual(merged.guilds.g1.kits.map(kit => kit.name).sort(), ['Kit_A', 'Kit_B']);
  assert.ok(merged.tickets.c1);
  assert.ok(merged.purchaseDrafts['g1:u1']);
  assert.ok(merged.purchaseDrafts['g1:u2']);
  assert.ok(merged.players['g1:u1']);
  assert.ok(merged.players['g1:u2']);
});

test('tombstones impedem que tickets, pedidos e registros apagados reapareçam', () => {
  const merged = mergeSnapshots(
    {
      tickets: {}, purchaseDrafts: {}, players: {},
      tombstones: {
        tickets: { c1: '2026-11-27T12:00:00.000Z' },
        purchaseDrafts: { 'g1:u1': '2026-11-27T12:00:00.000Z' },
        players: { 'g1:u1': '2026-11-27T12:00:00.000Z' }
      }
    },
    {
      tickets: { c1: { channelId: 'c1', updatedAt: '2026-11-27T11:00:00.000Z' } },
      purchaseDrafts: { 'g1:u1': { guildId: 'g1', userId: 'u1', updatedAt: '2026-11-27T11:00:00.000Z' } },
      players: { 'g1:u1': { discord_id: 'u1', guild_id: 'g1', updated_at: '2026-11-27T11:00:00.000Z' } }
    }
  );
  assert.equal(merged.tickets.c1, undefined);
  assert.equal(merged.purchaseDrafts['g1:u1'], undefined);
  assert.equal(merged.players['g1:u1'], undefined);
});
