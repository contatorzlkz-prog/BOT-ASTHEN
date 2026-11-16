import 'dotenv/config';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';
import { appendTicketHistory, findTicketByDeliveryRequestId, getGuildConfig, getShopKits, listTickets, loadStore, initializeStoreSync, updateGuildConfig, updateTicket, syncPluginKits } from './store.js';
import { flushSupabaseSync } from './supabase.js';
import { makeShopPanel, makeSupportPanel } from './ui.js';
import { handleInteraction, recoverApprovedDeliveries } from './interactions.js';
import { ensureBridgeSecret, startBridge } from './bridge.js';

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

async function refreshPanelMessage(guild, channelId, messageId, payload, label, keys) {
  if (!channelId) return;

  try {
    const channel = guild.channels.cache.get(channelId)
      ?? await guild.channels.fetch(channelId).catch(error => {
        if (isMissingDiscordMessage(error)) return null;
        throw error;
      });

    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      updateGuildConfig(guild.id, { [keys.channel]: null, [keys.message]: null });
      console.warn('[Asthen] O canal do painel de ' + label + ' não existe mais. Configure-o novamente com /configurar.');
      return;
    }

    let message = null;
    if (messageId) {
      try {
        message = await channel.messages.fetch(messageId);
      } catch (error) {
        if (!isMissingDiscordMessage(error)) throw error;
      }
    }

    if (message) {
      try {
        await message.edit(payload);
        return;
      } catch (error) {
        if (!isMissingDiscordMessage(error)) throw error;
      }
    }

    // Um painel apagado ou com ID antigo é recriado e seu novo ID é salvo.
    const replacement = await channel.send(payload);
    updateGuildConfig(guild.id, { [keys.message]: replacement.id });
    console.log('[Asthen] Painel de ' + label + ' recriado em #' + channel.name + '.');
  } catch (error) {
    console.error('[Asthen] Não foi possível atualizar o painel de ' + label + ' em ' + guild.name + ':', error.message);
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
  await channel.send({
    content: 'Resultado da entrega recuperado pela integração.',
    embeds: [makeDeliveryEmbed(result)],
    components: ticket.deliveryStatus === 'KIT_DELIVERED' || ticket.deliveryStatus === 'KIT_PENDING'
      ? [makeCloseRow()]
      : []
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
    content: '<@' + ticket.userId + '> O Minecraft confirmou a retirada do kit que estava pendente.',
    embeds: [makeDeliveryEmbed({
      status: 'KIT_DELIVERED',
      message: String(update.message || 'O kit pendente foi entregue com sucesso.'),
      player: ticket.minecraftNick,
      platform: ticket.platform,
      kit: ticket.kitDisplayName || ticket.kitName
    })],
    components: [makeCloseRow()],
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
    const config = getGuildConfig(guild.id);
    await refreshPanelMessage(
      guild,
      config.supportPanelChannelId,
      config.supportPanelMessageId,
      makeSupportPanel(),
      'suporte',
      { channel: 'supportPanelChannelId', message: 'supportPanelMessageId' }
    );
    await refreshPanelMessage(
      guild,
      config.shopPanelChannelId,
      config.shopPanelMessageId,
      makeShopPanel(getShopKits(guild.id)),
      'loja',
      { channel: 'shopPanelChannelId', message: 'shopPanelMessageId' }
    );
  }
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

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let bridgeServer = null;
  let shutdownPromise = null;
  client.once(Events.ClientReady, async readyClient => {
    console.log(`Bot online como ${readyClient.user.tag}.`);
    console.log(`Servidores conectados: ${readyClient.guilds.cache.size}`);
    await refreshConfiguredPanels(readyClient);
    await retryPendingTicketNotifications(readyClient);
    if (bridgeServer) await recoverApprovedDeliveries(readyClient);
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
          const payload = { content: message, ephemeral: true };
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
      onKits: kits => {
        const enabled = kits.filter(kit => kit.enabled).map(kit => kit.name);
        let changedGuilds = 0;

        for (const guild of client.guilds.cache.values()) {
          const result = syncPluginKits(guild.id, kits);
          if (result.changed) {
            changedGuilds += 1;
            const config = getGuildConfig(guild.id);
            void refreshPanelMessage(
              guild,
              config.shopPanelChannelId,
              config.shopPanelMessageId,
              makeShopPanel(config.kits),
              'loja',
              { channel: 'shopPanelChannelId', message: 'shopPanelMessageId' }
            );
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
