import { EmbedBuilder } from 'discord.js';
import { getStore, saveStore } from '../store.js';

const EMOJI = '🎉';

export async function createGiveaway(channel, { prize, winners, durationMs, hostId }) {
  const endsAt = Date.now() + durationMs;
  const embed = giveawayEmbed({ prize, winners, endsAt, hostId, ended: false });
  const msg = await channel.send({ embeds: [embed] });
  await msg.react(EMOJI);

  const store = getStore('giveaways', channel.guild.id, { items: {} });
  store.items[msg.id] = { channelId: channel.id, prize, winners, endsAt, hostId, ended: false };
  saveStore('giveaways', channel.guild.id, store);
  return msg;
}

function giveawayEmbed({ prize, winners, endsAt, hostId, ended, winnerIds }) {
  const embed = new EmbedBuilder()
    .setTitle('🎉 Giveaway 🎉')
    .setColor(ended ? 0x95a5a6 : 0xe91e63)
    .setDescription(
      `**Prize:** ${prize}\n` +
      `**Winners:** ${winners}\n` +
      (ended
        ? `**Ended** — ${winnerIds?.length ? winnerIds.map(id => `<@${id}>`).join(', ') : 'No valid entries'}`
        : `React with ${EMOJI} to enter!\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`)
    )
    .setFooter({ text: `Hosted by ${hostId ? 'a moderator' : 'staff'}` });
  return embed;
}

async function pickWinners(message, count) {
  const reaction = message.reactions.cache.get(EMOJI);
  if (!reaction) return [];
  const users = await reaction.users.fetch();
  const entrants = users.filter(u => !u.bot).map(u => u.id);
  const winners = [];
  const pool = [...entrants];
  while (winners.length < count && pool.length) {
    const idx = Math.floor((winners.length * 7 + pool.length * 13 + Date.now()) % pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

export async function endGiveaway(client, guildId, messageId) {
  const store = getStore('giveaways', guildId, { items: {} });
  const g = store.items[messageId];
  if (!g || g.ended) return null;

  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return null;

  const winnerIds = await pickWinners(message, g.winners);
  g.ended = true;
  g.winnerIds = winnerIds;
  saveStore('giveaways', guildId, store);

  await message.edit({ embeds: [giveawayEmbed({ ...g, ended: true, winnerIds })] });
  if (winnerIds.length) {
    await channel.send(`🎉 Congratulations ${winnerIds.map(id => `<@${id}>`).join(', ')}! You won **${g.prize}**!`);
  } else {
    await channel.send(`No valid entries for **${g.prize}**.`);
  }
  return winnerIds;
}

export async function rerollGiveaway(client, guildId, messageId) {
  const store = getStore('giveaways', guildId, { items: {} });
  const g = store.items[messageId];
  if (!g) return null;
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return null;
  const winnerIds = await pickWinners(message, g.winners);
  if (winnerIds.length) {
    await channel.send(`🎉 New winner(s) for **${g.prize}**: ${winnerIds.map(id => `<@${id}>`).join(', ')}!`);
  }
  return winnerIds;
}

export function startGiveawayLoop(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      const store = getStore('giveaways', guild.id, { items: {} });
      const now = Date.now();
      for (const [messageId, g] of Object.entries(store.items)) {
        if (!g.ended && g.endsAt <= now) {
          await endGiveaway(client, guild.id, messageId).catch(() => {});
        }
      }
    }
  }, 15 * 1000);
}
