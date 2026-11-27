import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTikTokVideoUrl } from '../src/tiktok.js';

test('aceita link de vídeo TikTok e remove parâmetros de rastreamento', () => {
  const video = parseTikTokVideoUrl('https://www.tiktok.com/@asthenmc/video/7712550191269776661?is_from_webapp=1&sender_device=pc');
  assert.equal(video.username, 'asthenmc');
  assert.equal(video.videoId, '7712550191269776661');
  assert.equal(video.url, 'https://www.tiktok.com/@asthenmc/video/7712550191269776661');
});

test('recusa URLs fora do TikTok e esquemas inseguros', () => {
  assert.throws(() => parseTikTokVideoUrl('https://example.com/@asthenmc/video/123'), /TikTok/);
  assert.throws(() => parseTikTokVideoUrl('http://www.tiktok.com/@asthenmc/video/123'), /HTTPS/);
});

test('recusa páginas de perfil e links sem identificador de vídeo', () => {
  assert.throws(() => parseTikTokVideoUrl('https://www.tiktok.com/@asthenmc'), /link completo/);
  assert.throws(() => parseTikTokVideoUrl('not-a-url'), /link válido/);
});
