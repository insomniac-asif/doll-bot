import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getStore, saveStore } from '../store.js';
import { evaluateLevelUp } from './rulesEngine.js';

const cooldowns = new Map(); // `${guildId}:${userId}` -> timestamp

export function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

export function levelFromXp(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, into: remaining, needed: xpForLevel(level) };
}

export async function handleMessageXp(message) {
  if (message.author.bot || !message.guild) return;
  const config = getConfig(message.guild.id);
  if (!config.leveling.enabled) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < config.leveling.cooldownSec * 1000) return;
  cooldowns.set(key, now);

  const store = getStore('levels', message.guild.id, { users: {} });
  const user = store.users[message.author.id] || { xp: 0 };
  const before = levelFromXp(user.xp).level;
  user.xp += config.leveling.xpPerMessage;
  const after = levelFromXp(user.xp).level;
  store.users[message.author.id] = user;
  saveStore('levels', message.guild.id, store);

  if (after > before) {
    await announceLevelUp(message, after, config);
    if (message.member) {
      await evaluateLevelUp(message.member, after).catch(e => console.error('[Rules] levelup eval error:', e.message));
    }
  }
}

async function announceLevelUp(message, level, config) {
  // Assign level roles if configured
  const roleId = config.leveling.levelRoles?.[String(level)];
  if (roleId && message.member) {
    try { await message.member.roles.add(roleId); } catch { /* ignore */ }
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setDescription(`🎉 <@${message.author.id}> reached **level ${level}**!`);

  const channelId = config.leveling.announceChannel;
  try {
    if (channelId) {
      const ch = await message.guild.channels.fetch(channelId).catch(() => null);
      if (ch) return ch.send({ embeds: [embed] });
    }
    await message.channel.send({ embeds: [embed] });
  } catch { /* ignore */ }
}

export function getRank(guildId, userId) {
  const store = getStore('levels', guildId, { users: {} });
  const sorted = Object.entries(store.users).sort((a, b) => b[1].xp - a[1].xp);
  const idx = sorted.findIndex(([id]) => id === userId);
  const xp = store.users[userId]?.xp || 0;
  return { rank: idx >= 0 ? idx + 1 : sorted.length + 1, xp, total: sorted.length, ...levelFromXp(xp) };
}

export function getLeaderboard(guildId, limit = 10) {
  const store = getStore('levels', guildId, { users: {} });
  return Object.entries(store.users)
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, limit)
    .map(([id, u], i) => ({ id, xp: u.xp, position: i + 1, ...levelFromXp(u.xp) }));
}
