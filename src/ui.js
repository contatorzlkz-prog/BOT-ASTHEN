import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { CONFIG, fmt, hexToInt } from './config.js';

const color = () => hexToInt(CONFIG.brand.color);
const statusColor = key => hexToInt(CONFIG.statusColors[key], color());

export function makeSupportPanel() {
  const embed = new EmbedBuilder()
    .setColor(color())
    .setTitle(CONFIG.text.supportPanel.title)
    .setDescription(CONFIG.text.supportPanel.description);

  const buttons = [
    ['bug', 'Reportar bug', '🛠️'],
    ['hack', 'Reportar hack', '🛡️'],
    ['duvida', 'Dúvida', '❔'],
    ['geral', 'Outro assunto', '💬']
  ].map(([kind, label, emoji]) => new ButtonBuilder()
    .setCustomId(`support:open:${kind}`)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(ButtonStyle.Primary));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
}

export function makeShopPanel(kits = []) {
  const embed = new EmbedBuilder()
    .setColor(color())
    .setTitle(CONFIG.text.shopPanel.title)
    .setDescription(kits.length ? CONFIG.text.shopPanel.description : CONFIG.text.shopPanel.empty);

  const rows = [];
  const buttons = kits.slice(0, CONFIG.shop.maxKits).map(kit => new ButtonBuilder()
    .setCustomId(`shop:buy:${kit.id}`)
    .setLabel(`Comprar · ${kit.name}`.slice(0, 80))
    .setEmoji('🛒')
    .setStyle(ButtonStyle.Success));

  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }

  return { embeds: [embed], components: rows };
}

export function makeCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel(CONFIG.text.closeButton)
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function makeChannelLinkRow(channel) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Ir para o canal')
      .setEmoji('↗️')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${channel.guild.id}/${channel.id}`)
  );
}

export function makeSupportTicketEmbed(kind, user) {
  const titles = {
    bug: 'Reporte de bug',
    hack: 'Denúncia de hack',
    duvida: 'Dúvida',
    geral: 'Atendimento geral'
  };
  return new EmbedBuilder()
    .setColor(color())
    .setTitle(titles[kind] ?? 'Atendimento')
    .setDescription(fmt(CONFIG.text.supportTicket.description, { user: String(user) }))
    .setTimestamp();
}

export function makeOrderEmbed({ user, kit, orderCode }) {
  return new EmbedBuilder()
    .setColor(color())
    .setTitle(fmt(CONFIG.text.order.title, { kit: kit.name }))
    .setDescription(fmt(CONFIG.text.order.description, { user: String(user) }))
    .addFields(
      { name: 'Pedido', value: orderCode, inline: true },
      { name: 'Cliente', value: String(user), inline: true },
      { name: 'Kit', value: kit.name, inline: true },
      { name: 'Valor', value: kit.price, inline: true },
      { name: 'Detalhes', value: kit.description || '—', inline: false },
      { name: 'Comprovante', value: 'Anexe a imagem ou o arquivo do comprovante aqui.', inline: false }
    )
    .setTimestamp();
}

export function makePixEmbed(config) {
  const embed = new EmbedBuilder()
    .setColor(statusColor('success'))
    .setTitle(CONFIG.text.pix.title)
    .addFields({ name: 'Chave Pix', value: config.pixKey });

  if (config.pixInstructions) {
    embed.addFields({ name: 'Instruções', value: config.pixInstructions });
  }
  return embed;
}

export function makeMissingPixEmbed() {
  return new EmbedBuilder()
    .setColor(statusColor('warning'))
    .setTitle(CONFIG.text.pix.missingTitle)
    .setDescription(CONFIG.text.pix.missingDescription);
}

export function makeKitWizardEmbed(wizard) {
  const complete = [wizard.name, wizard.price, wizard.description].filter(Boolean).length;
  const embed = new EmbedBuilder()
    .setColor(color())
    .setTitle('Novo kit')
    .setDescription('Cadastro em etapas. Preencha os três campos e salve.')
    .addFields(
      { name: 'Nome', value: wizard.name || 'Pendente', inline: true },
      { name: 'Preço', value: wizard.price || 'Pendente', inline: true },
      { name: 'Descrição', value: wizard.description || 'Pendente', inline: false },
      { name: 'Progresso', value: `${complete}/3 etapas`, inline: false }
    );
  return embed;
}

export function makeWizardButton(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
