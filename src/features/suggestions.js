// Suggestion board — members submit ideas, the server votes with 👍/👎,
// staff approve/deny with a status update.

import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getStore, saveStore } from '../store.js';
import { getAccent } from '../config.js';

function store(guildId) { return getStore('suggestions', guildId, { items: [], nextId: 1 }); }

export async function postSuggestion(guild, author, text) {
  const config = getConfig(guild.id);
  if (!config.suggestions?.channel) return { error: 'no suggestion channel is set up. an admin can say "set the suggestion channel to #suggestions"' };

  const ch = await guild.channels.fetch(config.suggestions.channel).catch(() => null);
  if (!ch?.isTextBased?.()) return { error: 'the configured suggestion channel is missing' };

  const s = store(guild.id);
  const id = s.nextId++;

  const embed = new EmbedBuilder()
    .setColor(getAccent(guild.id))
    .setAuthor({ name: author.displayName ?? author.username, iconURL: author.displayAvatarURL?.() })
    .setTitle(`Suggestion #${id}`)
    .setDescription(text)
    .addFields({ name: 'Status', value: '🗳️ Open for voting' })
    .setTimestamp();

  const msg = await ch.send({ embeds: [embed] });
  try { await msg.react('👍'); await msg.react('👎'); } catch { /* ignore */ }

  s.items.push({ id, authorId: author.id, text, status: 'open', messageId: msg.id, channelId: ch.id });
  saveStore('suggestions', guild.id, s);
  return { id };
}

export async function setSuggestionStatus(guild, id, status, reason, staff) {
  const s = store(guild.id);
  const item = s.items.find(i => i.id === Number(id));
  if (!item) return { error: `couldn't find suggestion #${id}` };

  const ch = await guild.channels.fetch(item.channelId).catch(() => null);
  const msg = ch ? await ch.messages.fetch(item.messageId).catch(() => null) : null;

  const colors = { approved: 0x57f287, denied: 0xed4245, considered: 0xfee75c };
  const labels = { approved: '✅ Approved', denied: '❌ Denied', considered: '🤔 Under consideration' };

  if (msg) {
    const embed = EmbedBuilder.from(msg.embeds[0]);
    embed.setColor(colors[status] || getAccent(guild.id));
    embed.spliceFields(0, 1, { name: 'Status', value: `${labels[status] || status}${reason ? ` — ${reason}` : ''}${staff ? `\nby ${staff}` : ''}` });
    await msg.edit({ embeds: [embed] }).catch(() => {});
  }

  item.status = status;
  item.reason = reason || null;
  saveStore('suggestions', guild.id, s);

  // Notify the author
  try {
    const author = await guild.members.fetch(item.authorId).catch(() => null);
    if (author) await author.send(`your suggestion #${id} in ${guild.name} was **${status}**${reason ? `: ${reason}` : ''}.`).catch(() => {});
  } catch { /* dms closed */ }

  return { id: item.id, status };
}
