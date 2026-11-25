import fs from 'node:fs';
import path from 'node:path';
import { getStoreDataDir } from './store.js';

const MAX_MESSAGES = 5000;
const MAX_ARCHIVED_ATTACHMENTS = 40;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 7 * 1024 * 1024;
const UPLOAD_GROUP_COUNT = 5;
const UPLOAD_GROUP_BYTES = 16 * 1024 * 1024;

function safeFileName(value) {
  const name = path.basename(String(value || 'anexo.bin'))
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 90);
  return name || 'anexo.bin';
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 * 1024)).toFixed(2) + ' MB';
}

async function fetchChannelMessages(channel) {
  const messages = new Map();
  let before;
  let truncated = false;
  while (messages.size < MAX_MESSAGES) {
    const options = { limit: 100 };
    if (before) options.before = before;
    const batch = await channel.messages.fetch(options);
    if (!batch.size) break;
    for (const message of batch.values()) messages.set(message.id, message);
    const oldest = [...batch.values()].reduce((a, b) =>
      a.createdTimestamp <= b.createdTimestamp ? a : b);
    before = oldest.id;
    if (batch.size < 100) break;
  }
  if (messages.size >= MAX_MESSAGES) truncated = true;
  return {
    messages: [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp),
    truncated
  };
}

async function downloadAttachment(attachment, destination) {
  let url;
  try { url = new URL(attachment.url); } catch { return { ok: false, reason: 'URL inválida' }; }
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
    return { ok: false, reason: 'host de anexo não permitido' };
  }
  if (Number(attachment.size) > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'maior que 8 MB' };

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) return { ok: false, reason: 'download HTTP ' + response.status };
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'maior que 8 MB' };
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'maior que 8 MB' };
    fs.writeFileSync(destination, data, { mode: 0o600 });
    if (process.platform !== 'win32') {
      try { fs.chmodSync(destination, 0o600); } catch {}
    }
    return { ok: true, bytes: data.length };
  } catch (error) {
    return { ok: false, reason: error.name === 'TimeoutError' ? 'tempo limite no download' : 'falha no download' };
  }
}

function buildMessageLines(message, attachmentResults) {
  const author = message.author?.tag || message.author?.username || 'Autor desconhecido';
  const timestamp = new Date(message.createdTimestamp || Date.now()).toISOString();
  const lines = [
    '[' + timestamp + '] ' + author + ' | user_id=' + (message.author?.id || 'desconhecido') +
      ' | message_id=' + message.id + (message.author?.bot ? ' | BOT' : ''),
    message.content ? message.content : '[mensagem sem texto]'
  ];

  for (const embed of message.embeds || []) {
    if (embed.title) lines.push('Embed: ' + embed.title);
    if (embed.description) lines.push('Descrição: ' + embed.description);
    for (const field of embed.fields || []) lines.push((field.name || 'Campo') + ': ' + (field.value || ''));
    if (embed.url) lines.push('URL do embed: ' + embed.url);
  }

  if (message.reference?.messageId) lines.push('Resposta a message_id=' + message.reference.messageId);
  for (const item of attachmentResults) {
    const label = item.name + ' (' + formatBytes(item.size) + ')';
    if (item.uploadUrl) lines.push('Anexo: ' + label + ' | cópia nos logs: ' + item.uploadUrl);
    else if (item.localPath) lines.push('Anexo: ' + label + ' | cópia local: ' + item.localPath + ' | não publicado nos logs');
    else lines.push('Anexo: ' + label + ' | não arquivado: ' + item.reason + ' | URL original: ' + item.url);
  }

  return lines.join('\n');
}

