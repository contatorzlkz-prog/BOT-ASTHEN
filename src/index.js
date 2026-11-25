import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';
import { appendTicketHistory, findTicketByDeliveryRequestId, getGuildConfig, listTickets, loadStore, initializeStoreSync, updateGuildConfig, updateTicket, syncPluginKits } from './store.js';
import { flushSupabaseSync, getNextBrasiliaSundayAt } from './supabase.js';
import { makeDeliveryMessage, makeDeliveryRetryControls, makeShopPanel, makeSupportPanel, PANEL_LAYOUT_VERSION } from './ui.js';
import { handleInteraction, getShopKitsWithCurrentStock, recoverApprovedDeliveries, secureLogsChannel } from './interactions.js';
import { discoverStandardChannels, messageHasPanel } from './channel-discovery.js';
import { ensureBridgeSecret, getBridgeJob, startBridge } from './bridge.js';
import { refreshRegistrationPanel, reconcileGuildMembers, reconcileGuildMember, handleRegisteredNicknameUpdate } from './registration.js';

function assertRuntime() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new Error(`Node.js ${process.versions.node} não é compatível. Instale Node.js 22 ou mais recente (recomendado: 26 LTS).`);
  }
}

function isMissingDiscordMessage(error) {
  const code = Number(error?.code ?? error?.rawError?.code);
  return code === 10008 || code === 10003 || error?.status === 404;
}

async function refreshPanelMessage(guild, channelId, messageId, payload, label, keys, customId) {
  if (!channelId) return;

  try {
    const channel = guild.channels.cache.get(channelId)
      ?? await guild.channels.fetch(channelId).catch(error => {
        if (isMissingDiscordMessage(error)) return null;
        throw error;
      });

    if (!channel || channel.type !== ChannelType.GuildText) {
      updateGuildConfig(guild.id, { [keys.channel]: null, [keys.message]: null, [keys.version]: null });
      console.warn('[Asthen] O canal de ' + label + ' não existe mais. Será procurado novamente pelo nome.');
      return;
    }

    let message = null;
    if (messageId) {
      try {
        message = await channel.messages.fetch(messageId);
        if (!messageHasPanel(message, customId, guild.client.user?.id)) message = null;
      } catch (error) {
        if (!isMissingDiscordMessage(error)) throw error;
      }
    }

    // state.json pode ter sido restaurado sem o ID da mensagem. Procura o painel
    // existente antes de publicar outro, evitando duplicatas em reinicializações.
    if (!message) {
      let recent;
      try {
        recent = await channel.messages.fetch({ limit: 50 });
      } catch (error) {
        // Without history permission we cannot know whether the panel already exists.
        // Do not post a second copy when discovery is inconclusive.
        console.warn('[Asthen] Sem permissão para verificar mensagens recentes em #' + channel.name + '; painel não será duplicado.');
        return;
      }
      message = recent.find(item => messageHasPanel(item, customId, guild.client.user?.id)) || null;
    }

    if (message) {
      const savedConfig = getGuildConfig(guild.id);
      if (savedConfig[keys.version] !== PANEL_LAYOUT_VERSION) {
        // Migra uma única vez o painel legado (ex.: corrigir a descrição com \\n literal).
        await message.edit(payload);
        updateGuildConfig(guild.id, {
          [keys.message]: message.id,
          [keys.version]: PANEL_LAYOUT_VERSION
        });
        console.log('[Asthen] Painel de ' + label + ' atualizado uma vez para o layout ' + PANEL_LAYOUT_VERSION + '.');
      } else if (message.id !== messageId) {
        updateGuildConfig(guild.id, { [keys.message]: message.id });
      } else {
        console.log('[Asthen] Painel de ' + label + ' encontrado em #' + channel.name + '; mensagem preservada.');
      }
      return;
    }

    // No boot, só publica se o painel não existir. Mensagens atuais não são editadas.
    const created = await channel.send(payload);
    updateGuildConfig(guild.id, {
      [keys.message]: created.id,
      [keys.version]: PANEL_LAYOUT_VERSION
    });
    console.log('[Asthen] Painel de ' + label + ' criado em #' + channel.name + '.');
  } catch (error) {
    console.error('[Asthen] Não foi possível verificar o painel de ' + label + ' em ' + guild.name + ':', error.message);
  }
}

