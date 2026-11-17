import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { CONFIG, hexToInt } from './config.js';
import { PIX_KEY_DEFAULT } from './pix.js';

export const PANEL_LAYOUT_VERSION = '2.16.0';

const brandColor = () => hexToInt(CONFIG.brand.color);

function safeImageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const supportOptions = [
  {
    value: 'compras',
    label: 'Compras & Kits',
    description: 'Dúvidas sobre kits, pedidos e pagamentos.',
    emoji: '🛒'
  },
  {
    value: 'servidor',
    label: 'Ajuda no Servidor',
    description: 'Problemas para entrar, jogar ou usar comandos.',
    emoji: '⛏️'
  },
  {
    value: 'bugs',
    label: 'Reportar Problema',
    description: 'Erros, falhas e comportamentos inesperados.',
    emoji: '🐛'
  },
  {
    value: 'denuncias',
    label: 'Denúncias',
    description: 'Relate jogadores ou situações que precisam de análise.',
    emoji: '🛡️'
  },
  {
    value: 'outros',
    label: 'Outros Assuntos',
    description: 'Sugestões e assuntos que não se encaixam acima.',
    emoji: '💬'
  }
];

const supportTitles = {
  ...Object.fromEntries(supportOptions.map(option => [option.value, option.label])),
  bug: 'Reportar bug',
  hack: 'Reportar hack',
  duvida: 'Tirar dúvida',
  geral: 'Outro assunto'
};

const supportColor = kind => hexToInt(CONFIG.support.colors[kind], brandColor());

function displayKitName(kit) {
  const value = String(kit?.displayName || kit?.name || 'Kit');
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function normalizeVisibleText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t');
}

function canBuyKit(kit) {
  return kit?.enabled !== false
    && kit?.manuallyUnavailable !== true
    && kit?.missingFromPlugin !== true
    && kit?.pluginForSale === true
    && kit?.forSale === true
    && !(Number.isInteger(kit?.weeklyRemaining) && kit.weeklyRemaining <= 0);
}

export function makeSupportPanel() {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Atendimento')
    .setDescription(
      'Precisa de ajuda? Escolha o assunto no menu abaixo. O bot abrirá um canal privado para você e para a equipe de atendimento.\n\n' +
      'Explique o que aconteceu e envie prints ou logs quando ajudarem. A equipe continuará a conversa nesse canal.'
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('support:select')
    .setPlaceholder('Selecione o assunto do atendimento...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(supportOptions.map(option => ({
      label: option.label,
      description: option.description,
      value: option.value,
      emoji: option.emoji
    })));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

export function makeShopPanel(kits = []) {
  const entries = Array.isArray(kits) && kits.length ? kits : [{
    id: 'asthen-demo-kit',
    name: 'ASTHEN_DEMO_KIT',
    displayName: 'Kit Demonstração',
    description: 'Amostra visual. Não gera compra, Pix ou entrega.',
    price: 'Demonstração',
    demo: true,
    enabled: false,
    pluginEnabled: false,
    pluginForSale: false,
    forSale: false
  }];

  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Loja ASTHEN')
    .setDescription(CONFIG.shop.panelDescription);

  const components = [makeCatalogMenu(entries, 0)];
  if (entries.length > Math.min(25, Math.max(1, Number(CONFIG.shop.maxKits) || 25))) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('shop:catalog')
        .setLabel('Ver todos os kits')
        .setStyle(ButtonStyle.Secondary)
    ));
  }
  return { embeds: [embed], components };
}



export function makeCatalogMenu(kits = [], page = 0) {
  const pageSize = Math.min(25, Math.max(1, Number(CONFIG.shop.maxKits) || 25));
  const sorted = [...kits]
    .sort((a, b) => Number(canBuyKit(b)) - Number(canBuyKit(a)));
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(totalPages - 1, Math.max(0, Number.isInteger(page) ? page : 0));
  const listed = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:select:' + currentPage)
    .setPlaceholder('Escolha um kit para ver os detalhes...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(listed.map(kit => {
      const hasWeeklyStock = Number.isInteger(kit.weeklyRemaining);
      const soldOut = hasWeeklyStock && kit.weeklyRemaining <= 0;
      const available = canBuyKit(kit);
      const reason = kit.demo
        ? 'Amostra visual · não gera compra nem cobrança'
        : soldOut
          ? 'Limite semanal atingido · volta domingo 00h'
          : kit.missingFromPlugin
            ? 'Removido do servidor'
            : kit.manuallyUnavailable
              ? 'Indisponível pela equipe'
              : kit.pluginEnabled === false || kit.enabled === false
                ? 'Desativado no servidor'
                : kit.pluginForSale !== true
                  ? (kit.priceCents ? 'Venda desativada no plugin' : 'Preço ainda não definido no Minecraft')
                  : String(kit.price || 'Preço indisponível') +
                    (hasWeeklyStock ? ' · ' + kit.weeklyRemaining + '/' + (kit.weeklyLimit || 10) + ' esta semana' : '');
      return {
        label: (kit.demo ? 'DEMO · ' : soldOut ? 'Esgotado · ' : available ? '' : 'Indisponível · ')
          .concat(displayKitName(kit)).slice(0, 100),
        description: reason.slice(0, 100),
        value: String(kit.id)
      };
    }));
  return new ActionRowBuilder().addComponents(menu);
}

