// Invite management tools — create, revoke, list.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel, resolveMemberFetch } from '../features/resolvers.js';
import { logAction, modActionEmbed } from '../features/logging.js';
import { recordUndo } from '../features/undoStack.js';

// ── create_invite ───────────────────────────────────────────────────────

registerTool('create_invite', {
  category: 'invite',
  description: 'Create a server invite link with optional expiry and max uses',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel for the invite (defaults to current)' },
      max_age: { type: 'number', description: 'Expire after N seconds (0 = never, default 86400 = 24h)' },
      max_uses: { type: 'number', description: 'Max uses (0 = unlimited)' },
      temporary: { type: 'boolean', description: 'Grant temporary membership' },
    },
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;

    const invite = await ch.createInvite({
      maxAge: params.max_age ?? 86400,
      maxUses: params.max_uses ?? 0,
      temporary: params.temporary ?? false,
      reason: 'Created via AI',
    });

    recordUndo(guild, `created invite discord.gg/${invite.code}`, 'revoke_invite', { code: invite.code });
    const expiry = invite.maxAge === 0 ? 'never expires' : `expires in ${invite.maxAge / 3600}h`;
    const uses = invite.maxUses === 0 ? 'unlimited uses' : `${invite.maxUses} uses`;
    return `created invite: discord.gg/${invite.code} (${expiry}, ${uses})`;
  },
});

// ── revoke_invite ───────────────────────────────────────────────────────

registerTool('revoke_invite', {
  category: 'invite',
  description: 'Revoke (delete) a specific invite by code, or the most recent invite by a user',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Invite code to revoke' },
      created_by: { type: 'string', description: 'Delete the most recent invite by this user' },
    },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, member }) {
    const invites = await guild.invites.fetch();

    let invite;
    if (params.code) {
      // Strip full URL if provided
      const code = params.code.replace(/^.*discord\.gg\//, '').replace(/^.*invite\//, '');
      invite = invites.find(i => i.code === code);
    } else if (params.created_by) {
      const creator = await resolveMemberFetch(guild, params.created_by);
      if (creator) {
        invite = invites
          .filter(i => i.inviter?.id === creator.id)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          .first();
      }
    }

    if (!invite) return `couldn't find an invite matching those criteria`;
    const code = invite.code;
    await invite.delete(`Revoked by ${member.displayName} via AI`);

    await logAction(guild, modActionEmbed({
      action: 'clear', target: `invite ${code}`, moderator: member.displayName, reason: 'Invite revoked via AI',
    }));
    return `revoked invite discord.gg/${code}`;
  },
});

// ── revoke_all_invites ──────────────────────────────────────────────────

registerTool('revoke_all_invites', {
  category: 'invite',
  description: 'Revoke ALL server invites. Use with caution.',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.OWNER,
  confirm: true,
  preview() {
    return `i'm about to **revoke every invite** for this server. existing invite links will all stop working. confirm?`;
  },
  async execute(_params, { guild, member }) {
    const invites = await guild.invites.fetch();
    let count = 0;
    for (const [, inv] of invites) {
      try { await inv.delete(`Bulk revoke by ${member.displayName}`); count++; } catch { /* skip */ }
    }
    await logAction(guild, modActionEmbed({
      action: 'clear', target: `${count} invites`, moderator: member.displayName, reason: 'All invites revoked',
    }));
    return `revoked all ${count} invites`;
  },
});

// ── list_invites ────────────────────────────────────────────────────────

registerTool('list_invites', {
  category: 'invite',
  description: 'List all active server invites, optionally filtered by creator',
  parameters: {
    type: 'object',
    properties: { created_by: { type: 'string', description: 'Filter by who created the invite' } },
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const invites = await guild.invites.fetch();
    let list = [...invites.values()];

    if (params.created_by) {
      const creator = await resolveMemberFetch(guild, params.created_by);
      if (creator) list = list.filter(i => i.inviter?.id === creator.id);
    }

    if (list.length === 0) return 'no active invites';

    const lines = list.slice(0, 20).map(i => {
      const by = i.inviter?.username || 'unknown';
      const uses = `${i.uses || 0}${i.maxUses ? `/${i.maxUses}` : ''} uses`;
      const age = i.maxAge === 0 ? 'permanent' : `expires <t:${Math.floor((i.createdTimestamp + i.maxAge * 1000) / 1000)}:R>`;
      return `discord.gg/${i.code} — by ${by}, ${uses}, ${age}`;
    });

    const extra = list.length > 20 ? `\n(showing 20 of ${list.length})` : '';
    return `active invites:\n${lines.join('\n')}${extra}`;
  },
});
