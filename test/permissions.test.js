import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPermissionChannel,
  classifyPermissionRole,
  normalizePermissionName
} from '../src/permissions.js';

test('nomes dos cargos são normalizados sem depender de emoji ou pontuação', () => {
  assert.equal(normalizePermissionName('Ger. Host'), 'gerhost');
  assert.equal(normalizePermissionName('Ping Atualizações'), 'pingatualizacoes');
  assert.equal(normalizePermissionName('📝・registro'), 'registro');
});

test('PC, Mobile e Console são tratados como cargos cosméticos do Onboarding', () => {
  assert.equal(classifyPermissionRole('PC'), 'platform');
  assert.equal(classifyPermissionRole('Mobile'), 'platform');
  assert.equal(classifyPermissionRole('Console'), 'platform');
});

test('cargos da equipe são separados por nível de acesso', () => {
  assert.equal(classifyPermissionRole('Proprietario'), 'manager');
  assert.equal(classifyPermissionRole('Ger. Host'), 'manager');
  assert.equal(classifyPermissionRole('Ger. Discord'), 'manager');
  assert.equal(classifyPermissionRole('Ger. Server'), 'manager');
  assert.equal(classifyPermissionRole('Staff'), 'staff');
});

test('Booster, bot, integração e ping não viram cargos de acesso a canais', () => {
  assert.equal(classifyPermissionRole('Booster'), 'booster');
  assert.equal(classifyPermissionRole('Bot'), 'service');
  assert.equal(classifyPermissionRole('Asthinho'), 'service');
  assert.equal(classifyPermissionRole('Loritta'), 'service');
  assert.equal(classifyPermissionRole('DISBOARD.org'), 'service');
  assert.equal(classifyPermissionRole('Ping Eventos'), 'ping');
});

test('somente registro é público e canais administrativos têm escopos separados', () => {
  assert.equal(classifyPermissionChannel({ name: '📝・registro' }), 'registration');
  assert.equal(classifyPermissionChannel({ name: 'logs' }), 'logs');
  assert.equal(classifyPermissionChannel({ name: 'comandos-adm' }), 'admin-command');
  assert.equal(classifyPermissionChannel({ name: 'chat-staff' }), 'staff');
  assert.equal(classifyPermissionChannel({ name: 'punições' }), 'staff');
  assert.equal(classifyPermissionChannel({ name: 'comandos', parentName: 'Administração' }), 'admin');
  assert.equal(classifyPermissionChannel({ name: 'chat-geral' }), 'member');
});

test('tickets ASTHEN e canais com sobrescritas individuais permanecem protegidos', () => {
  assert.equal(classifyPermissionChannel({ name: 'ticket-ruan', topic: 'ASTHEN|type:support|owner:1' }), 'ticket');
  assert.equal(classifyPermissionChannel({ name: 'sala-privada', hasPersonalOverwrite: true }), 'private');
});

test('canais com regras de acesso de cargos não classificados continuam protegidos', () => {
  assert.equal(classifyPermissionChannel({ name: 'vip', hasCustomRoleViewOverwrite: true }), 'custom');
});
