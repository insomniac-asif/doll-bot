// Moderation tools — kick, ban, mute/timeout, warn, slowmode, purge,
// lock/unlock server, check warnings.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveMember, resolveMemberFetch, resolveChannel } from '../features/resolvers.js';
import { logAction, modActionEmbed } from '../features/logging.js';
import { getConfig, saveConfig } from '../config.js';
import { recordUndo } from '../features/undoStack.js';

// ── kick_member ─────────────────────────────────────────────────────────

registerTool('kick_member', {
  category: 'mod',
  description: 'Kick a member from the server',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to kick' },
      reason: { type: 'string', description: 'Reason for kick' },
    },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    if (!target.kickable) return `i can't kick ${target.displayName} — they have higher permissions than me`;
    if (target.id === member.id) return `you can't kick yourself`;
    if (target.id === guild.ownerId) return `can't kick the server owner`;

    const name = target.displayName;
    await target.kick(params.reason || `Kicked by ${member.displayName} via AI`);
    await logAction(guild, modActionEmbed({
      action: 'kick', target: name, moderator: member.displayName, reason: params.reason || 'No reason',
    }));
    return `kicked ${name}${params.reason ? ` — ${params.reason}` : ''}`;
  },
});

// ── ban_member ──────────────────────────────────────────────────────────

registerTool('ban_member', {
  category: 'mod',
  description: 'Ban a member from the server',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to ban' },
      reason: { type: 'string', description: 'Reason for ban' },
      delete_days: { type: 'number', description: 'Days of messages to delete (0-7, default 0)' },
    },
    required: ['user'],
  },
  permLevel: PermLevel.ADMIN,
  confirm: true,
  async preview(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `i couldn't find "${params.user}" — who exactly do you want banned?`;
    return `i'm about to **ban ${target.displayName}** (${target.user.tag})${params.reason ? ` for: ${params.reason}` : ''}. they'll be removed and blocked from rejoining.`;
  },
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    if (!target.bannable) return `i can't ban ${target.displayName} — they outrank me`;
    if (target.id === member.id) return `you can't ban yourself`;
    if (target.id === guild.ownerId) return `can't ban the server owner`;

    const name = target.displayName;
    const deleteMessageSeconds = Math.min(7, Math.max(0, params.delete_days || 0)) * 86400;
    await guild.members.ban(target, {
      reason: params.reason || `Banned by ${member.displayName} via AI`,
      deleteMessageSeconds,
    });
    recordUndo(guild, `banned ${name}`, 'unban', { userId: target.id });
    await logAction(guild, modActionEmbed({
      action: 'ban', target: name, moderator: member.displayName, reason: params.reason || 'No reason',
    }));
    return `banned ${name}${params.reason ? ` — ${params.reason}` : ''}`;
  },
});

// ── timeout_member ──────────────────────────────────────────────────────

registerTool('timeout_member', {
  category: 'mod',
  description: 'Timeout (mute) a member for a specified duration',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to timeout' },
      duration_minutes: { type: 'number', description: 'Duration in minutes (1 to 40320 = 28 days)' },
      reason: { type: 'string', description: 'Reason for timeout' },
    },
    required: ['user', 'duration_minutes'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    if (!target.moderatable) return `i can't timeout ${target.displayName}`;

    const mins = Math.min(40320, Math.max(1, params.duration_minutes));
    await target.timeout(mins * 60 * 1000, params.reason || `Timed out by ${member.displayName}`);
    recordUndo(guild, `timed out ${target.displayName}`, 'remove_timeout', { userId: target.id });
    await logAction(guild, modActionEmbed({
      action: 'mute', target: target.displayName, moderator: member.displayName,
      reason: params.reason || 'No reason', extra: { Duration: `${mins} minutes` },
    }));

    const display = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`;
    return `timed out ${target.displayName} for ${display}${params.reason ? ` — ${params.reason}` : ''}`;
  },
});

// ── remove_timeout ──────────────────────────────────────────────────────

registerTool('remove_timeout', {
  category: 'mod',
  description: 'Remove a timeout from a member',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'Member to untimeout' } },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    await target.timeout(null, `Timeout removed by ${member.displayName}`);
    await logAction(guild, modActionEmbed({
      action: 'unmute', target: target.displayName, moderator: member.displayName, reason: 'Timeout removed via AI',
    }));
    return `removed timeout from ${target.displayName}`;
  },
});

// ── warn_member ─────────────────────────────────────────────────────────

registerTool('warn_member', {
  category: 'mod',
  description: 'Issue a warning to a member',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to warn' },
      reason: { type: 'string', description: 'Reason for warning' },
    },
    required: ['user', 'reason'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;

    const config = getConfig(guild.id);
    if (!config.warnings[target.id]) config.warnings[target.id] = [];
    config.warnings[target.id].push({
      reason: params.reason,
      by: member.id,
      at: Date.now(),
    });
    saveConfig(guild.id, config);

    const count = config.warnings[target.id].length;
    await logAction(guild, modActionEmbed({
      action: 'warn', target: target.displayName, moderator: member.displayName,
      reason: params.reason, extra: { 'Total Warnings': String(count) },
    }));
    return `warned ${target.displayName}: ${params.reason} (warning #${count})`;
  },
});

