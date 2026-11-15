import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  getGuildConfig,
  makeKitDisplayName,
  removeKit,
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
    { name: 'Kit_Ferro', enabled: true, items: 12 },
    { name: 'Kit_Dima', enabled: true, items: 18 }
  ]);
  const iron = first.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.ok(iron);
  assert.equal(iron.displayName, 'Kit Ferro');
  assert.equal(iron.price, '');

  updateKit(guildId, iron.id, {
    displayName: 'Pacote de Ferro',
    price: 'R$ 5,00',
    description: 'Equipamento de ferro',
    imageUrl: 'https://cdn.example.test/kit.png'
  });
  const second = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12 },
    { name: 'Kit_Dima', enabled: true, items: 18 }
  ]);
  const saved = second.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.equal(saved.displayName, 'Pacote de Ferro');
  assert.equal(saved.price, 'R$ 5,00');
  assert.equal(saved.description, 'Equipamento de ferro');
  assert.equal(saved.imageUrl, 'https://cdn.example.test/kit.png');
});

test('optional plugin price updates the price while omitted price preserves it', () => {
  const guildId = testGuildId();
  assert.equal(syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 'R$ 8,90' }
  ]).kits[0].price, 'R$ 8,90');
  assert.equal(syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12 }
  ]).kits[0].price, 'R$ 8,90');
  assert.equal(syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 'R$ 9,90' }
  ]).kits[0].price, 'R$ 9,90');
});

test('an empty price field from the plugin does not erase the price set in Discord', () => {
  const guildId = testGuildId();
  const initial = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: 'R$ 6,90' }
  ]);
  const kit = initial.kits[0];
  const updated = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12, price: '' }
  ]);
  assert.equal(updated.kits[0].price, 'R$ 6,90');
  assert.equal(updated.kits[0].storeConfigured, true);
});

test('a kit disabled by the plugin stays in the catalog as unavailable', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: true, items: 12 }]);
  const kit = first.kits[0];
  updateKit(guildId, kit.id, { price: 'R$ 5,00' });

  const disabled = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: false, items: 12 }]);
  assert.equal(disabled.kits.length, 1);
  assert.equal(disabled.kits[0].enabled, false);
  assert.equal(disabled.kits[0].price, 'R$ 5,00');
});

test('a kit removed from plugin remains stored as unavailable with its price', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12 },
    { name: 'Kit_Dima', enabled: true, items: 18 }
  ]);
  const iron = first.kits.find(kit => kit.name === 'Kit_Ferro');
  updateKit(guildId, iron.id, { price: 'R$ 5,00', displayName: 'Pacote de Ferro' });

  const after = syncPluginKits(guildId, [{ name: 'Kit_Dima', enabled: true, items: 18 }]);
  const preserved = after.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.ok(preserved);
  assert.equal(preserved.enabled, false);
  assert.equal(preserved.missingFromPlugin, true);
  assert.equal(preserved.price, 'R$ 5,00');
  assert.equal(preserved.displayName, 'Pacote de Ferro');
});

test('admin removal marks product unavailable without deleting its record', () => {
  const guildId = testGuildId();
  const kit = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: true, items: 12 }]).kits[0];
  assert.equal(removeKit(guildId, kit.id), true);

  const stored = getGuildConfig(guildId).kits.find(item => item.id === kit.id);
  assert.ok(stored);
  assert.equal(stored.enabled, false);
  assert.equal(stored.manuallyUnavailable, true);

  const synced = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: true, items: 12 }]);
  assert.equal(synced.kits[0].enabled, false);
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
  const result = syncPluginKits(guildId, [{ name: 'Kit_Novo', enabled: true, items: 4 }]);
  assert.equal(result.kits[0].storeConfigured, false);
});

test('a kit with a plugin-supplied price is ready for the shop and keeps that state', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [{ name: 'Kit_Com_Preco', enabled: true, items: 4, price: 'R$ 4,90' }]);
  assert.equal(first.kits[0].storeConfigured, true);
  const next = syncPluginKits(guildId, [{ name: 'Kit_Com_Preco', enabled: true, items: 4 }]);
  assert.equal(next.kits[0].storeConfigured, true);
});

test('friendly kit names remove underscores and hyphens', () => {
  assert.equal(makeKitDisplayName('Kit_Netherita-Plus'), 'Kit Netherita Plus');
});
