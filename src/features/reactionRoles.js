import { getConfig, updateConfig } from '../config.js';
import { isEnabled } from './featureToggle.js';

// Resolve a stable key for an emoji (custom emoji -> id, unicode -> char)
export function emojiKey(emoji) {
  return emoji.id || emoji.name;
}

// Store a reaction-role mapping for a posted panel message
export function linkRole(guildId, messageId, channelId, emoji, roleId) {
  const config = getConfig(guildId);
  const rr = config.reactionRoles || {};
  if (!rr[messageId]) rr[messageId] = { channelId, roles: {} };
  rr[messageId].channelId = channelId;
  rr[messageId].roles[emojiKey(emoji)] = roleId;
  updateConfig(guildId, { reactionRoles: rr });
}

export function unlinkRole(guildId, messageId, emoji) {
  const config = getConfig(guildId);
  const rr = config.reactionRoles || {};
  if (rr[messageId]?.roles) {
    delete rr[messageId].roles[emojiKey(emoji)];
    if (Object.keys(rr[messageId].roles).length === 0) delete rr[messageId];
    updateConfig(guildId, { reactionRoles: rr });
  }
}

function lookupRole(guildId, messageId, emoji) {
  const config = getConfig(guildId);
  const panel = config.reactionRoles?.[messageId];
  if (!panel) return null;
  return panel.roles[emojiKey(emoji)] || null;
}

export async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  const message = reaction.message;
  if (!message.guild) return;
  if (!isEnabled(message.guild.id, 'reactionRoles')) return;

  const roleId = lookupRole(message.guild.id, message.id, reaction.emoji);
  if (!roleId) return;

  try {
    const member = await message.guild.members.fetch(user.id);
    await member.roles.add(roleId);
  } catch (e) {
    console.error('[ReactionRoles] Failed to add role:', e.message);
  }
}

export async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  const message = reaction.message;
  if (!message.guild) return;
  if (!isEnabled(message.guild.id, 'reactionRoles')) return;

  const roleId = lookupRole(message.guild.id, message.id, reaction.emoji);
  if (!roleId) return;

  try {
    const member = await message.guild.members.fetch(user.id);
    await member.roles.remove(roleId);
  } catch (e) {
    console.error('[ReactionRoles] Failed to remove role:', e.message);
  }
}
