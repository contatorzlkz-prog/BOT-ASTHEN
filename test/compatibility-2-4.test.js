import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDefinitions } from '../src/commands.js';
import {
  makeBuyerAnnouncement,
  makeCatalogMenu,
  makeOrderControls,
  makeOrderEmbed,
  makeShopPanel,
  makeSupportPanel
} from '../src/ui.js';

function command(name) {
  return commandDefinitions.map(item => item.toJSON()).find(item => item.name === name);
}

test('support selector uses Minecraft server departments', () => {
  const panel = makeSupportPanel();
  const menu = panel.components[0].components[0].toJSON();

  assert.equal(menu.custom_id, 'support:select');
  assert.deepEqual(
    menu.options.map(option => option.value),
    ['compras', 'servidor', 'bugs', 'denuncias', 'outros']
  );
  assert.ok(!JSON.stringify(menu.options).toLowerCase().includes('licen'));
  assert.ok(!JSON.stringify(menu.options).toLowerCase().includes('ativação'));

  const description = panel.embeds[0].toJSON().description;
  assert.ok(description.includes('\n\n'));
  assert.equal(description.includes('\\n'), false);
});

test('admin commands are compact and Pix is no longer a slash command', () => {
  const names = commandDefinitions.map(item => item.toJSON().name);
  assert.deepEqual(names, ['configurar', 'kit', 'backup', 'bridge']);
  assert.equal(command('pix'), undefined);
  assert.deepEqual(command('kit').options.map(option => option.name), ['listar', 'editar']);
  assert.deepEqual(command('configurar').options.map(option => option.name), ['atendimento', 'kits', 'logs', 'compradores', 'equipe']);
  assert.deepEqual(command('bridge').options.map(option => option.name), ['status']);
  assert.equal(command('kit').default_member_permissions, '8');
});

test('painel fixo de kits abre a seleção direta mesmo sem catálogo real', () => {
  for (const panel of [makeShopPanel(), makeShopPanel()]) {
    const menu = panel.components[0].components[0].toJSON();
    assert.equal(menu.custom_id, 'shop:select:0');
    assert.equal(menu.options.length, 1);
    assert.equal(menu.options[0].value, 'asthen-demo-kit');
    assert.match(menu.options[0].label, /^DEMO/);
  }

  const availablePanel = makeShopPanel([{
    id: 'a', name: 'Kit_Teste', price: 'R$ 5,00', enabled: true,
    pluginForSale: true, forSale: true
  }]);
  const availableMenu = availablePanel.components[0].components[0].toJSON();
  assert.equal(availableMenu.custom_id, 'shop:select:0');
  assert.equal(availableMenu.options[0].value, 'a');
});

test('shop catalog shows friendly names and marks inactive or unpriced kits unavailable', () => {
  const row = makeCatalogMenu([
    { id: '1', name: 'Kit_Ferro', displayName: 'Kit Ferro', price: 'R$ 5,00', enabled: true, pluginForSale: true, forSale: true },
    { id: '2', name: 'Kit_Dima', displayName: 'Kit Dima', price: '', enabled: true, pluginForSale: false, forSale: false },
    { id: '3', name: 'Kit_Elytra', displayName: 'Kit Elytra', price: 'R$ 9,00', enabled: false, pluginForSale: false, forSale: false }
  ]);
  const menu = row.components[0].toJSON();

  assert.deepEqual(menu.options.map(option => option.label), ['Kit Ferro', 'Indisponível · Kit Dima', 'Indisponível · Kit Elytra']);
  assert.deepEqual(menu.options.map(option => option.value), ['1', '2', '3']);
  assert.ok(menu.options.every(option => !option.label.includes('_')));
});

test('purchase message contains Pix QR details and does not expose order id or kit contents', () => {
  const embed = makeOrderEmbed({
    userId: '123456789012345678',
    kit: {
      name: 'Kit_Ferro',
      displayName: 'Kit Ferro',
      price: 'R$ 5,00',
      description: 'Espada, armadura e 64 blocos secretos',
      imageUrl: ''
    },
    minecraftNick: 'PlayerTeste'
  }).toJSON();

  const fields = embed.fields.map(field => field.value).join('\n');
  assert.ok(fields.includes('keybytes.a@gmail.com'));
  assert.ok(fields.includes('R$ 5,00'));
  assert.ok(!JSON.stringify(embed).includes('request_id'));
  assert.ok(!fields.includes('Espada, armadura'));
});

test('buyer announcement mentions the buyer once and shows purchase value', () => {
  const embed = makeBuyerAnnouncement({
    userId: '123456789012345678',
    kitName: 'Kit_Ferro',
    kitDisplayName: 'Kit Ferro',
    kitPrice: 'R$ 5,00',
    minecraftNick: 'PlayerTeste'
  }).toJSON();

  const serialized = JSON.stringify(embed);
  assert.equal(serialized.split('<@123456789012345678>').length - 1, 1);
  assert.ok(serialized.includes('R$ 5,00'));
  assert.ok(serialized.includes('Kit Ferro'));
});

test('payment ticket keeps Pix copy and staff decisions on one message', () => {
  const controls = makeOrderControls().components.map(component => component.toJSON());
  assert.ok(controls.some(component => component.custom_id === 'pix:copy'));
  assert.ok(controls.some(component => component.custom_id === 'order:approve'));
  assert.ok(controls.some(component => component.custom_id === 'order:reject'));
  assert.ok(controls.some(component => component.custom_id === 'ticket:close'));
});


test('catalog clearly marks weekly stock exhaustion and remaining units', () => {
  const row = makeCatalogMenu([
    { id: 'kit-stock', name: 'Kit_Ferro', displayName: 'Kit Ferro', price: 'R$ 9,90', enabled: true, pluginForSale: true, forSale: true, weeklyRemaining: 0, weeklyLimit: 10 },
    { id: 'kit-left', name: 'Kit_Dima', displayName: 'Kit Dima', price: 'R$ 19,90', enabled: true, pluginForSale: true, forSale: true, weeklyRemaining: 4, weeklyLimit: 10 }
  ]);
  const menu = row.components[0].toJSON();
  assert.equal(menu.options[0].label, 'Kit Dima');
  assert.ok(menu.options[0].description.includes('4/10'));
  assert.equal(menu.options[1].label, 'Esgotado · Kit Ferro');
  assert.ok(menu.options[1].description.includes('Limite semanal'));
});
