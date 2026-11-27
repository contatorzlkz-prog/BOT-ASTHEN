import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPermissionChannel,
  classifyPermissionRole,
  normalizePermissionName,
  ticketOwnerId
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

test('Booster, bots de serviço, ping e cargos desconhecidos não recebem acesso por padrão', () => {
  assert.equal(classifyPermissionRole('Booster'), 'booster');
  assert.equal(classifyPermissionRole('Bot'), 'service');
  assert.equal(classifyPermissionRole('Asthinho'), 'service');
  assert.equal(classifyPermissionRole('Loritta'), 'service');
  assert.equal(classifyPermissionRole('DISBOARD.org'), 'service');
  assert.equal(classifyPermissionRole('Ping Eventos'), 'ping');
  assert.equal(classifyPermissionRole('Cargo VIP'), 'other');
});

test('canais são classificados por propósito sem depender dos cargos cosméticos', () => {
  assert.equal(classifyPermissionChannel({ name: '📝・registro' }), 'registration');
  assert.equal(classifyPermissionChannel({ name: 'logs' }), 'logs');
  assert.equal(classifyPermissionChannel({ name: 'comandos-adm' }), 'admin-command');
  assert.equal(classifyPermissionChannel({ name: 'chat-staff' }), 'staff');
  assert.equal(classifyPermissionChannel({ name: 'punições' }), 'staff');
  assert.equal(classifyPermissionChannel({ name: 'comandos', parentName: 'Administração' }), 'admin');
  assert.equal(classifyPermissionChannel({ name: 'chat-geral' }), 'member');
  assert.equal(classifyPermissionChannel({ name: '📱・vídeos-novos' }), 'video-feed');
});

test('tickets ASTHEN mantêm o dono identificado pelo tópico interno', () => {
  const ownerId = '123456789012345678';
  assert.equal(ticketOwnerId({ topic: 'ASTHEN|type:support|owner:' + ownerId }), ownerId);
  assert.equal(ticketOwnerId({ topic: 'ASTHEN|type:shop|owner:' + ownerId + '|kit:ferro' }), ownerId);
  assert.equal(ticketOwnerId({ topic: 'ASTHEN|type:support|owner:invalid' }), null);
  assert.equal(ticketOwnerId({ topic: '' }), null);
});
