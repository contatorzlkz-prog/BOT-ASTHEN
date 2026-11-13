import 'dotenv/config';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';
import { loadStore } from './store.js';
import { handleInteraction } from './interactions.js';

function assertRuntime() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    throw new Error(`Node.js ${process.versions.node} não é compatível. Instale Node.js 22 LTS ou mais recente.`);
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
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(`Registrando ${body.length} comandos do Discord...`);
  await rest.put(route, { body });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, readyClient => {
    console.log(`Bot online como ${readyClient.user.tag}.`);
    console.log(`Servidores conectados: ${readyClient.guilds.cache.size}`);
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
