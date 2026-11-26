import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, getPlayerRegistration, findPlayerRegistrationByNick, savePlayerRegistration, clearPlayerRegistrationsForGuild } from '../src/store.js';
import { validateMinecraftNick } from '../src/registration.js';

loadStore();

test('nick Minecraft mantém compatibilidade com gamertags Bedrock aceitas pelo fluxo legado', () => {
  assert.equal(validateMinecraftNick('Ruan_123'), true);
  assert.equal(validateMinecraftNick('Ruan Carlos'), true);
  assert.equal(validateMinecraftNick(' Ruan'), false);
  assert.equal(validateMinecraftNick('Ruan '), false);
  assert.equal(validateMinecraftNick(''), false);
  assert.equal(validateMinecraftNick('x'.repeat(33)), false);
  assert.equal(validateMinecraftNick('Nick/Inválido'), false);
});

test('registro é indexado pelo ID Discord e consultável pelo nick', () => {
  const discordId = '100000000000000001';
  const record = savePlayerRegistration(discordId, 'Ruan_MC', '200000000000000001');
  assert.equal(record.discord_id, discordId);
  assert.equal(record.minecraft_nick, 'Ruan_MC');
  assert.ok(record.created_at);
  assert.ok(record.updated_at);
  assert.equal(getPlayerRegistration(discordId).minecraft_nick, 'Ruan_MC');
  assert.equal(findPlayerRegistrationByNick('ruan_mc').discord_id, discordId);
});

test('nick duplicado não pode ser vinculado a outra conta Discord', () => {
  savePlayerRegistration('100000000000000002', 'Player_One');
  assert.throws(() => savePlayerRegistration('100000000000000003', 'player_one'), /já está vinculado/i);
});

test('alterar nick preserva created_at e atualiza o dado canônico', () => {
  const discordId = '100000000000000004';
  const first = savePlayerRegistration(discordId, 'Old_Name');
  const updated = savePlayerRegistration(discordId, 'New_Name');
  assert.equal(updated.created_at, first.created_at);
  assert.equal(updated.minecraft_nick, 'New_Name');
  assert.ok(Date.parse(updated.updated_at) >= Date.parse(first.updated_at));
});

test('reset limpa os cadastros do servidor e entradas antigas sem guild_id, preservando outros servidores', () => {
  const guildA = '200000000000000011';
  const guildB = '200000000000000012';
  const playerA = '100000000000000011';
  const playerB = '100000000000000012';
  const legacyPlayer = '100000000000000013';

  savePlayerRegistration(playerA, 'Guild_A', guildA);
  savePlayerRegistration(playerB, 'Guild_B', guildB);
  savePlayerRegistration(legacyPlayer, 'Legacy_Player');

  assert.equal(clearPlayerRegistrationsForGuild(guildA, [playerA, legacyPlayer]), 2);
  assert.equal(getPlayerRegistration(playerA), null);
  assert.equal(getPlayerRegistration(legacyPlayer), null);
  assert.equal(getPlayerRegistration(playerB).minecraft_nick, 'Guild_B');
  assert.equal(findPlayerRegistrationByNick('guild_a'), null);
  assert.equal(findPlayerRegistrationByNick('guild_b').discord_id, playerB);
});
