import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverStandardChannels, messageHasPanel, normalizeChannelName } from '../src/channel-discovery.js';

test('normaliza nomes de canais ignorando emoji, acentos e separadores', () => {
  assert.equal(normalizeChannelName('🛒・Kits'), 'kits');
  assert.equal(normalizeChannelName('📩-Atendimento'), 'atendimento');
  assert.equal(normalizeChannelName('🧾・Compradores'), 'compradores');
});

test('descobre automaticamente os quatro canais padrão sem capturar categorias', () => {
  const channels = [
    { id: '1', name: '📩・atendimento', type: 0 },
    { id: '2', name: '🛒・kits', type: 0 },
    { id: '3', name: 'logs', type: 0 },
    { id: '4', name: '🧾・compradores', type: 0 },
    { id: '5', name: 'kits', type: 4 }
  ];
  assert.deepEqual(discoverStandardChannels(channels), {
    supportPanelChannelId: '1',
    shopPanelChannelId: '2',
    logsChannelId: '3',
    buyersChannelId: '4'
  });
});

test('reconhece uma mensagem de painel do próprio bot sem precisar editá-la', () => {
  const message = {
    id: 'msg-1',
    author: { id: 'bot-1' },
    components: [{ components: [{ customId: 'shop:catalog' }] }]
  };
  assert.equal(messageHasPanel(message, 'shop:catalog', 'bot-1'), true);
  assert.equal(messageHasPanel(message, 'support:select', 'bot-1'), false);
  assert.equal(messageHasPanel(message, 'shop:catalog', 'other-bot'), false);
});
