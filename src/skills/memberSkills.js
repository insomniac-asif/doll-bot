// Member management tools — nickname, info, ban list, unban, prune.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveMember, resolveMemberFetch } from '../features/resolvers.js';
import { logAction, modActionEmbed } from '../features/logging.js';
import { recordUndo } from '../features/undoStack.js';

// ── set_nickname ────────────────────────────────────────────────────────

registerTool('set_nickname', {
  category: 'member',
  description: 'Set or remove a member\'s nickname. Pass empty string to remove.',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member name or mention' },
      nickname: { type: 'string', description: 'New nickname (empty string to remove)' },
    },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;

    const oldNick = target.nickname;
    const nick = params.nickname ?? '';
    await target.setNickname(nick || null, `Set by ${member.displayName} via AI`);
    recordUndo(guild, `changed ${target.user.username}'s nickname`, 'restore_nick', { userId: target.id, nick: oldNick });
    return nick ? `set ${target.user.username}'s nickname to "${nick}"` : `removed ${target.user.username}'s nickname`;
  },
});

// ── member_info ─────────────────────────────────────────────────────────

registerTool('member_info', {
  category: 'member',
  description: 'Get detailed info about a server member — roles, join date, account age, boost status, etc.',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'Member name or mention' } },
    required: ['user'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;

    const roles = target.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `@${r.name}`);

    const lines = [
      `${target.displayName} (${target.user.tag})`,
      `id: ${target.id}`,
      `joined server: <t:${Math.floor(target.joinedTimestamp / 1000)}:R>`,
      `account created: <t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`,
      `roles (${roles.length}): ${roles.slice(0, 20).join(', ') || 'none'}`,
      `highest role: @${target.roles.highest.name}`,
    ];

    if (target.premiumSinceTimestamp) {
      lines.push(`boosting since: <t:${Math.floor(target.premiumSinceTimestamp / 1000)}:R>`);
    }
    if (target.communicationDisabledUntilTimestamp) {
      lines.push(`timed out until: <t:${Math.floor(target.communicationDisabledUntilTimestamp / 1000)}:R>`);
    }
    if (target.voice?.channel) {
      lines.push(`in voice: #${target.voice.channel.name}`);
    }

    return lines.join('\n');
  },
});

// ── server_ban_list ─────────────────────────────────────────────────────

registerTool('server_ban_list', {
  category: 'member',
  description: 'List all banned users in the server, optionally search by name',
  parameters: {
    type: 'object',
    properties: { search: { type: 'string', description: 'Search term to filter bans' } },
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const bans = await guild.bans.fetch();
    let list = [...bans.values()];

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(b =>
        b.user.username.toLowerCase().includes(q) ||
        b.user.tag?.toLowerCase().includes(q) ||
        b.reason?.toLowerCase().includes(q)
      );
    }

    if (list.length === 0) return params.search ? `no bans matching "${params.search}"` : 'no one is banned';

    const lines = list.slice(0, 25).map(b =>
      `${b.user.tag} — ${b.reason || 'no reason'}`
    );
    const extra = list.length > 25 ? `\n(showing 25 of ${list.length})` : '';
    return `banned users:\n${lines.join('\n')}${extra}`;
  },
});

// ── unban ───────────────────────────────────────────────────────────────

registerTool('unban', {
  category: 'member',
  description: 'Unban a user by name or ID',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Username, tag, or ID of the banned user' },
      reason: { type: 'string', description: 'Reason for unbanning' },
    },
    required: ['user'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, member }) {
    const bans = await guild.bans.fetch();
    const q = params.user.toLowerCase();

    // Try by ID first
    let ban = bans.get(params.user);
    if (!ban) {
      // Try by name
      ban = bans.find(b =>
        b.user.username.toLowerCase() === q ||
        b.user.tag?.toLowerCase() === q ||
        b.user.username.toLowerCase().includes(q)
      );
    }

    if (!ban) return `couldn't find a banned user matching "${params.user}"`;

    await guild.bans.remove(ban.user.id, params.reason || `Unbanned by ${member.displayName} via AI`);
    await logAction(guild, modActionEmbed({
      action: 'ban', target: ban.user.tag, moderator: member.displayName,
      reason: `Unbanned: ${params.reason || 'no reason'}`,
    }));
    return `unbanned ${ban.user.tag}`;
  },
});

// ── prune_members ───────────────────────────────────────────────────────

registerTool('prune_members', {
  category: 'member',
  description: 'Prune (kick) inactive members who haven\'t been online for N days. Dry run by default — set confirm=true to actually prune.',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Days of inactivity (1-30, default 7)' },
      confirm: { type: 'boolean', description: 'Set to true to actually prune (default: dry run)' },
    },
  },
  permLevel: PermLevel.OWNER,
  confirm: true,
  async preview(params, { guild }) {
    const days = Math.min(30, Math.max(1, params.days || 7));
    let count = '?';
    try { count = await guild.members.prune({ days, dry: true }); } catch { /* ignore */ }
    return `i'm about to **prune ${count} members** who've been inactive for ${days}+ days and have no roles. they'd be removed from the server (can rejoin via invite). confirm?`;
  },
  async execute(params, { guild, member }) {
    const days = Math.min(30, Math.max(1, params.days || 7));

    if (params.confirm === false) {
      const count = await guild.members.prune({ days, dry: true });
      return `dry run: ${count} members would be pruned (inactive for ${days}+ days)`;
    }

    const pruned = await guild.members.prune({ days, reason: `Pruned by ${member.displayName} via AI` });
    await logAction(guild, modActionEmbed({
      action: 'kick', target: `${pruned} members`, moderator: member.displayName,
      reason: `Pruned: inactive for ${days}+ days`,
    }));
    return `pruned ${pruned} inactive members (${days}+ days)`;
  },
});
