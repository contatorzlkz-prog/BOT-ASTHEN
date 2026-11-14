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

test('store starts empty and removes legacy demo entries without hiding real plugin kits', () => {
  const guildId = testGuildId();
  updateGuildConfig(guildId, {
    kits: [
      { id: 'demo-kit-1', name: 'Kit Demo 1' },
      { id: 'kit-ferro', name: 'Kit Ferro', price: 'R$ 15,00' },
      { id: 'custom-kit', name: 'Kit_Ruan' }
    ]
  });

  const config = getGuildConfig(guildId);
  assert.deepEqual(config.kits.map(kit => kit.name), ['Kit_Ruan']);
  assert.deepEqual(config.hiddenPluginKits, []);
});

test('plugin kits are imported, humanized and keep Discord shop metadata across syncs', () => {
  const guildId = testGuildId();
  const first = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12 },
    { name: 'Kit_Dima', enabled: true, items: 18 }
  ]);

  assert.equal(first.kits.length, 2);
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
  const savedIron = second.kits.find(kit => kit.name === 'Kit_Ferro');
  assert.equal(savedIron.displayName, 'Pacote de Ferro');
  assert.equal(savedIron.price, 'R$ 5,00');
  assert.equal(savedIron.description, 'Equipamento de ferro');
  assert.equal(savedIron.imageUrl, 'https://cdn.example.test/kit.png');
});

test('plugin deletion removes its catalog entry and can be recreated after a later sync', () => {
  const guildId = testGuildId();
  const initial = syncPluginKits(guildId, [
    { name: 'Kit_Ferro', enabled: true, items: 12 },
    { name: 'Kit_Dima', enabled: true, items: 18 }
  ]);
  const iron = initial.kits.find(kit => kit.name === 'Kit_Ferro');

  const afterDelete = syncPluginKits(guildId, [
    { name: 'Kit_Dima', enabled: true, items: 18 }
  ]);
  assert.equal(afterDelete.kits.some(kit => kit.name === 'Kit_Ferro'), false);

  const afterRecreate = syncPluginKits(guildId, [
    { name: 'Kit_Dima', enabled: true, items: 18 },
    { name: 'Kit_Ferro', enabled: true, items: 12 }
  ]);
  assert.equal(afterRecreate.kits.some(kit => kit.name === 'Kit_Ferro'), true);
  assert.ok(iron);
});

test('admin removal hides plugin-managed kit until plugin reports it deleted', () => {
  const guildId = testGuildId();
  const initial = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: true, items: 12 }]);
  const iron = initial.kits[0];

  assert.equal(removeKit(guildId, iron.id), true);
  const stillPresentAtPlugin = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: true, items: 12 }]);
  assert.equal(stillPresentAtPlugin.kits.length, 0);

  syncPluginKits(guildId, []);
  const recreated = syncPluginKits(guildId, [{ name: 'Kit_Ferro', enabled: true, items: 12 }]);
  assert.equal(recreated.kits.length, 1);
});

test('a full plugin sync removes obsolete shop products that are no longer on Minecraft', () => {
  const guildId = testGuildId();
  updateGuildConfig(guildId, {
    kits: [{
      id: 'old-manual-id',
      name: 'Kit_Que_Nao_Existe',
      displayName: 'Kit antigo',
      price: 'R$ 2,00',
      description: 'Registro antigo',
      pluginManaged: false
    }]
  });

  const synced = syncPluginKits(guildId, [
    { name: 'Kit_Atual', enabled: true, items: 4 }
  ]);

  assert.deepEqual(synced.kits.map(kit => kit.name), ['Kit_Atual']);
});

test('friendly kit names remove underscores and hyphens', () => {
  assert.equal(makeKitDisplayName('Kit_Netherita-Plus'), 'Kit Netherita Plus');
});
