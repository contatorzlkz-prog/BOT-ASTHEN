import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDefinitions } from '../src/commands.js';
import { makeOrderControls, makeSupportPanel } from '../src/ui.js';

test('support panel keeps the 2.4 department selector', () => {
  const panel = makeSupportPanel();
  const menu = panel.components[0].components[0].toJSON();

  assert.equal(menu.custom_id, 'support:select');
  assert.deepEqual(
    menu.options.map(option => option.value),
    ['compras', 'licencas', 'bugs', 'parcerias', 'marketing']
  );
});

test('kit command includes price editing', () => {
  const kitCommand = commandDefinitions
    .map(command => command.toJSON())
    .find(command => command.name === 'kit');

  assert.ok(kitCommand);
  assert.ok(kitCommand.options.some(option => option.name === 'preco'));
});

test('shop ticket has private Pix copy action', () => {
  const controls = makeOrderControls().components.map(component => component.toJSON());
  assert.ok(controls.some(component => component.custom_id === 'pix:copy'));
  assert.ok(controls.some(component => component.custom_id === 'order:approve'));
  assert.ok(controls.some(component => component.custom_id === 'order:reject'));
});
