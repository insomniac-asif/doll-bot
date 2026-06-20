import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';

// Doll's only proactive-message path. She forwards things that need human
// attention to (a) the global OWNER_ID via DM, and (b) the per-server alert
// channel. "Both" is the configured posture.
export async function notifyOwner(client, guild, { title, description, level = 'info', fields = [] }) {
  const colors = { info: 0x3498db, warn: 0xf1c40f, urgent: 0xe74c3c };
  const embed = new EmbedBuilder()
    .setTitle(`🔔 ${title}`)
    .setColor(colors[level] || colors.info)
    .setTimestamp();
  if (description) embed.setDescription(description);
  if (guild) embed.setFooter({ text: `${guild.name} (${guild.id})` });
  for (const f of fields) embed.addFields(f);

  // (a) DM the global owner
  const ownerId = process.env.OWNER_ID;
  if (ownerId) {
    try {
      const owner = await client.users.fetch(ownerId);
      await owner.send({ embeds: [embed] });
    } catch (e) {
      console.error('[OwnerForward] DM failed:', e.message);
    }
  }

  // (b) Post to the server's alert channel
  if (guild) {
    const config = getConfig(guild.id);
    if (config.ownerAlert.channel) {
      try {
        const ch = await guild.channels.fetch(config.ownerAlert.channel).catch(() => null);
        if (ch) await ch.send({ embeds: [embed] });
      } catch (e) {
        console.error('[OwnerForward] Channel post failed:', e.message);
      }
    }
  }
}
