import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { CONFIG, hexToInt } from './config.js';

const brandColor = () => hexToInt(CONFIG.brand.color);

const supportButtonStyles = {
  bug: ButtonStyle.Secondary,
  hack: ButtonStyle.Danger,
  duvida: ButtonStyle.Primary,
  geral: ButtonStyle.Success
};

const supportTitles = {
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
      'Precisa de ajuda? Escolha abaixo o assunto que melhor descreve o que aconteceu. ' +
      'O bot abrirá um canal privado, visível somente para você e para a equipe autorizada.\n\n' +
      'Para agilizar o atendimento, explique a situação com detalhes e envie imagens ou vídeos quando forem úteis. ' +
      'A equipe responderá dentro do próprio canal; não é necessário abrir vários tickets para o mesmo assunto.'
    );

  const buttons = Object.entries(supportTitles).map(([kind, label]) =>
    new ButtonBuilder()
      .setCustomId('support:open:' + kind)
      .setLabel(label)
      .setStyle(supportButtonStyles[kind])
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
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

export function makeSupportTicketEmbed(kind, user) {
  const descriptions = CONFIG.support.descriptions;
  return new EmbedBuilder()
    .setColor(supportColor(kind))
    .setTitle(supportTitles[kind] || 'Atendimento')
    .setDescription(
      descriptions[kind] +
      '\n\n**Como continuar:** envie as informações neste canal e aguarde a equipe. ' +
      'Este atendimento é privado. Não compartilhe senhas, tokens ou dados de pagamento.'
    )
    .addFields({ name: 'Responsável', value: String(user), inline: true })
    .setTimestamp();
}

export function makePurchaseReviewEmbed(draft) {
  return new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Revise seu pedido')
    .setDescription(CONFIG.shop.reviewDescription)
    .addFields(
      { name: 'Kit escolhido', value: draft.kit.name, inline: true },
      { name: 'Valor', value: draft.kit.price, inline: true },
      { name: 'Nick do Minecraft', value: draft.minecraftNick, inline: true },
      { name: 'O que está incluído', value: String(draft.kit.description || 'Consulte a equipe.'), inline: false }
    );
}

export function makePurchaseReviewControls(draft) {
  const revision = String(draft.revision || '0');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop:confirm:' + revision)
      .setLabel('Confirmar e ir para pagamento')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('shop:edit-nick:' + revision)
      .setLabel('Editar nick')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('shop:cancel:' + revision)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
}

export function makeOrderEmbed({ user, kit, minecraftNick, orderCode }) {
  return new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Pedido de compra')
    .setDescription(
      'Seu pedido foi aberto. Confira os dados antes de realizar o pagamento. ' +
      'Depois de pagar, envie o comprovante neste canal para a equipe conferir. ' +
      'A aprovação será feita manualmente após a análise.'
    )
    .addFields(
      { name: 'Pedido', value: orderCode, inline: true },
      { name: 'Cliente', value: String(user), inline: true },
      { name: 'Kit', value: kit.name, inline: true },
      { name: 'Valor', value: kit.price, inline: true },
      { name: 'Nick do Minecraft', value: minecraftNick, inline: true },
      { name: 'Conteúdo do kit', value: String(kit.description || 'Consulte a equipe.'), inline: false },
      { name: 'Comprovante', value: CONFIG.order.receiptInstructions, inline: false }
    )
    .setTimestamp();
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
  return new EmbedBuilder()
    .setColor(brandColor())
    .setTitle('Novo kit')
    .setDescription('Cadastro em etapas. Preencha os três campos e salve.')
    .addFields(
      { name: 'Nome', value: wizard.name || 'Pendente', inline: true },
      { name: 'Preço', value: wizard.price || 'Pendente', inline: true },
      { name: 'Descrição', value: wizard.description || 'Pendente', inline: false },
      { name: 'Progresso', value: complete + '/3 etapas', inline: false }
    );
}

export function makeWizardButton(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
