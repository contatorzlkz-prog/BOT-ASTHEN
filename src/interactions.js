import {
  ActionRowBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionsBitField
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import {
  addKit, getGuildConfig, getTicket, removeKit, updateGuildConfig, updateTicket
} from './store.js';
import {
  makeCloseRow, makeDecisionEmbed, makeKitSelect, makeMissingPixEmbed,
  makeOrderEmbed, makeOrderRow, makePixEmbed, makeShopPanel, makeSupportPanel,
  makeSupportTicketEmbed
} from './ui.js';
import { createPrivateTicket, formatTicketTranscript } from './tickets.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isStaff(interaction, config = getGuildConfig(interaction.guildId)) {
  const perms = interaction.memberPermissions;
  if (perms?.has(PermissionsBitField.Flags.Administrator)) return true;
  if (perms?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (perms?.has(PermissionsBitField.Flags.ManageChannels)) return true;
  return Boolean(config.staffRoleId && interaction.member?.roles?.cache?.has(config.staffRoleId));
}

function replyPrivate(interaction, content) {
  const payload = { content, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

function channelLabel(guild, channelId) {
  if (!channelId) return 'Não definido';
  return guild.channels.cache.get(channelId)?.name ?? 'Canal não encontrado';
}

async function handleCommand(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, 'Use os comandos da Asthen dentro de um servidor.');
  const config = getGuildConfig(interaction.guildId);
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  if (!isStaff(interaction, config)) {
    return replyPrivate(interaction, 'Você não tem permissão para configurar a Asthen.');
  }

  if (subcommand === 'cargo-admin') {
    const allowed = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
      || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);
    if (!allowed) return replyPrivate(interaction, 'Somente quem tem Gerenciar servidor ou Administrador pode definir o cargo da equipe.');
    const role = interaction.options.getRole('cargo', true);
    updateGuildConfig(interaction.guildId, { staffRoleId: role.id });
    return replyPrivate(interaction, 'Cargo da equipe definido: ' + role.toString());
  }

  if (group === 'painel') {
    const channel = interaction.options.getChannel('canal', true);
    const isShop = subcommand === 'loja';
    const payload = isShop ? makeShopPanel(config.kits.length) : makeSupportPanel();
    const message = await channel.send(payload);
    const key = isShop ? 'shopPanelChannelId' : 'supportPanelChannelId';
    updateGuildConfig(interaction.guildId, { [key]: channel.id });
    return replyPrivate(interaction, 'Painel ' + (isShop ? 'da loja' : 'de suporte') + ' publicado em ' + channel.toString() + '. Mensagem: ' + message.url);
  }

  if (group === 'categoria') {
    const channel = interaction.options.getChannel('canal', true);
    const key = subcommand === 'loja' ? 'shopCategoryId' : 'supportCategoryId';
    updateGuildConfig(interaction.guildId, { [key]: channel.id });
    return replyPrivate(interaction, 'Categoria de ' + subcommand + ' definida: **' + channel.name + '**.');
  }

  if (group === 'kit') {
    if (subcommand === 'adicionar') {
      const current = getGuildConfig(interaction.guildId);
      if (current.kits.length >= 25) {
        return replyPrivate(interaction, 'O catálogo atingiu o limite de 25 kits. Remova um kit antes de adicionar outro.');
      }
      const name = interaction.options.getString('nome', true).trim();
      const price = interaction.options.getString('preco', true).trim();
      const description = interaction.options.getString('descricao', true).trim();
      if (current.kits.some(kit => kit.name.toLowerCase() === name.toLowerCase())) {
        return replyPrivate(interaction, 'Já existe um kit com esse nome. Use outro nome ou remova o cadastro anterior.');
      }
      addKit(interaction.guildId, { id: randomUUID().slice(0, 8), name, price, description });
      return replyPrivate(interaction, 'Kit **' + name + '** adicionado por **' + price + '**. Atualize o painel da loja para refletir o catálogo.');
    }
    const name = interaction.options.getString('nome', true).trim().toLowerCase();
    const current = getGuildConfig(interaction.guildId);
    const kit = current.kits.find(item => item.name.toLowerCase() === name);
    if (!kit) return replyPrivate(interaction, 'Não encontrei um kit com esse nome.');
    removeKit(interaction.guildId, kit.id);
    return replyPrivate(interaction, 'Kit **' + kit.name + '** removido do catálogo.');
  }

  if (subcommand === 'pix') {
    const pixKey = interaction.options.getString('chave', true).trim();
    const pixInstructions = interaction.options.getString('instrucoes')?.trim() ?? '';
    updateGuildConfig(interaction.guildId, { pixKey, pixInstructions });
    return replyPrivate(interaction, 'Chave Pix salva. Ela será exibida somente dentro dos novos canais privados de pedido.');
  }

  if (subcommand === 'logs') {
    const channel = interaction.options.getChannel('canal', true);
    updateGuildConfig(interaction.guildId, { logChannelId: channel.id });
    return replyPrivate(interaction, 'Canal de transcrições definido: ' + channel.toString());
  }

  if (subcommand === 'status') {
    const current = getGuildConfig(interaction.guildId);
    const lines = [
      '**ASTHEN / STATUS DA CONFIGURAÇÃO**',
      'Painel suporte: **' + channelLabel(interaction.guild, current.supportPanelChannelId) + '**',
      'Painel loja: **' + channelLabel(interaction.guild, current.shopPanelChannelId) + '**',
      'Categoria suporte: **' + channelLabel(interaction.guild, current.supportCategoryId) + '**',
      'Categoria loja: **' + channelLabel(interaction.guild, current.shopCategoryId) + '**',
      'Cargo da equipe: ' + (current.staffRoleId ? '<@&' + current.staffRoleId + '>' : '**Não definido**'),
      'Pix: **' + (current.pixKey ? 'Configurado' : 'Não configurado') + '**',
      'Kits cadastrados: **' + current.kits.length + '/25**',
      'Canal de logs: **' + channelLabel(interaction.guild, current.logChannelId) + '**'
    ];
    return replyPrivate(interaction, lines.join('\n'));
  }

  if (subcommand === 'ajuda') {
    return replyPrivate(interaction, [
      '**ASTHEN / CONFIGURAÇÃO INICIAL**',
      '/asthen cargo-admin — define o cargo da equipe.',
      '/asthen categoria suporte e /asthen categoria loja — definem onde os canais privados serão criados.',
      '/asthen pix — cadastra a chave e as instruções.',
      '/asthen kit adicionar — cadastra os kits da loja (até 25).',
      '/asthen painel suporte e /asthen painel loja — publicam os painéis.',
      '/asthen logs — configura transcrições opcionais.',
      '/asthen status — confere a configuração atual.',
      '',
      'O bot não confirma Pix nem entrega itens no jogo. A equipe confere o comprovante e realiza a entrega manualmente.'
    ].join('\n'));
  }
}

async function openSupportTicket(interaction) {
  const kind = interaction.values[0];
  await interaction.deferReply({ ephemeral: true });
  const result = await createPrivateTicket({
    guild: interaction.guild,
    user: interaction.user,
    type: kind
  });
  if (result.alreadyOpen) {
    return interaction.editReply('Você já tem um ticket aberto: ' + result.channel.toString() + '. Continue por lá ou feche o atendimento antes de abrir outro.');
  }
  const config = getGuildConfig(interaction.guildId);
  await result.channel.send({
    content: interaction.user.toString() + (config.staffRoleId ? ' <@&' + config.staffRoleId + '>' : ''),
    embeds: [makeSupportTicketEmbed(kind, interaction.user)],
    components: [makeCloseRow()],
    allowedMentions: {
      users: [interaction.user.id],
      roles: config.staffRoleId ? [config.staffRoleId] : []
    }
  });
  return interaction.editReply('Seu ticket foi criado: ' + result.channel.toString());
}

async function openShopMenu(interaction) {
  const config = getGuildConfig(interaction.guildId);
  if (!config.kits.length) {
    return replyPrivate(interaction, 'A loja ainda não tem kits cadastrados. A equipe pode adicionar kits usando /asthen kit adicionar.');
  }
  return interaction.reply({
    content: '**ASTHEN / SELECIONE SEU KIT**\nEscolha uma opção para continuar com o pedido.',
    components: makeKitSelect(config.kits),
    ephemeral: true
  });
}

async function showNicknameModal(interaction) {
  const kitId = interaction.values[0];
  const kit = getGuildConfig(interaction.guildId).kits.find(item => item.id === kitId);
  if (!kit) return replyPrivate(interaction, 'Esse kit não está mais disponível. Abra a loja novamente para atualizar a lista.');

  const modal = new ModalBuilder()
    .setCustomId('shop:nick:' + kit.id)
    .setTitle('Finalizar pedido');
  const nicknameInput = new TextInputBuilder()
    .setCustomId('nickname')
    .setLabel('Seu nick no servidor')
    .setPlaceholder('Digite seu nick exatamente como aparece no jogo')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(32)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(nicknameInput));
  return interaction.showModal(modal);
}