async function refreshShopCatalogPanel(guild) {
  const config = getGuildConfig(guild.id);
  if (!config.shopPanelChannelId) return;
  const channel = guild.channels.cache.get(config.shopPanelChannelId)
    ?? await guild.channels.fetch(config.shopPanelChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const shopPayload = makeShopPanel(await getShopKitsWithCurrentStock(guild.id));

  let message = null;
  if (config.shopPanelMessageId) {
    message = await channel.messages.fetch(config.shopPanelMessageId).catch(error => {
      if (isMissingDiscordMessage(error)) return null;
      throw error;
    });
  }
  if (message) {
    await message.edit(shopPayload);
    updateGuildConfig(guild.id, {
      shopPanelMessageId: message.id,
      shopPanelVersion: PANEL_LAYOUT_VERSION
    });
    return;
  }
  updateGuildConfig(guild.id, { shopPanelMessageId: null, shopPanelVersion: null });
  await refreshPanelMessage(
    guild,
    config.shopPanelChannelId,
    null,
    shopPayload,
    'kits',
    { channel: 'shopPanelChannelId', message: 'shopPanelMessageId', version: 'shopPanelVersion' },
    'shop:select:0'
  );
}

async function discoverGuildChannels(guild) {
  let channelsFetched = false;
  try {
    await guild.channels.fetch();
    channelsFetched = true;
  } catch (error) {
    console.warn('[Asthen] Não foi possível listar os canais de ' + guild.name + ':', error.message);
  }

  const config = getGuildConfig(guild.id);
  const found = discoverStandardChannels(guild.channels.cache);
  const changes = {};
  if (!config.memberRoleId) {
    const memberRole = guild.roles.cache.find(role =>
      ['membro', 'membros'].includes(String(role.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
    );
    if (memberRole) changes.memberRoleId = memberRole.id;
  }
  const messageKeys = {
    supportPanelChannelId: { message: 'supportPanelMessageId', version: 'supportPanelVersion' },
    shopPanelChannelId: { message: 'shopPanelMessageId', version: 'shopPanelVersion' },
    registrationChannelId: { message: 'registrationPanelMessageId', version: 'registrationPanelVersion' }
  };

  const channelKeys = [
    'supportPanelChannelId', 'shopPanelChannelId', 'logsChannelId', 'buyersChannelId', 'registrationChannelId'
  ];
  for (const key of channelKeys) {
    const current = config[key] ? guild.channels.cache.get(config[key]) : null;
    const detectedId = found[key] || null;
    // An exact standard channel name wins over a stale manual ID.
    if (detectedId) {
      if (detectedId !== config[key]) changes[key] = detectedId;
      continue;
    }
    if (channelsFetched && config[key] && current?.type !== ChannelType.GuildText) {
      changes[key] = null;
      if (messageKeys[key]) {
        changes[messageKeys[key].message] = null;
        changes[messageKeys[key].version] = null;
      }
    }
  }

  if (Object.keys(changes).length) {
    updateGuildConfig(guild.id, changes);
    const names = Object.entries(found)
      .filter(([key, id]) => changes[key] === id)
      .map(([key]) => ({
        supportPanelChannelId: 'atendimento',
        shopPanelChannelId: 'kits',
        logsChannelId: 'logs',
        buyersChannelId: 'compradores',
        registrationChannelId: 'registro'
      }[key]));
    if (names.length) console.log('[Asthen] Canais reconhecidos em ' + guild.name + ': ' + names.join(', ') + '.');
  }

  // Aplica as permissões de #logs em cada boot, inclusive quando o ID já estava salvo.
  const latestConfig = getGuildConfig(guild.id);
  const logsId = latestConfig.logsChannelId;
  const logsChannel = logsId ? guild.channels.cache.get(logsId) : null;
  if (logsChannel?.type === ChannelType.GuildText) {
    await secureLogsChannel(logsChannel, guild, latestConfig.staffRoleId || null).catch(error => {
      console.warn('[Asthen] Não foi possível proteger automaticamente #logs:', error.message);
    });
  }
}

async function findTicketChannel(client, ticket) {
  if (!ticket) return null;
  const guild = client.guilds.cache.get(ticket.guildId)
    ?? await client.guilds.fetch(ticket.guildId).catch(() => null);
  if (!guild) return null;
  return guild.channels.cache.get(ticket.channelId)
    ?? await guild.channels.fetch(ticket.channelId).catch(() => null);
}

async function handleBridgeResult(client, event) {
  const requestId = event?.request?.request_id;
  const ticket = findTicketByDeliveryRequestId(requestId);
  if (!ticket) {
    console.warn('[Asthen Bridge] Resultado recebido para request_id sem ticket local:', requestId);
    return;
  }

  const result = event.result || {};
  const status = String(result.status || 'UNKNOWN');
  if (ticket.deliveryResultNotificationSent === true) return;

  updateTicket(ticket.channelId, {
    deliveryStatus: status,
    deliveryResponse: String(result.message || ''),
    deliveryUpdatedAt: new Date().toISOString(),
    deliveryError: null,
    deliveryPluginFinal: true,
    deliveryResultNotificationPending: true
  });
  appendTicketHistory(ticket.channelId, {
    type: 'delivery_result',
    eventId: 'delivery-result:' + requestId,
    requestId,
    status,
    message: String(result.message || '').slice(0, 500)
  });

  // Normal in-process delivery displays its own response. This path is for
  // results recovered after a bot restart or received after the original timeout.
  if (!event.resumed) return;
  await retryPendingDeliveryNotification(client, ticket.channelId);
}

async function retryPendingDeliveryNotification(client, channelId) {
  const ticket = listTickets().find(item => item.channelId === channelId);
  if (!ticket || ticket.deliveryResultNotificationPending !== true) return;
  const channel = await findTicketChannel(client, ticket);
  if (!channel?.send) {
    console.warn('[Asthen Bridge] Resultado salvo, mas o canal do ticket não está disponível:', ticket.channelId);
    return;
  }

  const result = {
    status: String(ticket.deliveryStatus || 'UNKNOWN'),
    message: String(ticket.deliveryResponse || 'O plugin respondeu à solicitação.'),
    player: ticket.minecraftNick,
    platform: ticket.platform,
    kit: ticket.kitDisplayName || ticket.kitName,
    pendingReason: ticket.deliveryStatus === 'KIT_PENDING' && /offline/i.test(String(ticket.deliveryResponse || ''))
      ? 'offline'
      : 'inventory'
  };
  const retryableFinalFailures = new Set([
    'PLAYER_OFFLINE', 'PLATFORM_MISMATCH', 'PLATFORM_UNVERIFIABLE',
    'KIT_NOT_FOUND', 'KIT_DISABLED', 'INVENTORY_FULL', 'DELIVERY_DISABLED',
    'KIT_CORRUPT', 'INVALID_REQUEST'
  ]);
  const bridgeJob = getBridgeJob(ticket.deliveryRequestId || '');
  const pluginFinalTimeout = ticket.deliveryStatus === 'TIMEOUT'
    && (ticket.deliveryPluginFinal === true || bridgeJob?.result?.status === 'TIMEOUT');
  const canRetryWithNewRequest = retryableFinalFailures.has(ticket.deliveryStatus) || pluginFinalTimeout;
  const canRetryWithSameRequest = ticket.deliveryStatus === 'WAITING'
    || (ticket.deliveryStatus === 'TIMEOUT' && Boolean(bridgeJob) && !bridgeJob.result);
  const retryMode = canRetryWithNewRequest ? 'new' : canRetryWithSameRequest ? 'same' : null;
  await channel.send({
    content: makeDeliveryMessage({ ...result, userId: ticket.userId }),
    ...(retryMode ? { components: [makeDeliveryRetryControls(retryMode)] } : {}),
    allowedMentions: { users: [ticket.userId], roles: [] }
  });
  updateTicket(ticket.channelId, {
    deliveryResultNotificationPending: false,
    deliveryResultNotificationSent: true,
    deliveryNotificationError: null
  });
}

async function handleBridgeDeliveryUpdate(client, event) {
  const requestId = event?.update?.request_id;
  const ticket = findTicketByDeliveryRequestId(requestId);
  if (!ticket) {
    console.error('[Asthen Bridge] Atualização de entrega sem ticket local:', requestId);
    return;
  }

  const update = event.update || {};
  const alreadySent = ticket.deliveryUpdateNotificationSent === true;
  updateTicket(ticket.channelId, {
    deliveryStatus: 'KIT_DELIVERED',
    deliveryResponse: String(update.message || 'Kit entregue após retirada da pendência.'),
    deliveryUpdatedAt: update.updated_at || new Date().toISOString(),
    deliveryError: null,
    deliveryCompletedAt: update.updated_at || new Date().toISOString(),
    deliveryPluginFinal: true,
    deliveryUpdateNotificationPending: !alreadySent
  });
  appendTicketHistory(ticket.channelId, {
    type: 'delivery_result',
    eventId: 'delivery-result:' + requestId,
    requestId,
    status: 'KIT_PENDING',
    message: String(event.initialResult?.message || ticket.deliveryResponse || '').slice(0, 500),
    at: ticket.deliveryUpdatedAt || new Date().toISOString()
  });
  appendTicketHistory(ticket.channelId, {
    type: 'delivery_update',
    eventId: 'delivery-update:' + requestId,
    requestId,
    status: 'KIT_DELIVERED',
    message: String(update.message || '').slice(0, 500),
    at: update.updated_at || new Date().toISOString()
  });

  if (alreadySent) return;
  const channel = await findTicketChannel(client, ticket);
  if (!channel?.send) {
    console.warn('[Asthen Bridge] Kit marcado como entregue, mas o canal do ticket não está disponível:', ticket.channelId);
    return;
  }

  await channel.send({
    content: makeDeliveryMessage({
      status: 'KIT_DELIVERED',
      userId: ticket.userId,
      player: ticket.minecraftNick,
      kitDisplayName: ticket.kitDisplayName,
      kit: ticket.kitName
    }),
    allowedMentions: { users: [ticket.userId], roles: [] }
  });
  updateTicket(ticket.channelId, {
    deliveryUpdateNotificationPending: false,
    deliveryUpdateNotificationSent: true
  });
}

async function retryPendingTicketNotifications(client) {
  for (const ticket of listTickets()) {
    try {
      if (ticket.deliveryResultNotificationPending === true) {
        await retryPendingDeliveryNotification(client, ticket.channelId);
      }
      if (ticket.deliveryUpdateNotificationPending === true
          && ticket.deliveryUpdateNotificationSent !== true) {
        await handleBridgeDeliveryUpdate(client, {
          request: { request_id: ticket.deliveryRequestId },
          update: {
            request_id: ticket.deliveryRequestId,
            status: 'KIT_DELIVERED',
            message: ticket.deliveryResponse,
            updated_at: ticket.deliveryCompletedAt || ticket.deliveryUpdatedAt
          }
        });
      }
    } catch (error) {
      console.error('[Asthen] Não foi possível recuperar uma notificação pendente do ticket ' +
        ticket.channelId + ':', error.message);
    }
  }
}

async function refreshConfiguredPanels(client) {
  for (const guild of client.guilds.cache.values()) {
    await discoverGuildChannels(guild);
    const config = getGuildConfig(guild.id);
    await refreshPanelMessage(
      guild,
      config.supportPanelChannelId,
      config.supportPanelMessageId,
      makeSupportPanel(),
      'atendimento',
      { channel: 'supportPanelChannelId', message: 'supportPanelMessageId', version: 'supportPanelVersion' },
      'support:select'
    );
    try {
      // Refresh even if the saved panel layout version is unchanged.
      await refreshShopCatalogPanel(guild);
    } catch (error) {
      console.error('[Asthen] Não foi possível atualizar o estoque do painel #kits em ' + guild.name + ':', error.message);
    }
    try {
      await refreshRegistrationPanel(guild);
    } catch (error) {
      console.error('[Asthen Registro] Não foi possível atualizar o painel de registro em ' + guild.name + ':', error.message);
    }
  }
}

function scheduleWeeklyShopRefresh(client) {
  let timer = null;
  let stopped = false;

  const schedule = delay => {
    if (stopped) return;
    timer = setTimeout(run, Math.min(2_147_000_000, Math.max(1_000, delay)));
    timer.unref?.();
  };

  const run = async () => {
    let failed = false;
    for (const guild of client.guilds.cache.values()) {
      if (!getGuildConfig(guild.id).shopPanelChannelId) continue;
      try {
        await refreshShopCatalogPanel(guild);
      } catch (error) {
        failed = true;
        console.error('[Asthen] Falha ao atualizar o estoque semanal do painel #kits em ' + guild.name + ':', error.message);
      }
    }
    const nextDelay = failed
      ? 5 * 60 * 1000
      : getNextBrasiliaSundayAt().getTime() - Date.now();
    schedule(nextDelay);
  };

  schedule(getNextBrasiliaSundayAt().getTime() - Date.now());
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

async function main() {
  assertRuntime();
  const token = process.env.DISCORD_TOKEN?.trim();
  const clientId = process.env.CLIENT_ID?.trim();
  const guildId = process.env.GUILD_ID?.trim();

  if (!token || token === 'COLOQUE_SEU_TOKEN_AQUI') {
    throw new Error('DISCORD_TOKEN não configurado. Execute INSTALAR.bat e informe o token do bot.');
  }
  if (!clientId || clientId === 'COLOQUE_O_APPLICATION_ID_AQUI') {
    throw new Error('CLIENT_ID não configurado no arquivo .env.');
  }

  loadStore();
  const supabaseState = await initializeStoreSync();
  if (supabaseState.enabled) {
    console.log('[Asthen Supabase] Sincronização ativa.' + (supabaseState.restored ? ' Snapshot remoto restaurado.' : ' Backup local preservado.'));
  }
  const bridgeSecret = ensureBridgeSecret();
  if (bridgeSecret.generated) {
    console.log('[Asthen Bridge] Chave de integração criada e salva no .env. Configure o mesmo valor de DKB_SECRET diretamente em bridge.secret no config.yml do plugin; a chave não é exibida no Discord.');
  }
  const rest = new REST({ version: '10' }).setToken(token);
  const body = commandDefinitions.map(command => command.toJSON());
  console.log('Substituindo os comandos antigos pelos comandos atuais...');

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    // Remove comandos globais antigos para não deixar opções da versão anterior no Discord.
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
  } else {
    // PUT substitui a lista global inteira, removendo os comandos que não existem nesta versão.
    await rest.put(Routes.applicationCommands(clientId), { body });
  }

  console.log('Comandos do Discord atualizados: ' + body.length);

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  let bridgeServer = null;
  let shutdownPromise = null;
  let stopWeeklyShopRefresh = null;
  client.once(Events.ClientReady, async readyClient => {
    console.log(`Bot online como ${readyClient.user.tag}.`);
    console.log(`Servidores conectados: ${readyClient.guilds.cache.size}`);
    await refreshConfiguredPanels(readyClient);
    for (const guild of readyClient.guilds.cache.values()) {
      try {
        await reconcileGuildMembers(guild);
      } catch (error) {
        console.error('[Asthen Registro] Não foi possível reconciliar os jogadores de ' + guild.name + ':', error.message);
      }
    }
    stopWeeklyShopRefresh = scheduleWeeklyShopRefresh(readyClient);
    await retryPendingTicketNotifications(readyClient);
    if (bridgeServer) await recoverApprovedDeliveries(readyClient);
  });

  client.on(Events.GuildMemberAdd, async member => {
    try {
      await reconcileGuildMember(member);
    } catch (error) {
      console.error('[Asthen Registro] Falha ao sincronizar membro recém-chegado ' + member.id + ':', error.message);
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      await handleRegisteredNicknameUpdate(oldMember, newMember);
    } catch (error) {
      console.error('[Asthen Registro] Falha ao validar apelido atualizado de ' + newMember.id + ':', error.message);
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      console.error('[Asthen] Erro ao processar interação:', error);
      const message = error?.message?.includes('Missing Permissions')
        ? 'O bot não tem permissões para criar ou administrar esse canal. Verifique o cargo e as permissões dele.'
        : error?.message || 'Não foi possível concluir essa ação. Verifique as configurações e tente novamente.';
      try {
        if (interaction.isRepliable()) {
          const payload = { content: message, flags: MessageFlags.Ephemeral };
          if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
          else await interaction.reply(payload);
        }
      } catch (replyError) {
        console.error('[Asthen] Falha ao responder à interação:', replyError);
      }
    }
  });

  await client.login(token);

  const shutdown = signal => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      console.log('[Asthen] Encerrando com segurança (' + signal + ')...');
      stopWeeklyShopRefresh?.();
      try {
        await bridgeServer?.close();
      } catch (error) {
        console.error('[Asthen Bridge] Não foi possível fechar a API de integração:', error.message);
      }
      try {
        const flush = flushSupabaseSync();
        const completed = await Promise.race([
          flush.then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), 20_000))
        ]);
        if (!completed) console.error('[Asthen Supabase] Limite de encerramento atingido; os dados locais permanecem salvos e a sincronização será tentada no próximo início.');
      } catch (error) {
        console.error('[Asthen Supabase] Não foi possível concluir a última sincronização:', error.message);
      }
      client.destroy();
      process.exit(0);
    })();
    return shutdownPromise;
  };
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

  try {
    bridgeServer = await startBridge({
      token: bridgeSecret.token,
      host: process.env.DKB_HOST?.trim() || '127.0.0.1',
      port: Number(process.env.DKB_PORT || 8787),
      onResult: event => {
        void handleBridgeResult(client, event).catch(error => console.error('[Asthen Bridge] Falha ao reconciliar resultado:', error));
      },
      onDeliveryUpdate: event => {
        void handleBridgeDeliveryUpdate(client, event).catch(error => console.error('[Asthen Bridge] Falha ao atualizar ticket:', error));
      },
      onKits: async kits => {
        const enabled = kits.filter(kit => kit.enabled).map(kit => kit.name);
        let changedGuilds = 0;
        for (const guild of client.guilds.cache.values()) {
          const result = syncPluginKits(guild.id, kits);
          if (result.changed) {
            changedGuilds += 1;
            try {
              await refreshShopCatalogPanel(guild);
            } catch (error) {
              console.error('[Asthen API] Kits sincronizados, mas o painel da loja não pôde ser atualizado em ' + guild.name + ':', error.message);
            }
          }
        }
        console.log('[Asthen API] Plugin sincronizou ' + kits.length + ' kit(s): ' +
          (enabled.join(', ') || 'nenhum ativo') +
          '. Catálogos atualizados: ' + changedGuilds + '.');
      }
    });
    console.log('[Asthen Bridge] API ativa em http://' + bridgeServer.host + ':' + bridgeServer.port + '.');
    if (client.isReady()) {
      void recoverApprovedDeliveries(client).catch(error => {
        console.error('[Asthen] Falha ao recuperar entregas aprovadas após reinício:', error.message);
      });
    }
  } catch (error) {
    console.error('[Asthen Bridge] Não foi possível iniciar a API de integração:', error.message);
    console.error('[Asthen Bridge] O bot do Discord continuará online, mas a entrega automática ficará indisponível.');
  }
}

process.on('unhandledRejection', error => {
  console.error('[Asthen] Erro não tratado:', error);
});

main().catch(error => {
  console.error(`\n[Asthen] Inicialização interrompida: ${error.message}\n`);
  process.exitCode = 1;
});
