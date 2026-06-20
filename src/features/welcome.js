import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { isEnabled } from './featureToggle.js';

export async function handleWelcome(member) {
  if (!isEnabled(member.guild.id, 'welcome')) return;
  const config = getConfig(member.guild.id);
  if (!config.welcomeChannel) return;

  const channel = await member.guild.channels.fetch(config.welcomeChannel).catch(() => null);
  if (!channel) return;

  const text = config.welcomeMessage
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{server}/g, member.guild.name)
    .replace(/{count}/g, member.guild.memberCount);

  // Rendered welcome card (opt-in via 'welcomeImage' toggle)
  if (isEnabled(member.guild.id, 'welcomeImage')) {
    try {
      const { renderWelcomeCard } = await import('./visual.js');
      const buf = await renderWelcomeCard(member, `member #${member.guild.memberCount} • ${member.guild.name}`);
      const file = new AttachmentBuilder(buf, { name: 'welcome.png' });
      await channel.send({ content: text, files: [file] });
      return;
    } catch (e) { console.error('[Welcome] card render failed, falling back:', e.message); }
  }

  const embed = new EmbedBuilder()
    .setTitle('Welcome!')
    .setDescription(text)
    .setColor(0x00cc66)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export async function handleLeave(member) {
  if (!isEnabled(member.guild.id, 'welcome')) return;
  const config = getConfig(member.guild.id);
  if (!config.welcomeChannel) return;

  const channel = await member.guild.channels.fetch(config.welcomeChannel).catch(() => null);
  if (!channel) return;

  const text = config.leaveMessage
    .replace(/{user}/g, member.user.tag)
    .replace(/{server}/g, member.guild.name);

  const embed = new EmbedBuilder()
    .setDescription(text)
    .setColor(0xcc6600)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export async function assignAutoRole(member) {
  const config = getConfig(member.guild.id);
  if (!config.autoRole) return;

  try {
    await member.roles.add(config.autoRole);
  } catch (e) {
    console.error(`[Roles] Failed to assign auto-role in ${member.guild.name}:`, e.message);
  }
}
