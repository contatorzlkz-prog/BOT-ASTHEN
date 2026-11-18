import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  getGuildConfig,
  getStoreDataDir,
  getShopKits,
  loadStore,
  makeKitDisplayName,
  syncPluginKits,
  updateGuildConfig,
  updateKit
} from '../src/store.js';

function testGuildId() {
  return 'test-' + randomUUID().replace(/-/g, '').slice(0, 18);
}

test('store preserves old products instead of deleting demo or manual entries', () => {
  const guildId = testGuildId();
  updateGuildConfig(guildId, {
    kits: [
      { id: 'demo-kit-1', name: 'Kit Demo 1', price: 'R$ 1,00' },
      { id: 'kit-ferro', name: 'Kit Ferro', price: 'R$ 15,00' },
      { id: 'custom-kit', name: 'Kit_Ruan' }
    ]
  });
  assert.deepEqual(
    getGuildConfig(guildId).kits.map(kit => kit.name),
    ['Kit Demo 1', 'Kit Ferro', 'Kit_Ruan']
  );
});

test('plugin kits are imported and keep Discord shop metadata across full syncs', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 8.9, price_cents: 890, for_sale: true },
    { name: 'Kit_Dima', enabled: true, items: 18, price: null, price_cents: null, for_sale: false }
  ]);
  const iron = first.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.ok(iron);
  assert.equal(iron.displayName, 'Kit Ferro');
  assert.equal(iron.price, 'R$ 8,90');
  assert.equal(iron.priceCents, 890);
  assert.equal(iron.forSale, true);

  updateKit(guildId, iron.id, {
    displayName: 'Pacote de Ferro',
    description: 'Equipamento de ferro',
    imageUrl: 'https://cdn.example.test/kit.png'
  });
  const second = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 8.9, price_cents: 890, for_sale: true },
    { name: 'Kit_Dima', enabled: true, items: 18, price: null, price_cents: null, for_sale: false }
  ]);
  const saved = second.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.equal(saved.displayName, 'Pacote de Ferro');
  assert.equal(saved.price, 'R$ 8,90');
  assert.equal(saved.priceCents, 890);
  assert.equal(saved.forSale, true);
  assert.equal(saved.description, 'Equipamento de ferro');
  assert.equal(saved.imageUrl, 'https://cdn.example.test/kit.png');
});

test('kit removido da loja permanece oculto após novas sincronizações do plugin e pode ser recolocado', () => {
  const guildId = testGuildId();
  const payload = [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 8.9, price_cents: 890, for_sale: true },
    { name: 'Kit_Dima', enabled: true, items: 18, price: 9.9, price_cents: 990, for_sale: true }
  ];
  const first = syncPluginKits(guildId, payload);
  const iron = first.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.ok(iron);

  const removed = updateKit(guildId, iron.id, { storeVisible: false });
  assert.equal(removed.storeVisible, false);
  assert.deepEqual(getShopKits(guildId).map(kit => kit.name), ['Kit_Dima']);

  const refreshed = syncPluginKits(guildId, payload);
  assert.equal(refreshed.kits.find(kit => kit.id === iron.id).storeVisible, false);
  assert.deepEqual(getShopKits(guildId).map(kit => kit.name), ['Kit_Dima']);

  const restored = updateKit(guildId, iron.id, { storeVisible: true });
  assert.equal(restored.storeVisible, true);
  assert.deepEqual(getShopKits(guildId).map(kit => kit.name), ['Kit_Ferro', 'Kit_Dima']);
});

test('plugin price_cents is the exact source of truth for the displayed BRL price', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 8.9, price_cents: 890, for_sale: true }
  ]).kits[0];
  assert.equal(first.price, 'R$ 8,90');
  assert.equal(first.priceCents, 890);
  assert.equal(first.pluginForSale, true);
  assert.equal(first.forSale, true);

  const changed = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 29.9, price_cents: 2990, for_sale: true }
  ]).kits[0];
  assert.equal(changed.price, 'R$ 29,90');
  assert.equal(changed.priceCents, 2990);
});

