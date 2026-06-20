import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';

export async function logAction(guild, embed) {
  const config = getConfig(guild.id);
  if (!config.logChannel) return;

  try {
    const channel = await guild.channels.fetch(config.logChannel);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error(`[Logging] Failed to log to channel in ${guild.name}:`, e.message);
  }
}

export function modActionEmbed({ action, target, moderator, reason, extra }) {
  const colors = {
    kick: 0xffa500,
    ban: 0xff0000,
    mute: 0xffcc00,
    unmute: 0x00cc00,
    warn: 0xffaa00,
    clear: 0x3498db,
  };

  const embed = new EmbedBuilder()
    .setTitle(`Mod Action: ${action.charAt(0).toUpperCase() + action.slice(1)}`)
    .setColor(colors[action] || 0x999999)
    .addFields(
      { name: 'Target', value: target, inline: true },
      { name: 'Moderator', value: moderator, inline: true },
      { name: 'Reason', value: reason || 'No reason provided' },
    )
    .setTimestamp();

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      embed.addFields({ name: key, value: String(value), inline: true });
    }
  }

  return embed;
}

export function memberEmbed({ type, member }) {
  const isJoin = type === 'join';
  return new EmbedBuilder()
    .setTitle(isJoin ? 'Member Joined' : 'Member Left')
    .setColor(isJoin ? 0x00cc66 : 0xcc6600)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${member.user.tag} (${member.user.id})` },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setTimestamp();
}

export function messageEditEmbed({ oldMessage, newMessage }) {
  const embed = new EmbedBuilder()
    .setTitle('Message Edited')
    .setColor(0x3498db)
    .addFields(
      { name: 'Author', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
      { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
    )
    .setTimestamp();

  if (oldMessage.content) embed.addFields({ name: 'Before', value: oldMessage.content.substring(0, 1024) });
  if (newMessage.content) embed.addFields({ name: 'After', value: newMessage.content.substring(0, 1024) });

  return embed;
}

export function messageDeleteEmbed({ message }) {
  return new EmbedBuilder()
    .setTitle('Message Deleted')
    .setColor(0xe74c3c)
    .addFields(
      { name: 'Author', value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown', inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Content', value: message.content?.substring(0, 1024) || '*No text content*' },
    )
    .setTimestamp();
}
