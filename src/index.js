import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes
} from 'discord.js';
import { commandDefinitions } from './commands.js';
import { loadStore } from './store.js';
import { handleInteraction } from './interactions.js';
import { configureBrand, VERSION } from './ui.js';

function assertRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 17) || major >= 27) {
    throw new Error(`Node.js incompatível: ${process.versions.node}. Instale Node.js 24.17+ (recomendado: Node.js 26 LTS).`);
  }
}

async function main() {
  assertRuntime();
  configureBrand({ name: process.env.BOT_NAME, color: process.env.BOT_COLOR });
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
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(`[Asthen] Registrando comandos ${guildId ? `no servidor ${guildId}` : 'globalmente'}...`);
  await rest.put(route, { body });
  console.log('[Asthen] Comandos registrados.');

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });
  client.once(Events.ClientReady, readyClient => {
    console.log(`[Asthen] ${readyClient.user.tag} online • versão ${VERSION}`);
    console.log(`[Asthen] Servidores conectados: ${readyClient.guilds.cache.size}`);
  });

  client.on(Events.InteractionCreate, async interaction => {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      console.error('[Asthen] Erro ao processar interação:', error);
      const message = error?.message?.includes('Missing Permissions')
        ? 'O bot não tem permissões suficientes para criar ou administrar esse canal. Confira o cargo e as permissões dele.'
        : 'Não foi possível concluir essa ação. Confira as configurações e as permissões do bot.';
      try {
        if (interaction.isRepliable()) {
          const payload = { content: message, ephemeral: true };
          if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
          else await interaction.reply(payload);
        }
      } catch (replyError) {
        console.error('[Asthen] Também não foi possível responder à interação:', replyError);
      }
    }
  });

  await client.login(token);
}

main().catch(error => {
  console.error(`\n[Asthen] Inicialização interrompida: ${error.message}\n`);
  process.exitCode = 1;
});
