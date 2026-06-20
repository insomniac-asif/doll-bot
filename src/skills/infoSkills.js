// Info/read-only tools — levels, leaderboard, voice time, activity checks.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { getRank, getLeaderboard } from '../features/leveling.js';
import { getBalance, leaderboard as ecoLeaderboard } from '../features/economy.js';
import { resolveMemberFetch } from '../features/resolvers.js';

// ── check_level ─────────────────────────────────────────────────────────

registerTool('check_level', {
  category: 'info',
  description: 'Check a member\'s level, XP, and rank position',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'Member to check (default: the person asking)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, member }) {
    const targetId = params.user
      ? (await resolveMemberFetch(guild, params.user))?.id
      : member.id;
    if (!targetId) return `couldn't find member "${params.user}"`;

    const target = guild.members.cache.get(targetId);
    const rank = getRank(guild.id, targetId);
    return [
      `${target?.displayName || 'user'} — rank #${rank.rank} of ${rank.total}`,
      `level ${rank.level}`,
      `xp: ${rank.into}/${rank.needed} (${rank.xp} total)`,
    ].join('\n');
  },
});

// ── show_leaderboard ────────────────────────────────────────────────────

registerTool('show_leaderboard', {
  category: 'info',
  description: 'Show the server XP leaderboard',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number', description: 'How many to show (default 10, max 25)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const limit = Math.min(25, params.limit || 10);
    const lb = getLeaderboard(guild.id, limit);

    if (lb.length === 0) return 'no one has earned XP yet';

    const lines = lb.map(e => {
      const name = guild.members.cache.get(e.id)?.displayName || e.id;
      return `${e.position}. ${name} — level ${e.level} (${e.xp} xp)`;
    });
    return `xp leaderboard:\n${lines.join('\n')}`;
  },
});

// ── check_balance ───────────────────────────────────────────────────────

registerTool('check_balance', {
  category: 'info',
  description: 'Check a member\'s coin balance',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'Member to check (default: the person asking)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, member }) {
    const target = params.user
      ? await resolveMemberFetch(guild, params.user)
      : member;
    if (!target) return `couldn't find member "${params.user}"`;

    const bal = getBalance(guild.id, target.id);
    return `${target.displayName} has ${bal} coins`;
  },
});

// ── richest_leaderboard ─────────────────────────────────────────────────

registerTool('richest_leaderboard', {
  category: 'info',
  description: 'Show the richest members by coins',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number', description: 'How many to show (default 10)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const limit = Math.min(25, params.limit || 10);
    const lb = ecoLeaderboard(guild.id, limit);

    if (lb.length === 0) return 'no one has coins yet';

    const lines = lb.map(e => {
      const name = guild.members.cache.get(e.id)?.displayName || e.id;
      return `${e.position}. ${name} — ${e.balance} coins`;
    });
    return `richest members:\n${lines.join('\n')}`;
  },
});

// ── check_activity ──────────────────────────────────────────────────────

registerTool('check_activity', {
  category: 'info',
  description: 'Check what a member is currently doing — game, Spotify, custom status, voice state',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'Member to check' } },
    required: ['user'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;

    const lines = [`${target.displayName}'s activity:`];

    // Status
    const status = target.presence?.status || 'offline';
    lines.push(`status: ${status}`);

    // Activities
    const activities = target.presence?.activities || [];
    for (const act of activities) {
      switch (act.type) {
        case 0: lines.push(`playing: ${act.name}${act.details ? ` — ${act.details}` : ''}`); break;
        case 1: lines.push(`streaming: ${act.name} (${act.url || ''})`); break;
        case 2: lines.push(`listening to: ${act.details || ''} by ${act.state || ''} on ${act.name}`); break;
        case 3: lines.push(`watching: ${act.name}`); break;
        case 4: lines.push(`custom: ${act.state || act.name || ''}`); break;
        case 5: lines.push(`competing in: ${act.name}`); break;
      }
    }

    // Voice state
    if (target.voice?.channel) {
      lines.push(`in voice: #${target.voice.channel.name}${target.voice.selfMute ? ' (muted)' : ''}${target.voice.selfDeaf ? ' (deafened)' : ''}`);
    }

    if (activities.length === 0 && !target.voice?.channel) {
      lines.push('not doing anything visible right now');
    }

    return lines.join('\n');
  },
});
