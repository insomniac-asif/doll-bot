import { EmbedBuilder } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';
import { isEnabled } from './featureToggle.js';

export function setBirthday(guildId, userId, month, day) {
  const config = getConfig(guildId);
  const birthdays = config.birthdays;
  birthdays.list[userId] = { month, day };
  updateConfig(guildId, { birthdays });
}

export function removeBirthday(guildId, userId) {
  const config = getConfig(guildId);
  delete config.birthdays.list[userId];
  updateConfig(guildId, { birthdays: config.birthdays });
}

// Checks once per hour; announces on the configured channel when the date matches.
export function startBirthdayLoop(client) {
  const tick = async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    for (const guild of client.guilds.cache.values()) {
      if (!isEnabled(guild.id, 'birthdays')) continue;
      const config = getConfig(guild.id);
      const bday = config.birthdays;
      if (!bday.channel) continue;

      const todays = Object.entries(bday.list).filter(([, d]) => d.month === month && d.day === day);
      if (!todays.length) continue;

      // Avoid duplicate announcements within the same day
      const stampKey = `${now.getFullYear()}-${month}-${day}`;
      if (bday._lastAnnounced === stampKey) continue;

      const channel = await guild.channels.fetch(bday.channel).catch(() => null);
      if (!channel) continue;

      for (const [userId] of todays) {
        const embed = new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle('🎂 Happy Birthday!')
          .setDescription(`Everyone wish <@${userId}> a happy birthday! 🎉`);
        await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
        if (bday.role) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.add(bday.role).catch(() => {});
        }
      }

      bday._lastAnnounced = stampKey;
      updateConfig(guild.id, { birthdays: bday });
    }
  };
  tick();
  setInterval(tick, 60 * 60 * 1000);
}