// ── check_warnings ──────────────────────────────────────────────────────

registerTool('check_warnings', {
  category: 'mod',
  description: 'Check a member\'s warning history',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'Member to check' } },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;

    const config = getConfig(guild.id);
    const warns = config.warnings[target.id] || [];
    if (warns.length === 0) return `${target.displayName} has no warnings`;

    const recent = warns.slice(-5).map((w, i) => {
      const date = new Date(w.at).toLocaleDateString();
      return `${warns.length - 4 + i}. ${w.reason} (${date})`;
    });
    return `${target.displayName} — ${warns.length} warning(s):\n${recent.join('\n')}`;
  },
});

// ── slowmode ────────────────────────────────────────────────────────────

registerTool('slowmode', {
  category: 'mod',
  description: 'Set slowmode on a channel (0 to disable, max 21600 seconds)',
  parameters: {
    type: 'object',
    properties: {
      seconds: { type: 'number', description: 'Slowmode delay in seconds (0 = off)' },
      channel: { type: 'string', description: 'Channel (defaults to current)' },
    },
    required: ['seconds'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;
    const secs = Math.min(21600, Math.max(0, params.seconds));
    await ch.setRateLimitPerUser(secs);
    return secs > 0 ? `set ${secs}s slowmode on #${ch.name}` : `disabled slowmode on #${ch.name}`;
  },
});

// ── purge_user ──────────────────────────────────────────────────────────

registerTool('purge_user', {
  category: 'mod',
  description: 'Delete recent messages from a specific user in a channel',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'User whose messages to delete' },
      channel: { type: 'string', description: 'Channel (defaults to current)' },
      limit: { type: 'number', description: 'Max messages to scan (default 50, max 100)' },
    },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel, member }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;

    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const msgs = await ch.messages.fetch({ limit });
    const twoWeeks = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const toDelete = msgs.filter(m => m.author.id === target.id && m.createdTimestamp > twoWeeks);

    if (toDelete.size === 0) return `no recent messages from ${target.displayName} in #${ch.name}`;
    const deleted = await ch.bulkDelete(toDelete);

    await logAction(guild, modActionEmbed({
      action: 'clear', target: `${deleted.size} messages by ${target.displayName}`,
      moderator: member.displayName, reason: `Purged in #${ch.name}`,
    }));
    return `deleted ${deleted.size} messages from ${target.displayName} in #${ch.name}`;
  },
});

// ── lock_server ─────────────────────────────────────────────────────────

registerTool('lock_server', {
  category: 'mod',
  description: 'Lock down the entire server — deny SendMessages on ALL text channels for @everyone',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.OWNER,
  confirm: true,
  preview() {
    return `i'm about to **lock the entire server** — no one but staff will be able to send messages in any channel. confirm?`;
  },
  async execute(_params, { guild, member }) {
    const textChannels = guild.channels.cache.filter(c => c.type === 0); // GuildText = 0
    let count = 0;
    for (const [, ch] of textChannels) {
      try {
        await ch.permissionOverwrites.edit(guild.id, { SendMessages: false });
        count++;
      } catch { /* skip channels we can't edit */ }
    }
    await logAction(guild, modActionEmbed({
      action: 'mute', target: 'Entire Server', moderator: member.displayName, reason: 'Server lockdown',
    }));
    return `server locked — disabled sending in ${count} channels`;
  },
});

// ── unlock_server ───────────────────────────────────────────────────────

registerTool('unlock_server', {
  category: 'mod',
  description: 'Unlock the entire server — reset SendMessages on ALL text channels for @everyone',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.OWNER,
  async execute(_params, { guild, member }) {
    const textChannels = guild.channels.cache.filter(c => c.type === 0);
    let count = 0;
    for (const [, ch] of textChannels) {
      try {
        await ch.permissionOverwrites.edit(guild.id, { SendMessages: null });
        count++;
      } catch { /* skip */ }
    }
    await logAction(guild, modActionEmbed({
      action: 'unmute', target: 'Entire Server', moderator: member.displayName, reason: 'Server unlocked',
    }));
    return `server unlocked — reset sending in ${count} channels`;
  },
});
