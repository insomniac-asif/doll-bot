import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logAction, messageEditEmbed, messageDeleteEmbed } from './features/logging.js';
import { handleReactionAdd, handleReactionRemove } from './features/reactionRoles.js';
import { handleStarboardReaction } from './features/starboard.js';
import { handleLoreReaction } from './features/lore.js';
import { handleVoiceState } from './features/tempVoice.js';
import { handleVoiceTrack } from './features/voiceTracking.js';
import { startReminderLoop } from './features/reminders.js';
import { startGiveawayLoop } from './features/giveaways.js';
import { startBirthdayLoop } from './features/birthday.js';
import { startSocialLoop } from './features/social.js';
import { startDigestLoop } from './features/digest.js';
import { startScheduledLoop } from './features/scheduling.js';
import { startTempRoleLoop } from './features/tempRoles.js';
import { startRssLoop } from './features/rss.js';
import { cacheAllInvites, cacheGuildInvites } from './features/inviteTracking.js';
import { startDevWatch } from './features/devMonitor.js';
import { handleChannelDelete, handleRoleDelete, handleBanAdd } from './features/antinuke.js';
import { logVoice, logMemberUpdate, logChannelCreate, logChannelDelete, logRoleCreate, logRoleDelete } from './features/richLog.js';
import { onChannelCreate as adminChCreate, onChannelDelete as adminChDelete, onRoleCreate as adminRoleCreate, onRoleDelete as adminRoleDelete, onBanAdd as adminBanAdd } from './features/adminActivity.js';

// Load all AI tools (self-register at import time)
import './skills/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
});

client.commands = new Collection();

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const { default: exported } = await import(`./commands/${file}`);
    const list = Array.isArray(exported) ? exported : [exported];
    for (const command of list) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded /${command.data.name}`);
    }
  }
}

async function loadEvents() {
  const eventsPath = join(__dirname, 'events');
  const files = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const { default: event } = await import(`./events/${file}`);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[Events] Loaded ${event.name}`);
  }
}

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;
  await logAction(newMessage.guild, messageEditEmbed({ oldMessage, newMessage }));
});

client.on('messageDelete', async (message) => {
  if (message.author?.bot) return;
  if (!message.guild) return;
  await logAction(message.guild, messageDeleteEmbed({ message }));
});

client.on('messageReactionAdd', (reaction, user) => {
  handleReactionAdd(reaction, user);
  handleStarboardReaction(reaction, user);
  handleLoreReaction(reaction, user);
});
client.on('messageReactionRemove', (reaction, user) => handleReactionRemove(reaction, user));

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceState(oldState, newState);
  handleVoiceTrack(oldState, newState);
  logVoice(oldState, newState);
});

client.on('guildMemberUpdate', (oldMember, newMember) => logMemberUpdate(oldMember, newMember));
client.on('channelCreate', (channel) => { logChannelCreate(channel); adminChCreate(channel); });
client.on('roleCreate', (role) => { logRoleCreate(role); adminRoleCreate(role); });

client.on('channelDelete', (channel) => { handleChannelDelete(channel); logChannelDelete(channel); adminChDelete(channel); });
client.on('roleDelete', (role) => { handleRoleDelete(role); logRoleDelete(role); adminRoleDelete(role); });
client.on('guildBanAdd', (ban) => { handleBanAdd(ban); adminBanAdd(ban); });

// Keep the invite cache fresh for invite tracking
client.on('inviteCreate', (invite) => { if (invite.guild) cacheGuildInvites(invite.guild); });
client.on('inviteDelete', (invite) => { if (invite.guild) cacheGuildInvites(invite.guild); });

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('[Doll] DISCORD_TOKEN is required in .env');
    process.exit(1);
  }

  await loadCommands();
  await loadEvents();

  client.once('ready', () => {
    startReminderLoop(client);
    startGiveawayLoop(client);
    startBirthdayLoop(client);
    startSocialLoop(client);
    startDigestLoop(client);
    startScheduledLoop(client);
    startTempRoleLoop(client);
    startRssLoop(client);
    cacheAllInvites(client);
    startDevWatch(client);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(e => {
  console.error('[Doll] Fatal error:', e);
  process.exit(1);
});
