// Channel management tools — create, delete, edit, lock, unlock, archive,
// categories, permissions, reorder.

import { ChannelType, PermissionsBitField } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel, resolveRole, resolveMember, resolvePermissions } from '../features/resolvers.js';
import { logAction, modActionEmbed } from '../features/logging.js';
import { recordUndo } from '../features/undoStack.js';

// ── create_channel ──────────────────────────────────────────────────────

registerTool('create_channel', {
  category: 'channel',
  description: 'Create a new text or voice channel in the server, optionally under a category',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Channel name' },
      type: { type: 'string', enum: ['text', 'voice'], description: 'Channel type (default: text)' },
      category: { type: 'string', description: 'Category name to put the channel under' },
      topic: { type: 'string', description: 'Channel topic (text channels only)' },
    },
    required: ['name'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, member }) {
    const chType = params.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
    const opts = { name: params.name, type: chType };

    if (params.category) {
      const cat = resolveChannel(guild, params.category);
      if (cat && cat.type === ChannelType.GuildCategory) opts.parent = cat.id;
    }
    if (params.topic && chType === ChannelType.GuildText) opts.topic = params.topic;

    const ch = await guild.channels.create(opts);
    recordUndo(guild, `created #${ch.name}`, 'delete_channel', { channelId: ch.id });
    await logAction(guild, modActionEmbed({
      action: 'clear', target: `#${ch.name}`, moderator: member.displayName,
      reason: 'Channel created via AI', extra: { Type: params.type || 'text' },
    }));
    return `created ${chType === ChannelType.GuildVoice ? 'voice' : 'text'} channel #${ch.name}${opts.parent ? ` under ${params.category}` : ''}`;
  },
});

// ── delete_channel ──────────────────────────────────────────────────────

registerTool('delete_channel', {
  category: 'channel',
  description: 'Delete a channel from the server',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Channel name to delete' } },
    required: ['name'],
  },
  permLevel: PermLevel.OWNER,
  confirm: true,
  preview(params, { guild }) {
    const ch = resolveChannel(guild, params.name);
    if (!ch) return `i couldn't find a channel matching "${params.name}" — which channel did you mean?`;
    return `i'm about to **permanently delete #${ch.name}** and everything in it. this can't be undone.`;
  },
  async execute(params, { guild, member }) {
    const ch = resolveChannel(guild, params.name);
    if (!ch) return `couldn't find a channel matching "${params.name}"`;
    const chName = ch.name;
    await ch.delete(`Deleted by ${member?.displayName || 'owner'} via AI`);
    await logAction(guild, modActionEmbed({
      action: 'clear', target: `#${chName}`, moderator: member.displayName, reason: 'Channel deleted via AI',
    }));
    return `deleted #${chName}`;
  },
});

// ── edit_channel ────────────────────────────────────────────────────────

registerTool('edit_channel', {
  category: 'channel',
  description: 'Edit a channel — change its name, topic, slowmode, or NSFW status',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to edit' },
      name: { type: 'string', description: 'New channel name' },
      topic: { type: 'string', description: 'New topic' },
      slowmode: { type: 'number', description: 'Slowmode in seconds (0 to disable, max 21600)' },
      nsfw: { type: 'boolean', description: 'Toggle NSFW' },
    },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, member }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch) return `couldn't find channel "${params.channel}"`;

    const edits = {};
    const changes = [];
    if (params.name) { edits.name = params.name; changes.push(`renamed to ${params.name}`); }
    if (params.topic !== undefined) { edits.topic = params.topic; changes.push(`topic set`); }
    if (params.slowmode !== undefined) {
      edits.rateLimitPerUser = Math.min(21600, Math.max(0, params.slowmode));
      changes.push(`slowmode ${params.slowmode}s`);
    }
    if (params.nsfw !== undefined) { edits.nsfw = params.nsfw; changes.push(`nsfw: ${params.nsfw}`); }

    if (changes.length === 0) return 'no changes specified';
    await ch.edit(edits);
    return `updated #${ch.name}: ${changes.join(', ')}`;
  },
});

// ── create_category ─────────────────────────────────────────────────────

registerTool('create_category', {
  category: 'channel',
  description: 'Create a new channel category',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Category name' } },
    required: ['name'],
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { guild }) {
    const cat = await guild.channels.create({ name: params.name, type: ChannelType.GuildCategory });
    recordUndo(guild, `created category "${cat.name}"`, 'delete_channel', { channelId: cat.id });
    return `created category "${cat.name}"`;
  },
});

// ── build_category ──────────────────────────────────────────────────────
// Create a category AND put channels under it — or move existing channels into
// one. This is the reliable way to do "make a X category with channels a,b,c"
// and "move a,b,c under X" so they actually end up nested.

