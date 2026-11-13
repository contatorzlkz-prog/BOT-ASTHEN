import 'dotenv/config';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';
import { getGuildConfig, loadStore } from './store.js';
import { makeShopPanel, makeSupportPanel } from './ui.js';
import { handleInteraction } from './interactions.js';

function assertRuntime() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new Error(`Node.js ${process.versions.node} não é compatível. Instale Node.js 22 ou mais recente (recomendado: 26 LTS).`);
  }
}

async function refreshPanelMessage(guild, channelId, messageId, payload, label) {
  if (!channelId || !messageId) return;
  try {
    const channel = guild.channels.cache.get(channelId)
      ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) await message.edit(payload);
  } catch (error) {
    console.error('[Asthen] Não foi possível atualizar o painel de ' + label + ' em ' + guild.name + ':', error.message);
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
      'suporte'
    );
    await refreshPanelMessage(
      guild,
      config.shopPanelChannelId,
      config.shopPanelMessageId,
      makeShopPanel(config.kits),
      'loja'
    );
  }
}

async function main() {
  assertRuntime();
  const token = process.env.DISCORD_TOKEN?.trim();
  const clientId = process.env.CLIENT_ID?.trim();
  const guildId = process.env.GUILD_ID?.trim();

  if (!token || token === 'COLOQUE_SEU_TOKEN_AQUI') {
    throw new Error('DISCORD_TOKEN não configurado. Copie .env.example para .env e informe o token do bot.');
  }
  if (!clientId || clientId === 'COLOQUE_O_APPLICATION_ID_AQUI') {
    throw new Error('CLIENT_ID não configurado no arquivo .env.');
  }

  loadStore();
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
  client.once(Events.ClientReady, async readyClient => {
    console.log(`Bot online como ${readyClient.user.tag}.`);
    console.log(`Servidores conectados: ${readyClient.guilds.cache.size}`);
    await refreshConfiguredPanels(readyClient);
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
}

process.on('unhandledRejection', error => {
  console.error('[Asthen] Erro não tratado:', error);
});

main().catch(error => {
  console.error(`\n[Asthen] Inicialização interrompida: ${error.message}\n`);
  process.exitCode = 1;
});
