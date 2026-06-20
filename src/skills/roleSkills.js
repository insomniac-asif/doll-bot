// Role management tools — create, delete, edit, assign, remove, info, list members.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveRole, resolveMemberFetch, resolvePermissions, prettyPerm, DANGEROUS_PERMS } from '../features/resolvers.js';
import { logAction, modActionEmbed } from '../features/logging.js';
import { recordUndo } from '../features/undoStack.js';

// ── create_role ─────────────────────────────────────────────────────────

registerTool('create_role', {
  category: 'role',
  description: 'Create a new role in the server with optional color and settings',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Role name' },
      color: { type: 'string', description: 'Hex color (e.g. "#ff69b4") or color name' },
      hoist: { type: 'boolean', description: 'Show role members separately in sidebar' },
      mentionable: { type: 'boolean', description: 'Allow anyone to @mention this role' },
    },
    required: ['name'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, member }) {
    const opts = { name: params.name };
    if (params.color) opts.color = params.color;
    if (params.hoist !== undefined) opts.hoist = params.hoist;
    if (params.mentionable !== undefined) opts.mentionable = params.mentionable;

    const role = await guild.roles.create(opts);
    recordUndo(guild, `created role @${role.name}`, 'delete_role', { roleId: role.id });
    await logAction(guild, modActionEmbed({
      action: 'clear', target: `@${role.name}`, moderator: member.displayName,
      reason: 'Role created via AI', extra: { Color: role.hexColor },
    }));
    return `created role @${role.name}${params.color ? ` (${role.hexColor})` : ''}`;
  },
});

// ── delete_role ─────────────────────────────────────────────────────────

registerTool('delete_role', {
  category: 'role',
  description: 'Delete a role from the server',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Role name to delete' } },
    required: ['name'],
  },
  permLevel: PermLevel.OWNER,
  confirm: true,
  preview(params, { guild }) {
    const role = resolveRole(guild, params.name);
    if (!role) return `i couldn't find a role matching "${params.name}" — which role did you mean?`;
    return `i'm about to **delete @${role.name}** (${role.members.size} members have it). this can't be undone.`;
  },
  async execute(params, { guild, member }) {
    const role = resolveRole(guild, params.name);
    if (!role) return `couldn't find a role matching "${params.name}"`;
    if (role.managed) return `can't delete @${role.name} — it's managed by an integration`;
    const roleName = role.name;
    await role.delete(`Deleted by ${member.displayName} via AI`);
    await logAction(guild, modActionEmbed({
      action: 'clear', target: `@${roleName}`, moderator: member.displayName, reason: 'Role deleted via AI',
    }));
    return `deleted role @${roleName}`;
  },
});

// ── edit_role ───────────────────────────────────────────────────────────

registerTool('edit_role', {
  category: 'role',
  description: 'Edit a role — change its name, color, hoist, or mentionable status',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Role to edit' },
      name: { type: 'string', description: 'New name' },
      color: { type: 'string', description: 'New hex color' },
      hoist: { type: 'boolean', description: 'Show separately in sidebar' },
      mentionable: { type: 'boolean', description: 'Allow @mentioning' },
    },
    required: ['role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    const edits = {};
    const changes = [];
    if (params.name) { edits.name = params.name; changes.push(`renamed to ${params.name}`); }
    if (params.color) { edits.color = params.color; changes.push(`color: ${params.color}`); }
    if (params.hoist !== undefined) { edits.hoist = params.hoist; changes.push(`hoist: ${params.hoist}`); }
    if (params.mentionable !== undefined) { edits.mentionable = params.mentionable; changes.push(`mentionable: ${params.mentionable}`); }

    if (changes.length === 0) return 'no changes specified';
    await role.edit(edits);
    return `updated @${role.name}: ${changes.join(', ')}`;
  },
});

// ── assign_role ─────────────────────────────────────────────────────────

registerTool('assign_role', {
  category: 'role',
  description: 'Give a role to a member',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member name or mention' },
      role: { type: 'string', description: 'Role name' },
    },
    required: ['user', 'role'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    if (target.roles.cache.has(role.id)) return `${target.displayName} already has @${role.name}`;
    await target.roles.add(role, `Assigned by ${member.displayName} via AI`);
    recordUndo(guild, `gave @${role.name} to ${target.displayName}`, 'remove_role_from', { userId: target.id, roleId: role.id });
    return `gave @${role.name} to ${target.displayName}`;
  },
});

// ── remove_role ─────────────────────────────────────────────────────────

registerTool('remove_role', {
  category: 'role',
  description: 'Remove a role from a member',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member name or mention' },
      role: { type: 'string', description: 'Role name' },
    },
    required: ['user', 'role'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    if (!target.roles.cache.has(role.id)) return `${target.displayName} doesn't have @${role.name}`;
    await target.roles.remove(role, `Removed by ${member.displayName} via AI`);
    recordUndo(guild, `removed @${role.name} from ${target.displayName}`, 'add_role_to', { userId: target.id, roleId: role.id });
    return `removed @${role.name} from ${target.displayName}`;
  },
});

// ── role_info ───────────────────────────────────────────────────────────