registerTool('build_category', {
  category: 'channel',
  description: 'Create a category with channels under it, OR move existing channels into a category. For "make a Welcome category with channels welcome, rules, roles" it creates them all NESTED. For "move welcome, rules, roles under the Welcome category" it moves the existing ones in. Channels that already exist are moved; names that don\'t exist are created under the category.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Category name' },
      channels: { type: 'array', items: { type: 'string' }, description: 'Channel names to create/move under it' },
      voice: { type: 'boolean', description: 'Create new channels as voice channels (default text)' },
    },
    required: ['name', 'channels'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    if (!Array.isArray(params.channels) || params.channels.length === 0) return 'tell me which channels to put in it';

    // find or create the category
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase() === params.name.toLowerCase() || c.name.toLowerCase().includes(params.name.toLowerCase())));
    const createdIds = [];
    if (!category) {
      category = await guild.channels.create({ name: params.name, type: ChannelType.GuildCategory });
      createdIds.push(category.id);
    }

    const created = [], moved = [], failed = [];
    for (const chName of params.channels) {
      const clean = String(chName).replace(/^#/, '').trim();
      const existing = resolveChannel(guild, clean);
      try {
        if (existing && existing.type !== ChannelType.GuildCategory) {
          await existing.setParent(category.id, { lockPermissions: false });
          moved.push(`#${existing.name}`);
        } else {
          const ch = await guild.channels.create({
            name: clean,
            type: params.voice ? ChannelType.GuildVoice : ChannelType.GuildText,
            parent: category.id,
          });
          created.push(`#${ch.name}`);
          createdIds.push(ch.id);
        }
      } catch (e) {
        failed.push(`${clean} (${e.message})`);
      }
    }

    if (createdIds.length) recordUndo(guild, `built the "${category.name}" category`, 'delete_channels', { channelIds: createdIds });

    const parts = [`set up the **${category.name}** category`];
    if (created.length) parts.push(`created: ${created.join(', ')}`);
    if (moved.length) parts.push(`moved in: ${moved.join(', ')}`);
    if (failed.length) parts.push(`couldn't do: ${failed.join(', ')}`);
    return parts.join(' — ');
  },
});

// ── set_channel_visibility ──────────────────────────────────────────────
// Common permission presets so channels aren't wide-open by default.

registerTool('set_channel_visibility', {
  category: 'channel',
  description: 'Control who can see and use a channel using a preset. Modes: "public" (everyone read+send), "readonly" (everyone reads, only staff posts — for rules/announcements), "staff_only" (only the given role + admins can see it), "private" (only the given role can see it), "hidden" (no one but admins). Provide a role for staff_only/private. Proactively suggest the right mode for channels like rules, announcements, staff, mod, logs.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to set' },
      mode: { type: 'string', enum: ['public', 'readonly', 'staff_only', 'private', 'hidden'], description: 'Visibility preset' },
      role: { type: 'string', description: 'Role for staff_only/private (who can see it)' },
    },
    required: ['channel', 'mode'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch) return `couldn't find channel "${params.channel}"`;
    const everyone = guild.id;
    let role = params.role ? resolveRole(guild, params.role) : null;

    try {
      switch (params.mode) {
        case 'public':
          await ch.permissionOverwrites.edit(everyone, { ViewChannel: null, SendMessages: null });
          return `#${ch.name} is now public — everyone can see and post`;
        case 'readonly':
          await ch.permissionOverwrites.edit(everyone, { ViewChannel: null, SendMessages: false });
          if (role) await ch.permissionOverwrites.edit(role.id, { SendMessages: true });
          return `#${ch.name} is read-only — everyone can read it${role ? `, only @${role.name} can post` : ', only admins can post'}`;
        case 'staff_only':
          if (!role) return `which role should be able to see #${ch.name}? (staff/mod role)`;
          await ch.permissionOverwrites.edit(everyone, { ViewChannel: false });
          await ch.permissionOverwrites.edit(role.id, { ViewChannel: true, SendMessages: true });
          return `#${ch.name} is now staff-only — only @${role.name} (and admins) can see it`;
        case 'private':
          if (!role) return `which role should be able to see #${ch.name}?`;
          await ch.permissionOverwrites.edit(everyone, { ViewChannel: false });
          await ch.permissionOverwrites.edit(role.id, { ViewChannel: true });
          return `#${ch.name} is private — only @${role.name} can see it`;
        case 'hidden':
          await ch.permissionOverwrites.edit(everyone, { ViewChannel: false });
          return `#${ch.name} is hidden — only admins can see it`;
        default:
          return `pick a mode: public, readonly, staff_only, private, or hidden`;
      }
    } catch (e) {
      return `couldn't change #${ch.name}'s permissions: ${e.message}`;
    }
  },
});