export function makeCatalogPaginationRow(page, totalPages) {
  if (totalPages <= 1) return null;
  const currentPage = Math.min(totalPages - 1, Math.max(0, Number(page) || 0));
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop:page:' + (currentPage - 1))
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0),
    new ButtonBuilder()
      .setCustomId('shop:page:info')
      .setLabel('Página ' + (currentPage + 1) + '/' + totalPages)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('shop:page:' + (currentPage + 1))
      .setLabel('Próxima')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

export function makeKitAdminMenu(kits = [], page = 0) {
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(kits.length / pageSize));
  const currentPage = Math.min(totalPages - 1, Math.max(0, Number.isInteger(page) ? page : 0));
  const listed = kits.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('kit:edit-select')
    .setPlaceholder('Selecione um kit · página ' + (currentPage + 1) + '/' + totalPages)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(listed.map(kit => ({
      label: (canBuyKit(kit) ? '' : 'Indisponível · ').concat(displayKitName(kit)).slice(0, 100),
      description: ((kit.missingFromPlugin ? 'Removido do servidor' : kit.pluginEnabled === false ? 'Desativado no Minecraft' : kit.pluginForSale !== true ? (kit.priceCents ? 'Venda desativada' : 'Sem preço no Minecraft') : String(kit.price || 'À venda')) + ' · ' + String(kit.name)).slice(0, 100),
      value: String(kit.id)
    })));
  return new ActionRowBuilder().addComponents(menu);
}

export function makeKitAdminPaginationRow(page, totalPages) {
  if (totalPages <= 1) return null;
  const currentPage = Math.min(totalPages - 1, Math.max(0, Number(page) || 0));
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('kit:admin-page:edit:' + (currentPage - 1))
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0),
    new ButtonBuilder()
      .setCustomId('kit:admin-page:edit:info')
      .setLabel('Página ' + (currentPage + 1) + '/' + totalPages)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('kit:admin-page:edit:' + (currentPage + 1))
      .setLabel('Próxima')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

export function makeKitEditFieldMenu(kit) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('kit:edit-field:' + kit.id)
    .setPlaceholder('O que deseja alterar?')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Nome exibido na loja', description: 'Nome que o cliente verá no catálogo.', value: 'displayName' },
      { label: 'Descrição', description: 'Texto que aparece na prévia da loja.', value: 'description' },
      { label: 'Imagem', description: 'Link HTTPS da imagem do kit.', value: 'imageUrl' }
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function makeKitPreviewEmbed(kit) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle(displayKitName(kit))
    .setDescription(normalizeVisibleText(kit.description || 'Descrição em atualização.'))
    .addFields(
      { name: 'Preço', value: String(kit.price || 'Não definido no Minecraft'), inline: true },
      { name: 'Venda', value: kit.forSale === true ? 'Disponível' : 'Indisponível', inline: true }
    );
  if (Number.isInteger(kit.weeklyRemaining)) {
    embed.addFields({
      name: 'Estoque desta semana',
      value: kit.weeklyRemaining + '/' + (kit.weeklyLimit || 10) +
        ' unidades disponíveis. Reinicia domingo às 00:00 (Brasília).',
      inline: false
    });
  }
  const image = safeImageUrl(kit.imageUrl);
  if (image) embed.setImage(image);
  return embed;
}

