import { EmbedBuilder } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';
import { moderateContent, checkThresholds, formatCategory } from './moderation.js';
import { logAction } from './logging.js';
import { notifyOwner } from './ownerForward.js';

export async function scanMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content || message.content.trim().length === 0) return;

  const config = getConfig(message.guild.id);
  if (!config.automod.enabled) return;

  const isMod = config.modRoles.some(r => message.member?.roles.cache.has(r));
  if (isMod) return;

  const result = await moderateContent(message.content);
  if (!result.flagged) return;

  const violations = checkThresholds(result.scores, config.automod.level);
  if (violations.length === 0) return;

  const topViolation = violations.sort((a, b) => b.score - a.score)[0];
  const actions = config.automod.actions;

  if (actions.delete) {
    try {
      await message.delete();
    } catch (e) {
      console.error('[AutoMod] Failed to delete message:', e.message);
    }
  }

  if (actions.warn) {
    try {
      const dm = await message.author.createDM();
      await dm.send(
        `Your message in **${message.guild.name}** was flagged for: **${formatCategory(topViolation.category)}**. Please review the server rules.`
      );
    } catch {
      // DMs might be closed
    }
  }

  if (actions.mute && message.member?.moderatable) {
    try {
      await message.member.timeout(5 * 60 * 1000, `AutoMod: ${formatCategory(topViolation.category)}`);
    } catch (e) {
      console.error('[AutoMod] Failed to mute:', e.message);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('AutoMod Action')
    .setColor(0xff4444)
    .addFields(
      { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Violation', value: formatCategory(topViolation.category), inline: true },
      { name: 'Confidence', value: `${(topViolation.score * 100).toFixed(1)}%`, inline: true },
      { name: 'Content', value: message.content.substring(0, 1024) },
      { name: 'Actions Taken', value: [
        actions.delete && 'Deleted message',
        actions.warn && 'Warned user via DM',
        actions.mute && 'Muted for 5 minutes',
      ].filter(Boolean).join(', ') || 'None' },
    )
    .setTimestamp();

  if (actions.escalate) {
    const mentionRoles = config.modRoles.map(r => `<@&${r}>`).join(' ');
    if (mentionRoles) embed.setDescription(`Attention: ${mentionRoles}`);
  }

  await logAction(message.guild, embed);

  // Track warning count
  const warnings = config.warnings || {};
  const userId = message.author.id;
  warnings[userId] = (warnings[userId] || 0) + 1;
  updateConfig(message.guild.id, { warnings });

  // Forward repeat offenders to the owner/admins (Doll's only proactive ping)
  if (actions.escalate && warnings[userId] >= 3) {
    await notifyOwner(message.client, message.guild, {
      title: 'Repeat AutoMod offender',
      description: `<@${userId}> has been flagged **${warnings[userId]}** times. Latest: ${formatCategory(topViolation.category)} in <#${message.channel.id}>.`,
      level: 'warn',
    });
  }
}