// ── lock_channel ────────────────────────────────────────────────────────

registerTool('lock_channel', {
  category: 'channel',
  description: 'Lock a channel — prevent @everyone from sending messages',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel to lock (defaults to current channel)' } },
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel, member }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;
    await ch.permissionOverwrites.edit(guild.id, { SendMessages: false });
    recordUndo(guild, `locked #${ch.name}`, 'set_channel_send', { channelId: ch.id, value: null });
    await logAction(guild, modActionEmbed({
      action: 'mute', target: `#${ch.name}`, moderator: member.displayName, reason: 'Channel locked',
    }));
    return `locked #${ch.name} — no one can send messages there now`;
  },
});

// ── unlock_channel ──────────────────────────────────────────────────────

registerTool('unlock_channel', {
  category: 'channel',
  description: 'Unlock a channel — allow @everyone to send messages again',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel to unlock (defaults to current channel)' } },
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel, member }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;
    await ch.permissionOverwrites.edit(guild.id, { SendMessages: null });
    await logAction(guild, modActionEmbed({
      action: 'unmute', target: `#${ch.name}`, moderator: member.displayName, reason: 'Channel unlocked',
    }));
    return `unlocked #${ch.name}`;
  },
});

// ── archive_channel ─────────────────────────────────────────────────────

registerTool('archive_channel', {
  category: 'channel',
  description: 'Archive a channel — moves it to an Archive category and locks it',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel to archive' } },
    required: ['channel'],
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { guild, member }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch) return `couldn't find channel "${params.channel}"`;

    // Find or create Archive category
    let archive = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'archive'
    );
    if (!archive) {
      archive = await guild.channels.create({ name: 'Archive', type: ChannelType.GuildCategory });
    }

    await ch.setParent(archive.id, { lockPermissions: false });
    await ch.permissionOverwrites.edit(guild.id, { SendMessages: false });

    return `archived #${ch.name} — moved to Archive category and locked`;
  },
});

// ── set_channel_permissions ─────────────────────────────────────────────

registerTool('set_channel_permissions', {
  category: 'channel',
  description: 'Set permissions on a channel for a role or member. Use allow/deny with comma-separated permission names: view, send, manage_messages, embed, attach, react, mention_everyone, manage_channels, history, voice_connect, voice_speak',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel name' },
      target: { type: 'string', description: 'Role or member name' },
      target_type: { type: 'string', enum: ['role', 'member'], description: 'Whether target is a role or member (default: role)' },
      allow: { type: 'string', description: 'Comma-separated permissions to ALLOW (e.g. "view,send")' },
      deny: { type: 'string', description: 'Comma-separated permissions to DENY' },
      reset: { type: 'string', description: 'Comma-separated permissions to RESET to default' },
    },
    required: ['channel', 'target'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch) return `couldn't find channel "${params.channel}"`;

    let target;
    if (params.target_type === 'member') {
      target = (await import('../features/resolvers.js')).resolveMember(guild, params.target);
    } else {
      target = resolveRole(guild, params.target);
    }
    if (!target) return `couldn't find ${params.target_type || 'role'} "${params.target}"`;

    const overwrite = {};
    if (params.allow) {
      for (const [key] of Object.entries(resolvePermissions(params.allow))) overwrite[key] = true;
    }
    if (params.deny) {
      for (const [key] of Object.entries(resolvePermissions(params.deny))) overwrite[key] = false;
    }
    if (params.reset) {
      for (const [key] of Object.entries(resolvePermissions(params.reset))) overwrite[key] = null;
    }

    await ch.permissionOverwrites.edit(target.id, overwrite);

    const changes = [];
    if (params.allow) changes.push(`allowed: ${params.allow}`);
    if (params.deny) changes.push(`denied: ${params.deny}`);
    if (params.reset) changes.push(`reset: ${params.reset}`);
    return `updated permissions on #${ch.name} for ${target.name || target.displayName}: ${changes.join(', ')}`;
  },
});

// ── reorder_channels ────────────────────────────────────────────────────

registerTool('reorder_channels', {
  category: 'channel',
  description: 'Move a channel to a different category or position',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to move' },
      category: { type: 'string', description: 'Category to move it to' },
      position: { type: 'number', description: 'Position within the category' },
    },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch) return `couldn't find channel "${params.channel}"`;

    if (params.category) {
      const cat = resolveChannel(guild, params.category);
      if (cat && cat.type === ChannelType.GuildCategory) {
        await ch.setParent(cat.id, { lockPermissions: false });
      }
    }
    if (params.position !== undefined) {
      await ch.setPosition(params.position);
    }

    return `moved #${ch.name}${params.category ? ` to ${params.category}` : ''}${params.position !== undefined ? ` position ${params.position}` : ''}`;
  },
});