test('price removed in Plugin-ASTHEN 1.2.0 clears the previous Discord-side price', () => {
  const guildId = testGuildId();
  const initial = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 6.9, price_cents: 690, for_sale: true }
  ]);
  updateKit(guildId, initial.kits[0].id, { description: 'Descrição preservada' });

  const removed = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: null, price_cents: null, for_sale: false }
  ]).kits[0];
  assert.equal(removed.price, '');
  assert.equal(removed.priceCents, null);
  assert.equal(removed.pluginForSale, false);
  assert.equal(removed.forSale, false);
  assert.equal(removed.description, 'Descrição preservada');
});

test('for_sale=false blocks purchases even when a price remains in cents', () => {
  const guildId = testGuildId();
  const kit = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 10, price_cents: 1000, for_sale: false }
  ]).kits[0];
  assert.equal(kit.price, 'R$ 10,00');
  assert.equal(kit.pluginForSale, false);
  assert.equal(kit.forSale, false);
});

test('price_cents is authoritative even if the decimal price field disagrees', () => {
  const guildId = testGuildId();
  const kit = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 1, price: 999.99, price_cents: 2990, for_sale: true }
  ]).kits[0];
  assert.equal(kit.price, 'R$ 29,90');
  assert.equal(kit.priceCents, 2990);
});

test('legacy payloads without price_cents preserve compatibility while 1.2.0 null price clears sale', () => {
  const guildId = testGuildId();
  const legacy = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 'R$ 6,90' }
  ]).kits[0];
  assert.equal(legacy.price, 'R$ 6,90');

  const current = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: null, price_cents: null, for_sale: false }
  ]).kits[0];
  assert.equal(current.price, '');
  assert.equal(current.priceCents, null);
  assert.equal(current.forSale, false);
});

test('a kit disabled by the plugin stays in the catalog as unavailable', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 5, price_cents: 500, for_sale: true }
  ]);
  const kit = first.kits[0];

  const disabled = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: false, items: 12, price: 5, price_cents: 500, for_sale: false }
  ]);
  assert.equal(disabled.kits.length, 1);
  assert.equal(disabled.kits[0].enabled, false);
  assert.equal(disabled.kits[0].price, 'R$ 5,00');
  assert.equal(disabled.kits[0].forSale, false);
});

test('a kit removed from plugin remains stored as unavailable with its price', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 5, price_cents: 500, for_sale: true },
    { name: 'Kit_Dima', enabled: true, items: 18, price: 6, price_cents: 600, for_sale: true }
  ]);
  const iron = first.kits.find(kit => kit.name === 'Kit_Ferro');
  updateKit(guildId, iron.id, { displayName: 'Pacote de Ferro' });

  const after = syncPluginKits(guildId, [{ name: 'Kit_Dima', enabled: true, items: 18, price: 6, price_cents: 600, for_sale: true }]);
  const preserved = after.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.ok(preserved);
  assert.equal(preserved.enabled, false);
  assert.equal(preserved.missingFromPlugin, true);
  assert.equal(preserved.price, 'R$ 5,00');
  assert.equal(preserved.forSale, false);
  assert.equal(preserved.pluginForSale, false);
  assert.equal(preserved.displayName, 'Pacote de Ferro');
});

test('old manual products remain in the store and become unavailable if absent from plugin', () => {
  const guildId = testGuildId();
  updateGuildConfig(guildId, {
    kits: [{
      id: 'old-manual-id',
      name: 'Kit_Que_Nao_Existe',
      displayName: 'Kit antigo',
      price: 'R$ 2,00',
      description: 'Registro antigo'
    }]
  });

  const synced = syncPluginKits(guildId, [{ name: 'Kit_Atual', enabled: true, items: 4 }]);
  const old = synced.kits.find(kit => kit.id === 'old-manual-id');
  assert.ok(old);
  assert.equal(old.enabled, false);
  assert.equal(old.missingFromPlugin, true);
  assert.equal(old.price, 'R$ 2,00');
});

test('new plugin kits are marked as not yet configured for the Discord store', () => {
  const guildId = testGuildId();
  const result = syncPluginKits(guildId, [
    { name: 'Kit_Novo', enabled: true, items: 4, price: null, price_cents: null, for_sale: false }
  ]);
  assert.equal(result.kits[0].storeConfigured, false);
  assert.equal(result.kits[0].forSale, false);
});

