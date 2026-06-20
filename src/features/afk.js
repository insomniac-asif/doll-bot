import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

export function setAfk(guildId, userId, reason) {
  const store = getStore('afk', guildId, { users: {} });
  store.users[userId] = { reason: reason || 'AFK', since: Date.now() };
  saveStore('afk', guildId, store);
}

export function clearAfk(guildId, userId) {
  const store = getStore('afk', guildId, { users: {} });
  if (store.users[userId]) {
    delete store.users[userId];
    saveStore('afk', guildId, store);
    return true;
  }
  return false;
}

export function getAfk(guildId, userId) {
  const store = getStore('afk', guildId, { users: {} });
  return store.users[userId] || null;
}

// Called on every message: clears the author's AFK and notes any AFK mentions.
export async function handleAfk(message) {
  if (message.author.bot || !message.guild) return;
  if (!isEnabled(message.guild.id, 'afk')) return;

  // Author returns from AFK
  if (getAfk(message.guild.id, message.author.id)) {
    clearAfk(message.guild.id, message.author.id);
    const m = await message.reply({ content: `Welcome back <@${message.author.id}>, I removed your AFK.`, allowedMentions: { repliedUser: false } });
    setTimeout(() => m.delete().catch(() => {}), 5000);
  }

  // Mentioned users who are AFK
  for (const user of message.mentions.users.values()) {
    const afk = getAfk(message.guild.id, user.id);
    if (afk) {
      await message.reply({
        content: `<@${user.id}> is AFK: ${afk.reason} (<t:${Math.floor(afk.since / 1000)}:R>)`,
        allowedMentions: { users: [] },
      });
    }
  }
}
