import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCatalogMenu, makeCatalogPaginationRow, makeKitAdminMenu, makeKitAdminPaginationRow, makeKitEditFieldMenu, makeShopPanel, makeSupportTicketEmbed } from '../src/ui.js';
import { CONFIG } from '../src/config.js';

function makeKits(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: 'kit-' + String(index + 1).padStart(3, '0'),
    name: 'Kit_' + String(index + 1),
    displayName: 'Kit ' + String(index + 1),
    enabled: true,
    pluginEnabled: true,
    pluginForSale: true,
    forSale: true,
    price: 'R$ 1,00',
    priceCents: 100,
    weeklyRemaining: 10,
    weeklyLimit: 10
  }));
}

test('catálogo de 200 kits é dividido em páginas de no máximo 25 opções', () => {
  const kits = makeKits(200);
  const allValues = [];

  for (let page = 0; page < 8; page += 1) {
    const row = makeCatalogMenu(kits, page).toJSON();
    const menu = row.components[0];
    assert.equal(menu.options.length, 25);
    assert.equal(menu.custom_id, 'shop:select:' + page);
    allValues.push(...menu.options.map(option => option.value));
  }

  assert.equal(new Set(allValues).size, 200);
  assert.equal(allValues.length, 200);
});

test('catálogo menor que 25 itens continua em uma única página', () => {
  const row = makeCatalogMenu(makeKits(7), 0).toJSON();
  assert.equal(row.components[0].options.length, 7);
  assert.equal(row.components[0].custom_id, 'shop:select:0');
});

test('paginação desabilita anterior na primeira e próxima na última página', () => {
  const first = makeCatalogPaginationRow(0, 8).toJSON().components;
  assert.equal(first[0].disabled, true);
  assert.equal(first[1].disabled, true);
  assert.equal(first[2].disabled, false);

  const last = makeCatalogPaginationRow(7, 8).toJSON().components;
  assert.equal(last[0].disabled, false);
  assert.equal(last[2].disabled, true);
});



test('menu mostra o total e as unidades disponíveis antes de selecionar o kit', () => {
  const kit = { ...makeKits(1)[0], weeklyRemaining: 3, weeklyLimit: 10 };
  const option = makeCatalogMenu([kit]).toJSON().components[0].options[0];
  assert.equal(option.description, 'R$ 1,00 · 3/10 disponíveis');
});

test('kit esgotado informa zero unidades e reposição no domingo', () => {
  const kit = { ...makeKits(1)[0], weeklyRemaining: 0, weeklyLimit: 10 };
  const option = makeCatalogMenu([kit]).toJSON().components[0].options[0];
  assert.match(option.label, /^Esgotado · /);
  assert.match(option.description, /0\/10 disponíveis/);
  assert.match(option.description, /volta domingo 00h/);
});

test('fixed shop panel contains the kit selector without an intermediate button', () => {
  const panel = makeShopPanel(makeKits(3));
  assert.equal(panel.embeds[0].toJSON().title, 'Loja ASTHEN');
  assert.equal(panel.components[0].toJSON().components[0].custom_id, 'shop:select:0');
  assert.equal(panel.components[0].toJSON().components[0].options.length, 3);
  assert.equal(panel.components.length, 1);
});

test('shop panel with no visible kits does not republish a demo product', () => {
  const panel = makeShopPanel([]);
  assert.match(panel.embeds[0].toJSON().description, /Nenhum kit está disponível/i);
  assert.equal(panel.components.length, 0);
});

test('shop panel with more than 25 kits adds a path to the full private list', () => {
  const panel = makeShopPanel(makeKits(30));
  assert.equal(panel.components[0].toJSON().components[0].options.length, 25);
  assert.equal(panel.components[1].toJSON().components[0].custom_id, 'shop:catalog');
});

test('ticket text converts a literal backslash-n into a real line break', () => {
  const previous = CONFIG.support.descriptions.outros;
  try {
    CONFIG.support.descriptions.outros = 'Primeira linha\\nSegunda linha';
    const description = makeSupportTicketEmbed('outros', { id: '123456789012345678' }).toJSON().description;
    assert.match(description, /Primeira linha\nSegunda linha/);
    assert.equal(description.includes('\\n'), false);
  } finally {
    CONFIG.support.descriptions.outros = previous;
  }
});

test('menus administrativos também exibem todos os 200 kits em páginas de 25', () => {
  const kits = makeKits(200);
  const allValues = [];

  for (let page = 0; page < 8; page += 1) {
    const row = makeKitAdminMenu(kits, page).toJSON();
    const menu = row.components[0];
    assert.equal(menu.options.length, 25);
    assert.equal(menu.custom_id, 'kit:edit-select');
    allValues.push(...menu.options.map(option => option.value));
  }

  assert.equal(allValues.length, 200);
  assert.equal(new Set(allValues).size, 200);
});

test('menu de edição permite retirar um kit da loja e recolocá-lo depois', () => {
  const visibleOptions = makeKitEditFieldMenu(makeKits(1)[0]).toJSON().components[0].options;
  const remove = visibleOptions.find(option => option.value === 'removeFromStore');
  assert.ok(remove);
  assert.equal(remove.label, 'Excluir da loja');
  assert.match(remove.description, /não apaga no Minecraft/i);

  const hiddenOptions = makeKitEditFieldMenu({ ...makeKits(1)[0], storeVisible: false }).toJSON().components[0].options;
  const restore = hiddenOptions.find(option => option.value === 'restoreFromStore');
  assert.ok(restore);
  assert.equal(restore.label, 'Recolocar na loja');
});

test('paginação administrativa mantém ação vinculada e desabilita limites', () => {
  const first = makeKitAdminPaginationRow(0, 2).toJSON().components;
  assert.equal(first[0].custom_id, 'kit:admin-page:edit:-1');
  assert.equal(first[0].disabled, true);
  assert.equal(first[2].custom_id, 'kit:admin-page:edit:1');
  assert.equal(first[2].disabled, false);
});

test('kit demo aparece identificado e informa que não gera compra', () => {
  const demo = {
    id: 'asthen-demo-kit',
    name: 'ASTHEN_DEMO_KIT',
    displayName: 'Kit Demonstração',
    demo: true,
    enabled: false,
    pluginEnabled: false,
    pluginForSale: false,
    forSale: false
  };
  const option = makeCatalogMenu([demo]).toJSON().components[0].options[0];
  assert.match(option.label, /^DEMO/);
  assert.match(option.description, /não gera compra nem cobrança/i);
});