test('plugin price and Discord commercial metadata remain separate', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Com_Preco', enabled: true, items: 4, price: 4.9, price_cents: 490, for_sale: true }
  ]);
  assert.equal(first.kits[0].storeConfigured, false);
  assert.equal(first.kits[0].forSale, true);
  updateKit(guildId, first.kits[0].id, {
    displayName: 'Kit com preço',
    description: 'Descrição comercial',
    storeConfigured: true
  });
  const next = syncPluginKits(guildId, [
    { name: 'Kit_Com_Preco', enabled: true, items: 4, price: 4.9, price_cents: 490, for_sale: true }
  ]);
  assert.equal(next.kits[0].storeConfigured, true);
  assert.equal(next.kits[0].description, 'Descrição comercial');
  assert.equal(next.kits[0].forSale, true);
});

test('legacy decimal price strings and numeric prices convert to exact cents', () => {
  const guildId = testGuildId();
  const prices = syncPluginKits(guildId, [
    { name: 'Kit_Ponto', enabled: true, items: 1, price: 29.9 },
    { name: 'Kit_Virgula', enabled: true, items: 1, price: 'R$ 1.299,90' }
  ]).kits;
  assert.equal(prices.find(kit => kit.name === 'Kit_Ponto').price, 'R$ 29,90');
  assert.equal(prices.find(kit => kit.name === 'Kit_Virgula').price, 'R$ 1.299,90');
});

test('friendly kit names remove underscores and hyphens', () => {
  assert.equal(makeKitDisplayName('Kit_Netherita-Plus'), 'Kit Netherita Plus');
});


test('store tests use a temporary directory and never the production data folder', () => {
  const directory = getStoreDataDir();
  assert.match(directory, /asthen-bot-tests-/);
  assert.match(path.basename(path.dirname(directory)), /^asthen-bot-tests-/);
  assert.notEqual(directory, path.resolve(process.cwd(), 'data'));
});

test('a corrupt state.json is preserved and copied instead of being replaced by empty data', () => {
  const directory = getStoreDataDir();
  const file = path.join(directory, 'state.json');
  const corrupt = '{"guilds":';
  writeFileSync(file, corrupt, 'utf8');

  assert.throws(() => loadStore(), /arquivo data\/state\.json está inválido ou ilegível/i);
  assert.equal(readFileSync(file, 'utf8'), corrupt);

  const backups = readdirSync(directory).filter(name => name.startsWith('state.json.corrupt-') && name.endsWith('.bak'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(path.join(directory, backups[0]), 'utf8'), corrupt);
});

test('loja mostra um único kit demo até receber a primeira sincronização do plugin', () => {
  const guildId = testGuildId();
  updateGuildConfig(guildId, { kits: [] });
  const demo = getShopKits(guildId);
  assert.equal(demo.length, 1);
  assert.equal(demo[0].demo, true);
  assert.equal(demo[0].id, 'asthen-demo-kit');
  assert.equal(demo[0].forSale, false);
  assert.equal(demo[0].pluginForSale, false);

  const synced = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 9.9, price_cents: 990, for_sale: true }
  ]);
  const visible = getShopKits(guildId);
  assert.equal(synced.changed, true);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].name, 'Kit_Ferro');
  assert.equal(visible[0].demo, undefined);
});

test('kit demo continua disponível quando o plugin ainda não tem kits reais', () => {
  const guildId = testGuildId();
  const emptySync = syncPluginKits(guildId, []);
  assert.equal(emptySync.changed, true);
  assert.equal(getShopKits(guildId)[0].demo, true);
});

test('loja ignora cadastros manuais antigos que não vieram do plugin', () => {
  const guildId = testGuildId();
  updateGuildConfig(guildId, {
    kits: [{ id: 'old-manual', name: 'Kit_Antigo', displayName: 'Antigo', enabled: true }],
  });
  const visible = getShopKits(guildId);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].demo, true);
});
test('estado antigo de bloqueio manual não sobrepõe a disponibilidade do Minecraft', () => {
  const guildId = testGuildId();
  const payload = [{ name: 'Kit_Ferro', enabled: true, items: 12, price: 19.9, price_cents: 1990, for_sale: true }];
  const first = syncPluginKits(guildId, payload).kits[0];
  updateKit(guildId, first.id, { manuallyUnavailable: true, enabled: false, forSale: false });
  const refreshed = syncPluginKits(guildId, payload).kits[0];
  assert.equal(refreshed.manuallyUnavailable, false);
  assert.equal(refreshed.enabled, true);
  assert.equal(refreshed.forSale, true);
});
