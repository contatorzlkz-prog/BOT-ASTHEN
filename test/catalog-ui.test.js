import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCatalogMenu, makeCatalogPaginationRow } from '../src/ui.js';

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
