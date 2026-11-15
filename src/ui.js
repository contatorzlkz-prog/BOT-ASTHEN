import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { CONFIG, hexToInt } from './config.js';
import { PIX_KEY_DEFAULT } from './pix.js';

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
      'Precisa de ajuda? Selecione o departamento que melhor combina com o assunto. ' +
      'O bot abrirá um canal privado, visível somente para você e para a equipe autorizada.\\n\\n' +
      'Explique o que aconteceu e envie logs ou imagens quando forem úteis. Escolha apenas uma opção; ' +
      'a equipe continuará o atendimento dentro do próprio canal.'
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('support:select')
    .setPlaceholder('Selecione um departamento para abrir ticket...')
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
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Loja de kits')
    .setDescription(
      kits.length
        ? CONFIG.shop.panelDescription
        : 'A loja ainda não recebeu kits do servidor.'
    );

  const button = new ButtonBuilder()
    .setCustomId('shop:catalog')
    .setLabel(kits.some(canBuyKit) ? 'Escolher kit' : kits.length ? 'Ver catálogo' : 'Loja indisponível')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!kits.length);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}


export function makeCatalogMenu(kits = []) {
  const listed = [...kits]
    .sort((a, b) => Number(canBuyKit(b)) - Number(canBuyKit(a)))
    .slice(0, CONFIG.shop.maxKits);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Selecione um kit')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(listed.map(kit => {
      const hasWeeklyStock = Number.isInteger(kit.weeklyRemaining);
      const soldOut = hasWeeklyStock && kit.weeklyRemaining <= 0;
      const available = canBuyKit(kit);
      const reason = soldOut
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
        label: (soldOut ? 'Esgotado · ' : available ? '' : 'Indisponível · ')
          .concat(displayKitName(kit)).slice(0, 100),
        description: reason.slice(0, 100),
        value: String(kit.id)
      };
    }));
  return new ActionRowBuilder().addComponents(menu);
}

export function makeKitAdminMenu(kits = [], customId = 'kit:admin:select') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Selecione um kit')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(kits.slice(0, 25).map(kit => ({
      label: (canBuyKit(kit) ? '' : 'Indisponível · ').concat(displayKitName(kit)).slice(0, 100),
      description: ((kit.missingFromPlugin ? 'Removido do servidor' : kit.pluginEnabled === false ? 'Desativado no Minecraft' : kit.pluginForSale !== true ? (kit.priceCents ? 'Venda desativada' : 'Sem preço no Minecraft') : String(kit.price || 'À venda')) + ' · ' + String(kit.name)).slice(0, 100),
      value: String(kit.id)
    })));
  return new ActionRowBuilder().addComponents(menu);
}

export function makeKitEditFieldMenu(kit) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('kit:edit-field:' + kit.id)
    .setPlaceholder('O que deseja alterar?')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Nome exibido na loja', description: 'Nome bonito que o cliente verá, sem underscores.', value: 'displayName' },
      { label: 'Descrição', description: 'Texto que aparece na prévia.', value: 'description' },
      { label: 'Imagem', description: 'Link HTTPS da imagem do kit.', value: 'imageUrl' },
      { label: 'Reabrir na loja', description: 'Remove o bloqueio manual; o plugin ainda precisa permitir a venda.', value: 'availability' }
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function makeKitRemoveControls(kitId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('kit:remove:confirm:' + kitId)
      .setLabel('Marcar indisponível')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('kit:remove:cancel')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );
}


export function makeKitPreviewEmbed(kit) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle(displayKitName(kit))
    .setDescription(String(kit.description || 'Descrição em atualização.'))
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
      (descriptions[kind] || descriptions.outros || 'Descreva o assunto para a equipe.') +
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
      { name: 'Nick', value: String(draft.minecraftNick), inline: true },
      { name: 'Plataforma', value: draft.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true }
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
    new ButtonBuilder().setCustomId('shop:edit-nick:' + revision).setLabel('Editar nick').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop:edit-platform:' + revision).setLabel('Editar plataforma').setStyle(ButtonStyle.Primary),
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
      { name: 'Plataforma', value: platform === 'bedrock' ? 'Bedrock' : platform === 'java' ? 'Java' : 'Não informada', inline: true },
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
      { name: 'Plataforma', value: ticket.platform === 'bedrock' ? 'Bedrock' : ticket.platform === 'java' ? 'Java' : 'Não informada', inline: true },
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
      { name: 'Plataforma', value: ticket.platform === 'bedrock' ? 'Bedrock' : ticket.platform === 'java' ? 'Java' : 'Não informada', inline: true }
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
