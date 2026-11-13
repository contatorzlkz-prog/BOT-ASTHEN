import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder
} from 'discord.js';

export let BRAND_NAME = 'ASTHEN';
export let BRAND_COLOR = 0x29263D;
export const VERSION = '1.1.0';

export function configureBrand({ name, color } = {}) {
  const safeName = String(name ?? '').trim().slice(0, 32);
  if (safeName) BRAND_NAME = safeName;
  const normalizedColor = String(color ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(normalizedColor)) BRAND_COLOR = Number.parseInt(normalizedColor, 16);
}

export function makeSupportPanel() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(BRAND_NAME + ' / CENTRAL DE ATENDIMENTO')
    .setDescription('Precisa de ajuda com o servidor? Selecione abaixo o assunto do atendimento.\n\nCada solicitação abre um **canal privado** entre você e a equipe.\nExplique o ocorrido com detalhes e, quando necessário, envie imagens ou vídeos.')
    .addFields(
      { name: 'Reportar bug', value: 'Problemas, erros ou falhas no servidor.', inline: true },
      { name: 'Reportar hack', value: 'Denúncias de trapaça ou comportamento suspeito.', inline: true },
      { name: 'Dúvida / suporte', value: 'Perguntas e outros assuntos.', inline: true }
    )
    .setFooter({ text: BRAND_NAME + ' • Central de tickets • v' + VERSION });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('support:open')
    .setPlaceholder('Selecione o tipo de atendimento')
    .addOptions(
      { label: 'Reportar bug', value: 'bug', description: 'Informar um erro no servidor.', emoji: '🛠️' },
      { label: 'Reportar hack', value: 'hack', description: 'Enviar uma denúncia para a equipe.', emoji: '🛡️' },
      { label: 'Dúvida', value: 'duvida', description: 'Tirar uma dúvida.', emoji: '❔' },
      { label: 'Suporte geral', value: 'geral', description: 'Outro tipo de atendimento.', emoji: '💬' }
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

export function makeShopPanel(kitCount) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(BRAND_NAME + ' / LOJA DE KITS')
    .setDescription('Escolha seu kit e envie o pedido diretamente para a equipe.\n\n1. Clique em **Ver kits** e selecione o produto.\n2. Informe seu nick no servidor e confirme.\n3. O bot abrirá um canal privado com os dados do pedido e as instruções Pix.\n4. Envie o comprovante no próprio canal e aguarde a análise.')
    .addFields({ name: 'Catálogo', value: kitCount + ' ' + (kitCount === 1 ? 'kit disponível' : 'kits disponíveis'), inline: true })
    .setFooter({ text: BRAND_NAME + ' • Loja de kits • v' + VERSION });
  const button = new ButtonBuilder().setCustomId('shop:open').setLabel('Ver kits').setEmoji('🛒').setStyle(ButtonStyle.Secondary);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

export function makeKitSelect(kits) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:kit')
    .setPlaceholder('Escolha o kit que deseja comprar')
    .addOptions(kits.slice(0, 25).map(kit => ({
      label: kit.name.slice(0, 100),
      value: kit.id,
      description: (kit.price + ' • ' + kit.description).slice(0, 100)
    })));
  return [new ActionRowBuilder().addComponents(menu)];
}

export function makeCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Fechar canal').setEmoji('🔒').setStyle(ButtonStyle.Secondary)
  );
}

export function makeOrderRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('order:approve').setLabel('Autorizar').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('order:reject').setLabel('Não autorizar').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Fechar canal').setEmoji('🔒').setStyle(ButtonStyle.Secondary)
  );
}

export function makeSupportTicketEmbed(kind, user) {
  const labels = { bug: 'Reporte de bug', hack: 'Denúncia de hack', duvida: 'Dúvida', geral: 'Suporte geral' };
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(BRAND_NAME + ' / ' + (labels[kind] ?? 'Suporte'))
    .setDescription('Olá, ' + user + '. Seu atendimento foi aberto.\n\nDescreva o que aconteceu e aguarde um membro da equipe.\nVocê também pode anexar imagens ou vídeos para ajudar na análise.')
    .setFooter({ text: 'Ticket de suporte • ' + VERSION })
    .setTimestamp();
}

export function makeOrderEmbed({ user, kit, nickname, orderCode }) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(BRAND_NAME + ' / NOVO PEDIDO')
    .setDescription('Pedido registrado. Confira os dados e siga as instruções abaixo.')
    .addFields(
      { name: 'Pedido', value: String(orderCode), inline: true },
      { name: 'Cliente', value: String(user), inline: true },
      { name: 'Nick no servidor', value: nickname, inline: true },
      { name: 'Kit', value: kit.name, inline: true },
      { name: 'Valor', value: kit.price, inline: true },
      { name: 'Descrição', value: kit.description, inline: false }
    )
    .setFooter({ text: 'Aguardando análise da equipe • ' + VERSION })
    .setTimestamp();
}

export function makePixEmbed(config) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(BRAND_NAME + ' / PAGAMENTO PIX')
    .setDescription('Use os dados abaixo para realizar o pagamento do pedido.\n\n**Chave Pix**\n' + config.pixKey + '\n\n' + (config.pixInstructions || 'Após o pagamento, envie o comprovante como anexo neste canal e aguarde um administrador.'))
    .addFields({ name: 'Próximo passo', value: 'Envie o comprovante neste canal. A equipe vai conferir o pagamento e responder por aqui.' });
}

export function makeMissingPixEmbed() {
  return new EmbedBuilder().setColor(0xA16D32)
    .setTitle(BRAND_NAME + ' / PIX AINDA NÃO CONFIGURADO')
    .setDescription('A equipe ainda não cadastrou os dados Pix. **Não faça nenhum pagamento** até receber as instruções oficiais neste canal.');
}

export function makeDecisionEmbed(approved, staffTag) {
  return new EmbedBuilder()
    .setColor(approved ? 0x477A5B : 0x8B4545)
    .setTitle(BRAND_NAME + ' / ' + (approved ? 'PEDIDO AUTORIZADO' : 'PEDIDO NÃO AUTORIZADO'))
    .setDescription(approved
      ? 'Pedido aprovado por ' + staffTag + '. A equipe deve realizar a entrega do kit no servidor e confirmar com o cliente.'
      : 'Pedido não autorizado por ' + staffTag + '. Converse com a equipe neste canal para entender a decisão.')
    .setTimestamp();
}
