import { backfillGuild } from '../features/serverAwareness.js';
import { startPresenceLoop } from '../features/presence.js';

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[Doll] Logged in as ${client.user.tag}`);
    console.log(`[Doll] Serving ${client.guilds.cache.size} server(s)`);

    startPresenceLoop(client); // rotating cute presences

    // Backfill: read recent messages from every guild to build awareness
    for (const guild of client.guilds.cache.values()) {
      try {
        // Ensure members are cached for server awareness
        await guild.members.fetch({ limit: 100 }).catch(() => {});
        await backfillGuild(guild);
      } catch (e) {
        console.error(`[Awareness] Backfill failed for ${guild.name}:`, e.message);
      }
    }
  },
};