registerTool('role_info', {
  category: 'role',
  description: 'Get info about a role — color, position, member count, permissions',
  parameters: {
    type: 'object',
    properties: { role: { type: 'string', description: 'Role name' } },
    required: ['role'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    const perms = role.permissions.toArray().map(p => p.replace(/([A-Z])/g, ' $1').trim()).join(', ');
    return [
      `@${role.name}`,
      `color: ${role.hexColor}`,
      `members: ${role.members.size}`,
      `position: ${role.position}`,
      `hoisted: ${role.hoist}`,
      `mentionable: ${role.mentionable}`,
      `managed: ${role.managed}`,
      `created: <t:${Math.floor(role.createdTimestamp / 1000)}:R>`,
      `permissions: ${perms || 'none'}`,
    ].join('\n');
  },
});

// ── view_role_members ───────────────────────────────────────────────────

registerTool('view_role_members', {
  category: 'role',
  description: 'List members who have a specific role (up to 50)',
  parameters: {
    type: 'object',
    properties: { role: { type: 'string', description: 'Role name' } },
    required: ['role'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    const members = role.members.first(50).map(m => m.displayName);
    if (members.length === 0) return `no one has @${role.name}`;
    const extra = role.members.size > 50 ? ` (showing 50 of ${role.members.size})` : '';
    return `members with @${role.name}${extra}:\n${members.join(', ')}`;
  },
});

// ── edit_role_permissions ───────────────────────────────────────────────
// Server-wide permissions for a role (different from per-channel overrides).
// Confirm-gated and spells out exactly what changes, flagging dangerous perms.

registerTool('edit_role_permissions', {
  category: 'role',
  description: 'Grant or revoke SERVER-WIDE permissions for a role. Use grant/revoke with comma-separated permission names: administrator, kick, ban, timeout, manage_messages, manage_roles, manage_channels, manage_server, manage_nicknames, mention_everyone, view_audit_log, manage_events, etc. Always confirm exactly which permissions before running.',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Role to edit' },
      grant: { type: 'string', description: 'Comma-separated permissions to GIVE the role' },
      revoke: { type: 'string', description: 'Comma-separated permissions to REMOVE from the role' },
    },
    required: ['role'],
  },
  permLevel: PermLevel.ADMIN,
  confirm: true,
  preview(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `i couldn't find a role matching "${params.role}" — which role did you mean?`;
    const grant = params.grant ? Object.keys(resolvePermissions(params.grant)).map(prettyPerm) : [];
    const revoke = params.revoke ? Object.keys(resolvePermissions(params.revoke)).map(prettyPerm) : [];
    if (grant.length === 0 && revoke.length === 0) return `you didn't specify any permissions to change for @${role.name}. which ones?`;

    const dangerous = [...(params.grant ? Object.keys(resolvePermissions(params.grant)) : [])]
      .filter(p => DANGEROUS_PERMS.has(p)).map(prettyPerm);

    const lines = [`i'm about to change **server-wide** permissions for **@${role.name}** (${role.members.size} members):`];
    if (grant.length) lines.push(`✅ grant: ${grant.join(', ')}`);
    if (revoke.length) lines.push(`❌ revoke: ${revoke.join(', ')}`);
    if (dangerous.length) lines.push(`\n🚨 heads up — these are powerful: **${dangerous.join(', ')}**. anyone with @${role.name} will get them everywhere.`);
    return lines.join('\n');
  },
  async execute(params, { guild, member }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    const current = new Set(role.permissions.toArray());
    const grant = params.grant ? Object.keys(resolvePermissions(params.grant)) : [];
    const revoke = params.revoke ? Object.keys(resolvePermissions(params.revoke)) : [];
    if (grant.length === 0 && revoke.length === 0) return 'no permissions specified to change';

    for (const p of grant) current.add(p);
    for (const p of revoke) current.delete(p);

    try {
      await role.setPermissions([...current], `Permissions edited by ${member?.displayName || 'owner'} via Doll`);
    } catch (e) {
      return `couldn't update @${role.name}'s permissions: ${e.message} (my own role may be too low)`;
    }

    await logAction(guild, modActionEmbed({
      action: 'warn', target: `@${role.name}`, moderator: member?.displayName || 'owner',
      reason: 'Role permissions changed via AI',
      extra: { Granted: grant.map(prettyPerm).join(', ') || 'none', Revoked: revoke.map(prettyPerm).join(', ') || 'none' },
    }));

    const parts = [];
    if (grant.length) parts.push(`granted ${grant.map(prettyPerm).join(', ')}`);
    if (revoke.length) parts.push(`revoked ${revoke.map(prettyPerm).join(', ')}`);
    return `updated @${role.name}: ${parts.join('; ')}`;
  },
});

// ── reorder_roles ───────────────────────────────────────────────────────

registerTool('reorder_roles', {
  category: 'role',
  description: 'Change a role\'s position in the hierarchy',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Role name' },
      position: { type: 'number', description: 'New position (higher = more authority)' },
    },
    required: ['role', 'position'],
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;
    await role.setPosition(params.position);
    return `moved @${role.name} to position ${role.position}`;
  },
});
