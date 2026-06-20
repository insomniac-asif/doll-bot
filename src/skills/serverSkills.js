// Server management tools — server info, edit server, audit log, stats.

import { AuditLogEvent } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';

// ── view_server_info ────────────────────────────────────────────────────

registerTool('view_server_info', {
  category: 'server',
  description: 'Get full server overview — members, channels, roles, boosts, features, owner',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const text = guild.channels.cache.filter(c => c.type === 0).size;
    const voice = guild.channels.cache.filter(c => c.type === 2).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;
    const roles = guild.roles.cache.size - 1; // exclude @everyone
    const owner = await guild.fetchOwner().catch(() => null);

    return [
      `${guild.name}`,
      `owner: ${owner?.displayName || 'unknown'}`,
      `members: ${guild.memberCount} (${guild.members.cache.filter(m => !m.user.bot).size} humans)`,
      `channels: ${text} text, ${voice} voice, ${categories} categories`,
      `roles: ${roles}`,
      `boosts: level ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`,
      `verification: ${['none', 'low', 'medium', 'high', 'very high'][guild.verificationLevel] || guild.verificationLevel}`,
      `created: <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
      guild.description ? `description: ${guild.description}` : null,
      guild.features.length ? `features: ${guild.features.slice(0, 10).join(', ')}` : null,
    ].filter(Boolean).join('\n');
  },
});

// ── server_stats ────────────────────────────────────────────────────────

registerTool('server_stats', {
  category: 'server',
  description: 'Quick server statistics — member counts, channel breakdown, role count, boost level',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const humans = guild.members.cache.filter(m => !m.user.bot).size;
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
    const text = guild.channels.cache.filter(c => c.type === 0).size;
    const voice = guild.channels.cache.filter(c => c.type === 2).size;

    return [
      `${guild.name} stats:`,
      `total members: ${guild.memberCount} (${humans} humans, ${bots} bots)`,
      `online now: ~${online}`,
      `channels: ${text} text, ${voice} voice`,
      `roles: ${guild.roles.cache.size - 1}`,
      `boost level: ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`,
    ].join('\n');
  },
});

// ── edit_server ─────────────────────────────────────────────────────────

registerTool('edit_server', {
  category: 'server',
  description: 'Edit server settings — name, description, verification level, default notifications, AFK channel/timeout',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'New server name' },
      description: { type: 'string', description: 'Server description' },
      verification_level: { type: 'number', description: '0=none, 1=low, 2=medium, 3=high, 4=very high' },
      default_notifications: { type: 'number', description: '0=all messages, 1=mentions only' },
      afk_channel: { type: 'string', description: 'AFK voice channel name' },
      afk_timeout: { type: 'number', description: 'AFK timeout in seconds (60, 300, 900, 1800, 3600)' },
    },
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { guild }) {
    const edits = {};
    const changes = [];

    if (params.name) { edits.name = params.name; changes.push(`name: ${params.name}`); }
    if (params.description !== undefined) { edits.description = params.description; changes.push('description updated'); }
    if (params.verification_level !== undefined) {
      edits.verificationLevel = params.verification_level;
      changes.push(`verification: ${['none', 'low', 'medium', 'high', 'very high'][params.verification_level]}`);
    }
    if (params.default_notifications !== undefined) {
      edits.defaultMessageNotifications = params.default_notifications;
      changes.push(`notifications: ${params.default_notifications === 0 ? 'all messages' : 'mentions only'}`);
    }
    if (params.afk_timeout) { edits.afkTimeout = params.afk_timeout; changes.push(`afk timeout: ${params.afk_timeout}s`); }

    if (changes.length === 0) return 'no changes specified';
    await guild.edit(edits);
    return `updated server settings: ${changes.join(', ')}`;
  },
});

// ── view_audit_log ──────────────────────────────────────────────────────

const AUDIT_ACTIONS = {
  channel_create: AuditLogEvent.ChannelCreate,
  channel_delete: AuditLogEvent.ChannelDelete,
  channel_update: AuditLogEvent.ChannelUpdate,
  role_create: AuditLogEvent.RoleCreate,
  role_delete: AuditLogEvent.RoleDelete,
  role_update: AuditLogEvent.RoleUpdate,
  member_kick: AuditLogEvent.MemberKick,
  member_ban: AuditLogEvent.MemberBanAdd,
  member_unban: AuditLogEvent.MemberBanRemove,
  member_update: AuditLogEvent.MemberUpdate,
  member_role_update: AuditLogEvent.MemberRoleUpdate,
  message_delete: AuditLogEvent.MessageDelete,
  message_bulk_delete: AuditLogEvent.MessageBulkDelete,
  invite_create: AuditLogEvent.InviteCreate,
  invite_delete: AuditLogEvent.InviteDelete,
  emoji_create: AuditLogEvent.EmojiCreate,
  emoji_delete: AuditLogEvent.EmojiDelete,
  guild_update: AuditLogEvent.GuildUpdate,
};

registerTool('view_audit_log', {
  category: 'server',
  description: 'View the server audit log. Filter by action type (channel_create, channel_delete, role_create, role_delete, member_kick, member_ban, message_delete, etc.) or by user.',
  parameters: {
    type: 'object',
    properties: {
      action_type: { type: 'string', description: 'Action type filter (e.g. member_kick, channel_delete, role_update)' },
      user: { type: 'string', description: 'Filter by who performed the action' },
      limit: { type: 'number', description: 'How many entries to show (default 10, max 25)' },
    },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const fetchOpts = { limit: Math.min(25, params.limit || 10) };

    if (params.action_type && AUDIT_ACTIONS[params.action_type] !== undefined) {
      fetchOpts.type = AUDIT_ACTIONS[params.action_type];
    }

    const logs = await guild.fetchAuditLogs(fetchOpts);
    let entries = [...logs.entries.values()];

    // Filter by user if specified
    if (params.user) {
      const q = params.user.toLowerCase();
      entries = entries.filter(e =>
        e.executor?.username?.toLowerCase().includes(q) ||
        e.executor?.tag?.toLowerCase().includes(q) ||
        e.executor?.id === params.user
      );
    }

    if (entries.length === 0) return 'no audit log entries found with those filters';

    const lines = entries.map(e => {
      const who = e.executor?.username || 'unknown';
      const what = e.action;
      const target = e.target?.name || e.target?.tag || e.target?.username || e.targetId || '';
      const when = `<t:${Math.floor(e.createdTimestamp / 1000)}:R>`;
      const reason = e.reason ? ` — ${e.reason}` : '';
      return `${who} → ${what} on ${target} ${when}${reason}`;
    });

    return `audit log:\n${lines.join('\n')}`;
  },
});
