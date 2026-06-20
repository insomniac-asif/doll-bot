import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getStore, saveStore } from '../store.js';

export async function handleStarboardReaction(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  const message = reaction.message;
  if (!message.guild) return;

  const config = getConfig(message.guild.id);
  const sb = config.starboard;
  if (!sb.enabled || !sb.channel) return;
  if (reaction.emoji.name !== sb.emoji) return;

  const count = reaction.count || 0;
  if (count < sb.threshold) return;

  if (message.channel.id === sb.channel) return; // don't star the starboard itself

  const store = getStore('starboard', message.guild.id, { posted: {} });
  const starChannel = await message.guild.channels.fetch(sb.channel).catch(() => null);
  if (!starChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xffac33)
    .setAuthor({ name: message.author?.tag || 'Unknown', iconURL: message.author?.displayAvatarURL() })
    .setDescription(message.content || '*No text*')
    .addFields({ name: 'Source', value: `[Jump to message](${message.url})` })
    .setFooter({ text: `${sb.emoji} ${count}` })
    .setTimestamp(message.createdTimestamp);

  const image = message.attachments.first();
  if (image) embed.setImage(image.url);

  if (store.posted[message.id]) {
    // Update existing starboard post count
    const starMsg = await starChannel.messages.fetch(store.posted[message.id]).catch(() => null);
    if (starMsg) await starMsg.edit({ content: `${sb.emoji} **${count}**`, embeds: [embed] });
  } else {
    const starMsg = await starChannel.send({ content: `${sb.emoji} **${count}**`, embeds: [embed] });
    store.posted[message.id] = starMsg.id;
    saveStore('starboard', message.guild.id, store);
  }
}