export function makeKitPreviewControls(draft) {
  const revision = String(draft.revision || '0');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop:switch-kit:' + revision)
      .setLabel('Trocar kit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('shop:kit-confirm:' + revision)
      .setLabel('Confirmar kit')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('shop:cancel:' + revision)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
}

export function makeSupportTicketEmbed(kind, user) {
  const descriptions = CONFIG.support.descriptions;
  return new EmbedBuilder()
    .setColor(supportColor(kind))
    .setTitle(supportTitles[kind] || 'Atendimento')
    .setDescription(
      '**Solicitante:** <@' + user.id + '>\n\n' +
      normalizeVisibleText(descriptions[kind] || descriptions.outros || 'Descreva o assunto para a equipe.') +
      '\n\nEnvie aqui os detalhes e imagens que ajudem a equipe.'
    )
    .setTimestamp();
}


export function makePurchaseReviewEmbed(draft) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Confira sua compra')
    .setDescription(CONFIG.shop.reviewDescription)
    .addFields(
      { name: 'Kit', value: displayKitName(draft.kit), inline: true },
      { name: 'Preço', value: String(draft.kit.price), inline: true },
      { name: 'Gamertag Bedrock', value: String(draft.minecraftNick), inline: true }
    );
  if (Number.isInteger(draft.kit.weeklyRemaining)) {
    embed.addFields({
      name: 'Estoque semanal',
      value: draft.kit.weeklyRemaining + '/' + (draft.kit.weeklyLimit || 10) +
        ' disponíveis no momento. A unidade só é reservada quando a equipe confirma o pagamento.',
      inline: false
    });
  }
  const image = safeImageUrl(draft.kit.imageUrl);
  if (image) embed.setThumbnail(image);
  return embed;
}

export function makePurchaseReviewControls(draft) {
  const revision = String(draft.revision || '0');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop:confirm:' + revision).setLabel('Confirmar pedido').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('shop:switch-kit:' + revision).setLabel('Trocar kit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop:edit-nick:' + revision).setLabel('Editar gamertag').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop:cancel:' + revision).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
  );
}

export function makePlatformControls(draft) {
  const revision = String(draft.revision || '0');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop:platform:java:' + revision).setLabel('Minecraft Java').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop:platform:bedrock:' + revision).setLabel('Minecraft Bedrock').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('shop:cancel:' + revision).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
  );
}


export function makeOrderEmbed({ userId, kit, minecraftNick, platform }) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Pagamento · ' + displayKitName(kit))
    .setDescription(
      (userId ? '**Comprador:** <@' + userId + '>\n\n' : '') +
      'Faça o Pix no valor indicado; informe o valor manualmente no banco. Depois envie a foto ou o arquivo do comprovante aqui. ' +
      'A equipe confere o pagamento antes de reservar uma unidade e solicitar a entrega.'
    )
    .addFields(
      { name: 'Kit', value: displayKitName(kit), inline: true },
      { name: 'Valor', value: String(kit.price || '—'), inline: true },
      { name: 'Nick', value: String(minecraftNick || '—'), inline: true },
      { name: 'Edição', value: 'Bedrock', inline: true },
      { name: 'Limite semanal', value: '10 unidades por kit. A unidade é reservada após a aprovação do pagamento.', inline: false },
      { name: 'Chave Pix', value: '\x60' + PIX_KEY_DEFAULT + '\x60', inline: true },
      { name: 'Comprovante', value: 'Anexe a imagem ou o PDF nesta conversa.', inline: false }
    )
    .setTimestamp();

  const kitImage = safeImageUrl(kit.imageUrl);
  if (kitImage) embed.setThumbnail(kitImage);
  embed.setImage('attachment://pix-keybytes.png');
  return embed;
}


export function makeDeliveryMessage(result) {
  const status = String(result.status || 'UNKNOWN');
  const kit = displayKitName({ displayName: result.kitDisplayName || result.kit, name: result.kit || 'Kit' });
  const player = normalizeVisibleText(result.player || 'jogador');
  const mention = result.userId ? '<@' + result.userId + '> ' : '';
  if (status === 'KIT_DELIVERED') {
    return mention + '✅ Kit **' + kit + '** entregue para **' + player + '** no Minecraft.';
  }
  if (status === 'KIT_PENDING') {
    return mention + (result.pendingReason === 'offline'
      ? '🕒 O kit **' + kit + '** foi reservado. Ele será entregue quando **' + player + '** entrar no servidor.'
      : '🕒 O kit **' + kit + '** ficou guardado. Libere um espaço no inventário e use /dk claim para receber.');
  }
  const detail = normalizeVisibleText(result.message || 'A equipe precisa verificar a integração e o servidor.');
  return mention + '⚠️ Não foi possível entregar **' + kit + '** para **' + player + '**. ' + detail + ' (status: ' + status + ').';
}

