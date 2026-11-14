import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { CONFIG, hexToInt } from './config.js';

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
    label: 'Dúvidas & Compras',
    description: 'Informações sobre produtos, pedidos e pagamentos.',
    emoji: '🛒'
  },
  {
    value: 'licencas',
    label: 'Licenças & Suporte',
    description: 'Ajuda técnica, configuração e ativação.',
    emoji: '🔑'
  },
  {
    value: 'bugs',
    label: 'Reportar Bugs',
    description: 'Envie logs, imagens e detalhes sobre falhas.',
    emoji: '🐛'
  },
  {
    value: 'parcerias',
    label: 'Parcerias & Comercial',
    description: 'Propostas comerciais e parcerias.',
    emoji: '🤝'
  },
  {
    value: 'marketing',
    label: 'Marketing & Serviços',
    description: 'Contratação de serviços e orçamentos.',
    emoji: '📣'
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
        : 'A loja ainda não possui kits disponíveis. A equipe precisa cadastrar os produtos antes de receber pedidos.'
    );

  const button = new ButtonBuilder()
    .setCustomId('shop:catalog')
    .setLabel(kits.length ? 'Abrir catálogo' : 'Catálogo indisponível')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(kits.length === 0);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

export function makeCatalogMenu(kits = []) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Selecione o kit que deseja comprar')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(kits.slice(0, CONFIG.shop.maxKits).map(kit => ({
      label: String(kit.name).slice(0, 100),
      description: (String(kit.price) + ' · ' + String(kit.description || 'Kit disponível para compra')).slice(0, 100),
      value: String(kit.id)
    })));
  return new ActionRowBuilder().addComponents(menu);
}

export function makeKitPreviewEmbed(kit) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Prévia do kit: ' + String(kit.name))
    .setDescription(String(kit.description || 'Este kit não possui uma descrição cadastrada.'))
    .addFields(
      { name: 'Preço', value: String(kit.price || 'A consultar'), inline: true },
      { name: 'Identificador no Minecraft', value: '`' + String(kit.name) + '`', inline: true }
    );
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
      (descriptions[kind] || descriptions.geral || 'Descreva o assunto para a equipe.') +
      '\n\n**Como continuar:** envie as informações neste canal e aguarde a equipe. ' +
      'Este atendimento é privado. Não compartilhe senhas, tokens ou dados de pagamento.'
    )
    .addFields({ name: 'Responsável', value: String(user), inline: true })
    .setTimestamp();
}

export function makePurchaseReviewEmbed(draft) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Revise seu pedido')
    .setDescription(CONFIG.shop.reviewDescription)
    .addFields(
      { name: 'Kit escolhido', value: String(draft.kit.name), inline: true },
      { name: 'Valor', value: String(draft.kit.price), inline: true },
      { name: 'Nick do Minecraft Java', value: String(draft.minecraftNick), inline: true },
      { name: 'O que está incluído', value: String(draft.kit.description || 'Consulte a equipe.'), inline: false }
    );
  const image = safeImageUrl(draft.kit.imageUrl);
  if (image) embed.setImage(image);
  return embed;
}

export function makePurchaseReviewControls(draft) {
  const revision = String(draft.revision || '0');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop:confirm:' + revision)
      .setLabel('Confirmar pedido')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('shop:switch-kit:' + revision)
      .setLabel('Trocar kit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('shop:edit-nick:' + revision)
      .setLabel('Editar nick')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('shop:cancel:' + revision)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
}

export function makeOrderEmbed({ user, kit, minecraftNick, orderCode }) {
  const embed = new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Pedido de compra · ' + String(kit.name))
    .setDescription(
      'Seu pedido foi aberto. Confira a prévia do kit abaixo. ' +
      'Faça o pagamento usando os dados deste canal e envie o comprovante para a equipe conferir. ' +
      'A entrega no Minecraft só será solicitada depois da confirmação manual do pagamento.'
    )
    .addFields(
      { name: 'Pedido', value: orderCode, inline: true },
      { name: 'Cliente', value: String(user), inline: true },
      { name: 'Kit', value: String(kit.name), inline: true },
      { name: 'Valor', value: String(kit.price), inline: true },
      { name: 'Nick do Minecraft Java', value: String(minecraftNick), inline: true },
      { name: 'Conteúdo do kit', value: String(kit.description || 'Consulte a equipe.'), inline: false },
      { name: 'Comprovante', value: CONFIG.order.receiptInstructions, inline: false }
    )
    .setTimestamp();
  const image = safeImageUrl(kit.imageUrl);
  if (image) embed.setImage(image);
  return embed;
}

export function makeDeliveryEmbed(result) {
  const status = String(result.status || 'UNKNOWN');
  const delivered = status === 'KIT_DELIVERED';
  const pending = status === 'KIT_PENDING';
  return new EmbedBuilder()
    .setColor(delivered ? 0x3BA55D : pending ? 0xD4A72C : 0xD45B5B)
    .setTitle(delivered ? 'Kit entregue no Minecraft' : pending ? 'Kit guardado para retirada' : 'Resultado da entrega')
    .setDescription(String(result.message || (delivered
      ? 'O plugin confirmou a entrega do kit.'
      : pending
        ? 'O inventário estava cheio. O plugin guardou o kit para o jogador retirar.'
        : 'O plugin não confirmou a entrega. Confira o resultado e tente novamente quando necessário.')))
    .addFields(
      { name: 'Jogador', value: String(result.player || '—'), inline: true },
      { name: 'Kit', value: String(result.kit || '—'), inline: true },
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

export function makePixEmbed(config) {
  const embed = new EmbedBuilder()
    .setColor(0x3BA55D)
    .setTitle('Pagamento via Pix')
    .setDescription('Use a chave abaixo para realizar o pagamento no valor indicado no pedido.')
    .addFields({ name: 'Chave Pix', value: String(config.pixKey).slice(0, 1024) });

  if (config.pixInstructions) {
    embed.addFields({ name: 'Orientações da loja', value: String(config.pixInstructions).slice(0, 1024) });
  }
  return embed;
}

export function makeMissingPixEmbed() {
  return new EmbedBuilder()
    .setColor(0xD45B5B)
    .setTitle('Pagamento ainda não configurado')
    .setDescription(CONFIG.pix.missingDescription);
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
      .setStyle(ButtonStyle.Danger)
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
  const approved = decision === 'approved';
  return new EmbedBuilder()
    .setColor(approved ? 0x3BA55D : 0xD45B5B)
    .setTitle(approved ? 'Pedido confirmado' : 'Pedido recusado')
    .addFields(
      { name: 'Cliente', value: '<@' + ticket.userId + '>', inline: true },
      { name: 'Kit', value: String(ticket.kitName || '—'), inline: true },
      { name: 'Valor', value: String(ticket.kitPrice || '—'), inline: true },
      { name: 'Nick Minecraft', value: String(ticket.minecraftNick || '—'), inline: true },
      { name: 'Responsável', value: String(staffUser), inline: true },
      { name: 'Canal do pedido', value: '<#' + ticket.channelId + '>', inline: true }
    )
    .setTimestamp();
}

export function makeBuyerAnnouncement(ticket) {
  return new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Nova compra confirmada')
    .setDescription(
      '<@' + ticket.userId + '> concluiu a compra de **' + String(ticket.kitName) + '**.\n' +
      'Nick do Minecraft: **' + String(ticket.minecraftNick || '—') + '**.'
    )
    .setTimestamp();
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