function groupAttachments(items) {
  const groups = [];
  let group = [];
  let bytes = 0;
  for (const item of items) {
    if (!item.localPath) continue;
    if (group.length >= UPLOAD_GROUP_COUNT || bytes + item.size > UPLOAD_GROUP_BYTES) {
      if (group.length) groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(item);
    bytes += item.size;
  }
  if (group.length) groups.push(group);
  return groups;
}

export async function exportTicketTranscript({ channel, ticket, logsChannel, closedBy }) {
  if (!channel?.messages?.fetch || !ticket?.channelId || !logsChannel?.send) {
    throw new Error('Não foi possível preparar a exportação deste ticket.');
  }
  if (channel.id === logsChannel.id) throw new Error('O canal de logs não pode ser o próprio ticket.');

  const { messages, truncated } = await fetchChannelMessages(channel);
  const archiveDir = path.join(getStoreDataDir(), 'archives', String(ticket.guildId), String(ticket.channelId));
  fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(archiveDir, 0o700); } catch {}
  }

  const allAttachments = [];
  let attachmentIndex = 0;
  let totalArchivedBytes = 0;
  for (const message of messages) {
    for (const attachment of message.attachments.values()) {
      attachmentIndex += 1;
      const item = {
        name: safeFileName(attachment.name),
        size: Number(attachment.size) || 0,
        url: attachment.url,
        localPath: null,
        uploadUrl: null,
        reason: null
      };
      if (attachmentIndex > MAX_ARCHIVED_ATTACHMENTS) {
        item.reason = 'limite de ' + MAX_ARCHIVED_ATTACHMENTS + ' anexos por ticket';
      } else if (totalArchivedBytes + item.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        item.reason = 'limite total de 40 MB por ticket';
      } else {
        const fileName = String(attachmentIndex).padStart(3, '0') + '-' + item.name;
        const target = path.join(archiveDir, fileName);
        const result = await downloadAttachment(attachment, target);
        if (result.ok && totalArchivedBytes + result.bytes <= MAX_TOTAL_ATTACHMENT_BYTES) {
          item.localPath = target;
          item.size = result.bytes;
          totalArchivedBytes += result.bytes;
        } else if (result.ok) {
          fs.rmSync(target, { force: true });
          item.reason = 'limite total de 40 MB por ticket';
        } else {
          item.reason = result.reason;
        }
      }
      allAttachments.push({ messageId: message.id, item });
    }
  }

  const uploadedGroups = [];
  const localItems = allAttachments.filter(entry => entry.item.localPath).map(entry => entry.item);
  for (const [index, group] of groupAttachments(localItems).entries()) {
    try {
      const uploaded = await logsChannel.send({
        content: 'Anexos arquivados do ticket ' + ticket.channelId +
          ' · lote ' + (index + 1) + '/' + groupAttachments(localItems).length,
        files: group.map(item => ({ attachment: item.localPath, name: path.basename(item.localPath) })),
        allowedMentions: { parse: [] }
      });
      const link = 'https://discord.com/channels/' + ticket.guildId + '/' + logsChannel.id + '/' + uploaded.id;
      for (const item of group) item.uploadUrl = link;
      uploadedGroups.push(link);
    } catch (error) {
      for (const item of group) item.reason = 'upload no Discord falhou';
      console.warn('[Asthen Transcript] Anexos mantidos no arquivo local, mas não enviados aos logs:', error.message);
    }
  }

  const attachmentByMessage = new Map();
  for (const entry of allAttachments) {
    if (!attachmentByMessage.has(entry.messageId)) attachmentByMessage.set(entry.messageId, []);
    attachmentByMessage.get(entry.messageId).push(entry.item);
  }

  const openedAt = ticket.createdAt || 'desconhecido';
  const output = [
    'ASTHEN BOT · TRANSCRIÇÃO DE TICKET',
    'Servidor: ' + (ticket.guildId || 'desconhecido'),
    'Canal: ' + ticket.channelId,
    'Tipo: ' + (ticket.type || 'suporte'),
    'Cliente: ' + (ticket.userId || 'desconhecido'),
    'Criado em: ' + openedAt,
    'Fechado por: ' + (closedBy?.tag || closedBy?.username || closedBy?.id || 'desconhecido'),
    'Fechado em: ' + new Date().toISOString(),
    'Pedido: ' + (ticket.orderStatus || 'não se aplica'),
    'Kit: ' + (ticket.kitDisplayName || ticket.kitName || 'não se aplica'),
    'Valor: ' + (ticket.kitPrice || 'não informado'),
    'Mensagens exportadas: ' + messages.length + (truncated ? ' (limite atingido; mensagens mais antigas podem não estar incluídas)' : ''),
    'Anexos encontrados: ' + allAttachments.length,
    'Anexos enviados ao Discord: ' + localItems.filter(item => item.uploadUrl).length,
    '',
    '==================== CONVERSA ====================',
    ''
  ];
  for (const message of messages) {
    output.push(buildMessageLines(message, attachmentByMessage.get(message.id) || []), '');
  }
  if (uploadedGroups.length) {
    output.push('Mensagens de anexos no canal de logs:', ...uploadedGroups, '');
  }
  let transcript = output.join('\n');
  let buffer = Buffer.from(transcript, 'utf8');
  if (buffer.length > MAX_TRANSCRIPT_BYTES) {
    const tail = buffer.subarray(buffer.length - (MAX_TRANSCRIPT_BYTES - 1024)).toString('utf8');
    transcript = 'ASTHEN BOT · TRANSCRIÇÃO PARCIAL\nO arquivo excedeu o limite de exportação; somente as mensagens mais recentes foram mantidas.\n\n' + tail;
    buffer = Buffer.from(transcript, 'utf8');
  }

  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = 'ticket-' + ticket.channelId + '-' + date + '.txt';
  const localTranscript = path.join(archiveDir, filename);
  fs.writeFileSync(localTranscript, buffer, { mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(localTranscript, 0o600); } catch {}
  }

  const posted = await logsChannel.send({
    content: 'Transcrição arquivada · ticket ' + ticket.channelId +
      ' · ' + messages.length + ' mensagens · ' + allAttachments.length + ' anexo(s).',
    files: [{ attachment: buffer, name: filename }],
    allowedMentions: { parse: [] }
  });

  return {
    exportedAt: new Date().toISOString(),
    logMessageId: posted.id,
    messageCount: messages.length,
    attachmentCount: allAttachments.length,
    archivedAttachmentCount: localItems.filter(item => item.uploadUrl).length,
    truncated
  };
}
