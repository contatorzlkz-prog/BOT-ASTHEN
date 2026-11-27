import { AttachmentBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import { normalizeChannelName } from './channel-discovery.js';

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com']);
const FRAME_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const FRAME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

export function parseTikTokVideoUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('Envie um link válido de vídeo do TikTok.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || (!TIKTOK_HOSTS.has(hostname) && !hostname.endsWith('.tiktok.com'))) {
    throw new Error('O link precisa pertencer ao TikTok e usar HTTPS.');
  }

  const match = parsed.pathname.match(/^\/@([A-Za-z0-9._]{2,24})\/video\/(\d+)\/?$/);
  if (!match) {
    throw new Error('Use o link completo do vídeo no formato tiktok.com/@usuario/video/ID.');
  }

  const username = match[1];
  const videoId = match[2];
  return {
    videoId,
    username,
    url: 'https://www.tiktok.com/@' + username + '/video/' + videoId
  };
}

async function fetchTikTokMetadata(url) {
  try {
    const endpoint = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(url);
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
      redirect: 'error'
    });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: typeof data.title === 'string' ? data.title.trim().slice(0, 240) : '',
      authorName: typeof data.author_name === 'string' ? data.author_name.trim().slice(0, 80) : '',
      authorUrl: typeof data.author_url === 'string' ? data.author_url : ''
    };
  } catch (error) {
    console.warn('[Asthen TikTok] Não foi possível carregar os metadados:', error.message);
    return null;
  }
}

async function buildFrameAttachment(frame) {
  if (!frame) return null;

  const contentType = String(frame.contentType || '').toLowerCase().split(';')[0].trim();
  const extension = FRAME_TYPES.get(contentType);
  if (!extension) {
    throw new Error('O frame precisa ser uma imagem PNG, JPG, WEBP ou GIF.');
  }
  if (!Number.isFinite(frame.size) || frame.size < 1 || frame.size > MAX_FRAME_BYTES) {
    throw new Error('A imagem do frame precisa ter até 8 MB.');
  }

  let url;
  try {
    url = new URL(frame.url);
  } catch {
    throw new Error('Não foi possível ler o anexo do frame.');
  }
  if (url.protocol !== 'https:' || !FRAME_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Origem do anexo inválida. Envie a imagem diretamente pelo Discord.');
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw new Error('Não foi possível baixar a imagem anexada.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1 || buffer.length > MAX_FRAME_BYTES) {
    throw new Error('A imagem do frame ultrapassa o limite de 8 MB.');
  }

  const filename = 'asthen-tiktok-frame.' + extension;
  return { file: new AttachmentBuilder(buffer, { name: filename }), filename };
}

async function findVideoChannel(guild) {
  await guild.channels.fetch();
  return [...guild.channels.cache.values()].find(channel =>
    channel.type === ChannelType.GuildText && normalizeChannelName(channel.name) === 'videosnovos'
  ) || null;
}

export async function publishTikTokVideo(guild, rawUrl, frame = null) {
  const video = parseTikTokVideoUrl(rawUrl);
  const channel = await findVideoChannel(guild);
  if (!channel?.send || !channel.messages?.fetch) {
    throw new Error('Não encontrei o canal #📱・vídeos-novos. Confira o nome do canal.');
  }

  const recent = await channel.messages.fetch({ limit: 50 });
  const alreadyPosted = recent.some(message =>
    message.author?.id === guild.client.user?.id
    && message.embeds?.some(embed => {
      try {
        return parseTikTokVideoUrl(embed.url).videoId === video.videoId;
      } catch {
        return false;
      }
    })
  );
  if (alreadyPosted) {
    throw new Error('Esse vídeo já foi publicado em #vídeos-novos.');
  }

  const metadata = await fetchTikTokMetadata(video.url);
  const frameFile = await buildFrameAttachment(frame);
  const embed = new EmbedBuilder()
    .setColor(0x7652c7)
    .setAuthor({ name: 'ASTHEN MC', url: video.url })
    .setTitle(metadata?.title || 'Vídeo novo')
    .setURL(video.url)
    .setDescription('[▶ Assistir no TikTok](' + video.url + ')')
    .setFooter({ text: '@' + video.username })
    .setTimestamp(new Date());

  if (frameFile) embed.setImage('attachment://' + frameFile.filename);

  const message = await channel.send({
    embeds: [embed],
    files: frameFile ? [frameFile.file] : [],
    allowedMentions: { parse: [] }
  });

  return {
    channel,
    message,
    videoId: video.videoId,
    title: metadata?.title || '',
    frameAttached: Boolean(frameFile)
  };
}