async function submitShopOrder(interaction) {
  const kitId = interaction.customId.split(':')[2];
  const config = getGuildConfig(interaction.guildId);
  const kit = config.kits.find(item => item.id === kitId);
  if (!kit) return replyPrivate(interaction, 'Esse kit não está mais disponível. Abra a loja novamente para escolher outro.');
  const nickname = interaction.fields.getTextInputValue('nickname').trim();
  if (nickname.length < 2 || nickname.length > 32) {
    return replyPrivate(interaction, 'O nick precisa ter entre 2 e 32 caracteres.');
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await createPrivateTicket({
    guild: interaction.guild,
    user: interaction.user,
    type: 'shop',
    kit,
    nickname
  });
  if (result.alreadyOpen) {
    return interaction.editReply('Você já tem um ticket aberto: ' + result.channel.toString() + '. Termine ou feche o atendimento atual antes de abrir outro.');
  }

  const orderCode = result.channel.id.slice(-6).toUpperCase();
  const staffMention = config.staffRoleId ? '<@&' + config.staffRoleId + '>' : '';
  const embeds = [makeOrderEmbed({ user: interaction.user, kit, nickname, orderCode })];
  embeds.push(config.pixKey ? makePixEmbed(config) : makeMissingPixEmbed());
  await result.channel.send({
    content: interaction.user.toString() + ' ' + staffMention,
    embeds,
    components: [makeOrderRow()],
    allowedMentions: {
      users: [interaction.user.id],
      roles: config.staffRoleId ? [config.staffRoleId] : []
    }
  });
  await result.channel.send({
    content: '**COMPROVANTE**\nDepois de realizar o pagamento, envie o comprovante como imagem ou arquivo neste canal e aguarde um administrador. Não envie dados sensíveis além do comprovante necessário.'
  });
  return interaction.editReply('Pedido criado com sucesso: ' + result.channel.toString() + '. Envie o comprovante no canal privado e aguarde a equipe.');
}

async function decideOrder(interaction, approved) {
  const config = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction, config)) {
    return replyPrivate(interaction, 'Somente a equipe configurada pode analisar pedidos.');
  }
  const ticket = getTicket(interaction.channelId);
  if (!ticket || ticket.type !== 'shop') {
    return replyPrivate(interaction, 'Este canal não está registrado como pedido da loja.');
  }
  if (ticket.status !== 'open') {
    return replyPrivate(interaction, 'Este pedido já foi analisado ou encerrado.');
  }

  updateTicket(interaction.channelId, {
    status: approved ? 'approved' : 'rejected',
    reviewedBy: interaction.user.id,
    reviewedAt: new Date().toISOString()
  });
  await interaction.message.edit({ components: [makeOrderRow(true)] });
  await interaction.channel.send({
    embeds: [makeDecisionEmbed(approved, interaction.user.tag ?? interaction.user.username)]
  });
  return replyPrivate(interaction, approved
    ? 'Pedido autorizado. A equipe ainda precisa entregar o kit manualmente no servidor.'
    : 'Pedido marcado como não autorizado. O cliente poderá conversar com a equipe neste canal.');
}

