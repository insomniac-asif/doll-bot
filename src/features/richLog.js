// Richer audit logging — voice, nicknames, roles, channels. Posts to the
// configured logChannel, gated by per-category toggles in config.logging.

import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { logAction } from './logging.js';
import { isEnabled } from './featureToggle.js';

function enabled(guildId, category) {
  const config = getConfig(guildId);
  if (!config.logChannel) return false;
  if (!isEnabled(guildId, 'logging')) return false; // master switch
  return config.logging?.[category] ?? false;
}

// ── Voice ─────────────────────────────────────────────────────────────────

export async function logVoice(oldState, newState) {
  const guild = newState.guild;
  if (!enabled(guild.id, 'voice')) return;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const oldCh = oldState.channelId;
  const newCh = newState.channelId;
  if (oldCh === newCh) return; // mute/deaf change, not a move

  let title, desc, color;
  if (!oldCh && newCh) { title = '🔊 Voice Joined'; desc = `${member.displayName} joined ${newState.channel?.name}`; color = 0x57f287; }
  else if (oldCh && !newCh) { title = '🔇 Voice Left'; desc = `${member.displayName} left ${oldState.channel?.name}`; color = 0xed4245; }
  else { title = '🔀 Voice Moved'; desc = `${member.displayName}: ${oldState.channel?.name} → ${newState.channel?.name}`; color = 0x5865f2; }

  await logAction(guild, new EmbedBuilder().setTitle(title).setColor(color).setDescription(desc).setTimestamp());
}

// ── Member update (nickname + roles) ───────────────────────────────────────

export async function logMemberUpdate(oldMember, newMember) {
  const guild = newMember.guild;

  // Nickname change
  if (enabled(guild.id, 'nicknames') && oldMember.nickname !== newMember.nickname) {
    await logAction(guild, new EmbedBuilder()
      .setTitle('✏️ Nickname Changed')
      .setColor(0x5865f2)
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `${newMember.user.tag}`, inline: false },
        { name: 'Before', value: oldMember.nickname || '*(none)*', inline: true },
        { name: 'After', value: newMember.nickname || '*(none)*', inline: true },
      )
      .setTimestamp());
  }

  // Role changes
  if (enabled(guild.id, 'roles')) {
    const before = oldMember.roles.cache;
    const after = newMember.roles.cache;
    const added = after.filter(r => !before.has(r.id));
    const removed = before.filter(r => !after.has(r.id));

    if (added.size || removed.size) {
      const embed = new EmbedBuilder()
        .setTitle('🏷️ Roles Updated')
        .setColor(0xfee75c)
        .setDescription(`${newMember.user.tag}`)
        .setTimestamp();
      if (added.size) embed.addFields({ name: 'Added', value: added.map(r => `@${r.name}`).join(', ').substring(0, 1024) });
      if (removed.size) embed.addFields({ name: 'Removed', value: removed.map(r => `@${r.name}`).join(', ').substring(0, 1024) });
      await logAction(guild, embed);
    }
  }
}

// ── Channel create/delete ───────────────────────────────────────────────────

export async function logChannelCreate(channel) {
  if (!channel.guild || !enabled(channel.guild.id, 'channels')) return;
  await logAction(channel.guild, new EmbedBuilder()
    .setTitle('📁 Channel Created')
    .setColor(0x57f287)
    .setDescription(`**${channel.name}** (${channelTypeName(channel.type)})`)
    .setTimestamp());
}

export async function logChannelDelete(channel) {
  if (!channel.guild || !enabled(channel.guild.id, 'channels')) return;
  await logAction(channel.guild, new EmbedBuilder()
    .setTitle('🗑️ Channel Deleted')
    .setColor(0xed4245)
    .setDescription(`**${channel.name}** (${channelTypeName(channel.type)})`)
    .setTimestamp());
}

// ── Role create/delete ──────────────────────────────────────────────────────

export async function logRoleCreate(role) {
  if (!enabled(role.guild.id, 'roles')) return;
  await logAction(role.guild, new EmbedBuilder()
    .setTitle('🏷️ Role Created').setColor(0x57f287).setDescription(`@${role.name}`).setTimestamp());
}

export async function logRoleDelete(role) {
  if (!enabled(role.guild.id, 'roles')) return;
  await logAction(role.guild, new EmbedBuilder()
    .setTitle('🏷️ Role Deleted').setColor(0xed4245).setDescription(`@${role.name}`).setTimestamp());
}

function channelTypeName(type) {
  return { 0: 'text', 2: 'voice', 4: 'category', 5: 'announcement', 13: 'stage', 15: 'forum' }[type] || 'channel';
}