export function makeDeliveryEmbed(result) {
  const status = String(result.status || 'UNKNOWN');
  const delivered = status === 'KIT_DELIVERED';
  const pending = status === 'KIT_PENDING';
  const offlinePending = pending && result.pendingReason === 'offline';
  return new EmbedBuilder()
    .setColor(delivered ? 0x3BA55D : pending ? 0xD4A72C : 0xD45B5B)
    .setTitle(
      delivered ? 'Kit entregue no Minecraft'
        : offlinePending ? 'Kit reservado até o jogador entrar'
          : pending ? 'Kit guardado para retirada'
            : 'Resultado da entrega'
    )
    .setDescription(
      String(result.message || (delivered
        ? 'O plugin confirmou a entrega do kit.'
        : pending
          ? 'O plugin guardou o kit completo como pendente.'
          : 'O plugin não confirmou a entrega. Confira o resultado e tente novamente quando necessário.')) +
      (delivered
        ? '\n\nO kit foi entregue dentro de uma Shulker Box.'
        : offlinePending
          ? '\n\nO servidor tentará entregar automaticamente quando o jogador entrar.'
          : pending
            ? '\n\nO jogador deve liberar espaço no inventário e usar /dk claim para receber a Shulker Box.'
            : '')
    )
    .addFields(
      { name: 'Jogador', value: String(result.player || '—'), inline: true },
      { name: 'Kit', value: String(result.kit || '—'), inline: true },
      { name: 'Plataforma', value: result.platform === 'bedrock' ? 'Bedrock' : result.platform === 'java' ? 'Java' : '—', inline: true },
      { name: 'Status', value: status, inline: true }
    )
    .setTimestamp();
}

export function makeDeliveryRetryControls(mode = 'same') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('delivery:retry:' + mode)
      .setLabel(mode === 'new' ? 'Criar nova tentativa' : 'Tentar novamente')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Fechar')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function makeDeliveryPlatformControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('delivery:set-platform:java')
      .setLabel('Definir Java')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('delivery:set-platform:bedrock')
      .setLabel('Definir Bedrock')
      .setStyle(ButtonStyle.Success)
  );
}

export function makeOrderControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Fechar')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('order:approve')
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('order:reject')
      .setLabel('Recusar')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('pix:copy')
      .setLabel('Copiar chave Pix')
      .setStyle(ButtonStyle.Primary)
  );
}

export function makeCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Fechar')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function makeChannelLinkRow(channel) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Ir para o canal')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.com/channels/' + channel.guild.id + '/' + channel.id)
  );
}

export function makeOrderLogEmbed({ ticket, decision, staffUser }) {
  const closed = decision === 'closed_without_result';
  const approved = decision === 'approved';
  return new EmbedBuilder()
    .setColor(closed ? 0xD49B42 : approved ? 0x3BA55D : 0xD45B5B)
    .setTitle(closed ? 'Pedido fechado sem resultado' : approved ? 'Pedido confirmado' : 'Pedido recusado')
    .addFields(
      { name: 'Cliente', value: '<@' + ticket.userId + '>', inline: true },
      { name: 'Kit', value: String(ticket.kitName || '—'), inline: true },
      { name: 'Valor', value: String(ticket.kitPrice || '—'), inline: true },
      { name: 'Nick Minecraft', value: String(ticket.minecraftNick || '—'), inline: true },
      { name: 'Edição', value: 'Bedrock', inline: true },
      { name: closed ? 'Fechado por' : 'Responsável', value: String(staffUser), inline: true },
      { name: 'Canal do pedido', value: '<#' + ticket.channelId + '>', inline: true }
    )
    .setTimestamp();
}

export function makeBuyerAnnouncement(ticket) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Compra confirmada')
    .setDescription(
      '<@' + ticket.userId + '> comprou **' + displayKitName({ displayName: ticket.kitDisplayName, name: ticket.kitName || 'Kit' }) + '**.'
    )
    .addFields(
      { name: 'Valor', value: String(ticket.kitPrice || '—'), inline: true },
      { name: 'Nick', value: String(ticket.minecraftNick || '—'), inline: true },
      { name: 'Edição', value: 'Bedrock', inline: true }
    )
    .setTimestamp();
  return embed;
}

export function makeKitWizardEmbed(wizard) {
  const complete = [wizard.name, wizard.price, wizard.description].filter(Boolean).length;
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Novo kit')
    .setDescription('Cadastre o identificador do plugin, o preço, a descrição e, se tiver, uma imagem comercial.')
    .addFields(
      { name: 'Nome exato no plugin', value: wizard.name || 'Pendente', inline: true },
      { name: 'Preço', value: wizard.price || 'Pendente', inline: true },
      { name: 'Descrição', value: wizard.description || 'Pendente', inline: false },
      { name: 'Imagem', value: wizard.imageUrl ? 'Imagem configurada' : 'Sem imagem (opcional)', inline: false },
      { name: 'Progresso', value: complete + '/3 etapas', inline: false }
    );
  const image = safeImageUrl(wizard.imageUrl);
  if (image) embed.setImage(image);
  return embed;
}

export function makeWizardButton(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
