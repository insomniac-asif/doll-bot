// Server awareness: builds a compact text block of channels, roles, and members
// injected into the AI system prompt so Doll knows what someone means by
// "the rules channel" or "the mod role" without needing IDs.

import { ChannelType } from 'discord.js';

// Returns a string block for the system prompt.
export function getServerContext(guild) {
  if (!guild) return '';

  // ── Channels ───────────────────────────────────────────
  const categories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  const channelLines = [];
  for (const cat of categories.values()) {
    const children = guild.channels.cache
      .filter(c => c.parentId === cat.id && c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position)
      .map(c => {
        const prefix = c.type === ChannelType.GuildVoice ? '🔊' : '#';
        return `  ${prefix}${c.name}`;
      });
    channelLines.push(`📁 ${cat.name}\n${children.join('\n')}`);
  }

  // Uncategorized channels
  const uncategorized = guild.channels.cache
    .filter(c => !c.parentId && c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map(c => `#${c.name}`);
  if (uncategorized.length) channelLines.unshift(uncategorized.join(', '));

  // ── Roles ──────────────────────────────────────────────
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id) // exclude @everyone
    .sort((a, b) => b.position - a.position)
    .map(r => {
      const extra = [];
      if (r.permissions.has('Administrator')) extra.push('admin');
      if (r.permissions.has('ManageGuild')) extra.push('manage-server');
      if (r.permissions.has('ModerateMembers')) extra.push('mod');
      return `@${r.name}${extra.length ? ` (${extra.join(', ')})` : ''} — ${r.members.size} members`;
    });

  // ── Members (top 30 by activity presence) ──────────────
  const memberList = guild.members.cache
    .filter(m => !m.user.bot)
    .sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0))
    .first(30)
    .map(m => {
      const topRole = m.roles.highest.id !== guild.id ? m.roles.highest.name : null;
      return `${m.displayName}${topRole ? ` [${topRole}]` : ''}`;
    });

  const ownerTag = guild.members.cache.get(guild.ownerId)?.displayName || 'unknown';

  return `

server map for ${guild.name} (owner: ${ownerTag}, ${guild.memberCount} members):

channels:
${channelLines.join('\n')}

roles (highest first):
${roles.slice(0, 25).join('\n')}

members you might see:
${memberList.join(', ')}

use these EXACT channel and role names when referring to them — never IDs. if someone says "the rules channel" or "mod role", match it to the closest name above.`;
}

// ── Backfill ─────────────────────────────────────────────────────────────
// On join or startup, read recent messages from key channels to build initial
// awareness. Stores a summary in memory, not the raw messages.
export async function backfillGuild(guild) {
  const summary = [];
  const textChannels = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText && c.viewable)
    .sort((a, b) => a.position - b.position)
    .first(15);

  for (const channel of textChannels) {
    try {
      const msgs = await channel.messages.fetch({ limit: 30 });
      const authors = new Set();
      let topics = [];
      for (const m of msgs.values()) {
        if (!m.author.bot) authors.add(m.member?.displayName || m.author.username);
        if (m.content?.length > 20) topics.push(m.content.substring(0, 100));
      }
      if (authors.size > 0) {
        summary.push(`#${channel.name}: ${authors.size} active users (${[...authors].slice(0, 5).join(', ')}), ${msgs.size} recent messages`);
      }
    } catch {
      // no perms for this channel
    }
  }

  console.log(`[Awareness] Backfilled ${guild.name}: ${summary.length} channels scanned`);
  return summary;
}