async function closeTicket(interaction) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyPrivate(interaction, 'Este canal não está registrado como ticket Asthen.');
  const config = getGuildConfig(interaction.guildId);
  const isOwner = interaction.user.id === ticket.userId;
  if (!isOwner && !isStaff(interaction, config)) {
    return replyPrivate(interaction, 'Somente quem abriu o ticket ou a equipe pode fechar este canal.');
  }
  if (ticket.status === 'closed') return replyPrivate(interaction, 'Este ticket já está sendo encerrado.');

  await interaction.reply({ content: 'Este canal será removido automaticamente em 5 segundos.', ephemeral: true });
  await interaction.channel.send('🔒 Ticket fechado por ' + interaction.user.toString() + '. O canal será apagado em 5 segundos.');
  updateTicket(interaction.channelId, {
    status: 'closed',
    closedBy: interaction.user.id,
    closedAt: new Date().toISOString()
  });

  if (config.logChannelId) {
    try {
      const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
      if (logChannel?.isTextBased()) {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = formatTicketTranscript(messages, ticket);
        const attachment = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
          name: 'ticket-' + interaction.channelId + '.txt'
        });
        await logChannel.send({
          content: 'Transcrição do ticket **' + interaction.channel.name + '** fechado por ' + interaction.user.toString() + '.',
          files: [attachment]
        });
      }
    } catch (error) {
      console.error('[Asthen] Falha ao enviar transcrição:', error);
    }
  }

  await sleep(5000);
  await interaction.channel.delete('Ticket fechado por ' + (interaction.user.tag ?? interaction.user.username));
}

export async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'asthen') {
    return handleCommand(interaction);
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'support:open') return openSupportTicket(interaction);
    if (interaction.customId === 'shop:kit') return showNicknameModal(interaction);
  }
  if (interaction.isButton()) {
    if (interaction.customId === 'shop:open') return openShopMenu(interaction);
    if (interaction.customId === 'order:approve') return decideOrder(interaction, true);
    if (interaction.customId === 'order:reject') return decideOrder(interaction, false);
    if (interaction.customId === 'ticket:close') return closeTicket(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('shop:nick:')) {
    return submitShopOrder(interaction);
  }
}
