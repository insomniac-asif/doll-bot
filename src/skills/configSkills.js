// Server setup/config tools — let owners configure Doll by talking to her
// (log channel, welcome, mod role, alert channel, AI channels, etc.) instead
// of needing /setup.

import { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel, resolveRole } from '../features/resolvers.js';
import { getConfig, updateConfig } from '../config.js';
import { recordUndo } from '../features/undoStack.js';
import { getAccent } from '../config.js';

// ── set_log_channel ─────────────────────────────────────────────────────

registerTool('set_log_channel', {
  category: 'config',
  description: 'Set the channel where Doll posts moderation + audit logs (member joins/leaves, edits, deletes, voice, role/nickname changes).',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel name or mention for logs' } },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    updateConfig(guild.id, { logChannel: ch.id });
    return `logs will now post in #${ch.name} — voice, nicknames, roles, and channels are all being logged by default. say "turn off voice logging" (or any category) to disable one`;
  },
});

// ── set_welcome_channel ─────────────────────────────────────────────────

registerTool('set_welcome_channel', {
  category: 'config',
  description: 'Set the channel for welcome and leave messages',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel for welcome/leave messages' } },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    updateConfig(guild.id, { welcomeChannel: ch.id });
    return `welcome & leave messages will post in #${ch.name}`;
  },
});

// ── set_welcome_message / set_leave_message ─────────────────────────────

registerTool('set_welcome_message', {
  category: 'config',
  description: 'Set the welcome message text. Use {user} for a mention, {server} for the server name, {count} for the member number.',
  parameters: {
    type: 'object',
    properties: { message: { type: 'string', description: 'Welcome message template' } },
    required: ['message'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    updateConfig(guild.id, { welcomeMessage: params.message });
    return `welcome message updated to: "${params.message}"`;
  },
});

registerTool('set_leave_message', {
  category: 'config',
  description: 'Set the leave message text. Use {user} and {server}.',
  parameters: {
    type: 'object',
    properties: { message: { type: 'string', description: 'Leave message template' } },
    required: ['message'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    updateConfig(guild.id, { leaveMessage: params.message });
    return `leave message updated to: "${params.message}"`;
  },
});

// ── set_mod_role ────────────────────────────────────────────────────────

registerTool('set_mod_role', {
  category: 'config',
  description: 'Add a role that can use Doll\'s moderation commands/tools',
  parameters: {
    type: 'object',
    properties: { role: { type: 'string', description: 'Role to grant mod access' } },
    required: ['role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;
    const config = getConfig(guild.id);
    if (!config.modRoles.includes(role.id)) config.modRoles.push(role.id);
    updateConfig(guild.id, { modRoles: config.modRoles });
    return `@${role.name} can now use moderation features`;
  },
});

// ── set_autorole ────────────────────────────────────────────────────────

registerTool('set_autorole', {
  category: 'config',
  description: 'Set a role automatically given to every new member',
  parameters: {
    type: 'object',
    properties: { role: { type: 'string', description: 'Role to auto-assign on join' } },
    required: ['role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;
    updateConfig(guild.id, { autoRole: role.id });
    return `new members will automatically get @${role.name}`;
  },
});

// ── set_alert_channel ───────────────────────────────────────────────────

registerTool('set_alert_channel', {
  category: 'config',
  description: 'Set the channel where Doll posts owner/admin alerts (escalations, approvals, problems needing attention)',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel for owner alerts' } },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const config = getConfig(guild.id);
    updateConfig(guild.id, { ownerAlert: { ...config.ownerAlert, channel: ch.id } });
    return `i'll post alerts and approvals in #${ch.name}`;
  },
});

// ── set_ai_channel ──────────────────────────────────────────────────────

registerTool('set_ai_channel', {
  category: 'config',
  description: 'Add a channel where Doll always responds to messages (no need to say her name). Or remove one.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel name' },
      remove: { type: 'boolean', description: 'true to remove instead of add' },
    },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const config = getConfig(guild.id);
    let list = config.aiChannels || [];
    if (params.remove) {
      list = list.filter(id => id !== ch.id);
      updateConfig(guild.id, { aiChannels: list });
      return `i'll stop auto-chatting in #${ch.name}`;
    }
    if (!list.includes(ch.id)) list.push(ch.id);
    updateConfig(guild.id, { aiChannels: list });
    return `i'll always respond in #${ch.name} now — no need to say my name there`;
  },
});

// ── view_setup ──────────────────────────────────────────────────────────

registerTool('view_setup', {
  category: 'config',
  description: 'Show Doll\'s current server configuration — log channel, welcome channel, mod roles, etc.',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const c = getConfig(guild.id);
    const chName = id => { const ch = guild.channels.cache.get(id); return ch ? `#${ch.name}` : 'not set'; };
    const roleNames = ids => ids?.length ? ids.map(id => { const r = guild.roles.cache.get(id); return r ? `@${r.name}` : null; }).filter(Boolean).join(', ') : 'none';
    return [
      `**Doll's setup for ${guild.name}:**`,
      `log channel: ${c.logChannel ? chName(c.logChannel) : 'not set'}`,
      `welcome channel: ${c.welcomeChannel ? chName(c.welcomeChannel) : 'not set'}`,
      `alert channel: ${c.ownerAlert?.channel ? chName(c.ownerAlert.channel) : 'not set'}`,
      `auto-role: ${c.autoRole ? roleNames([c.autoRole]) : 'not set'}`,
      `mod roles: ${roleNames(c.modRoles)}`,
      `AI channels: ${c.aiChannels?.length ? c.aiChannels.map(chName).join(', ') : 'none (responds when named/mentioned)'}`,
      `personality: ${c.personality}`,
    ].join('\n');
  },
});

// ── setup_temp_voice (join-to-create / JTC) ─────────────────────────────

registerTool('setup_temp_voice', {
  category: 'config',
  description: 'Set up join-to-create voice channels (a.k.a. JTC / temp VC / join to create). Members who join a "hub" voice channel get their own personal voice channel that auto-deletes when empty. Creates the hub + a category and wires it up.',
  parameters: {
    type: 'object',
    properties: {
      hub_name: { type: 'string', description: 'Name for the hub channel (default "➕ Join to Create")' },
      category: { type: 'string', description: 'Category to put it under (created if it doesn\'t exist; default "Voice")' },
    },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    // find or create the category
    const catName = params.category || 'Voice';
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catName.toLowerCase());
    let createdCat = null;
    if (!category) {
      category = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
      createdCat = category.id;
    }
    // create the hub voice channel
    const hub = await guild.channels.create({
      name: params.hub_name || '➕ Join to Create',
      type: ChannelType.GuildVoice,
      parent: category.id,
      reason: 'Join-to-create hub via AI',
    });
    updateConfig(guild.id, { tempVoice: { hub: hub.id, category: category.id } });
    recordUndo(guild, `set up join-to-create (#${hub.name})`, 'delete_panel', {
      channelId: null, messageId: null, createdRoleIds: [],
      createdChannelId: hub.id, // best-effort: undo removes the hub
    });
    return `join-to-create is set up 🎀 — when anyone joins **${hub.name}** they'll get their own temp voice channel that vanishes when they leave. it's under the "${category.name}" category`;
  },
});

// ── setup_starboard ─────────────────────────────────────────────────────

registerTool('setup_starboard', {
  category: 'config',
  description: 'Set up a starboard — messages that get enough star reactions get posted to a highlights channel.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel where starred messages get posted' },
      threshold: { type: 'number', description: 'How many stars needed (default 3)' },
      emoji: { type: 'string', description: 'Star emoji (default ⭐)' },
    },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    updateConfig(guild.id, { starboard: { enabled: true, channel: ch.id, emoji: params.emoji || '⭐', threshold: params.threshold || 3 } });
    return `starboard is on — messages with ${params.threshold || 3}+ ${params.emoji || '⭐'} go to #${ch.name}`;
  },
});

// ── setup_confessions ───────────────────────────────────────────────────

registerTool('setup_confessions', {
  category: 'config',
  description: 'Set the channel where anonymous confessions get posted',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Confessions channel' } },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    updateConfig(guild.id, { confessions: { channel: ch.id } });
    return `confessions will post anonymously in #${ch.name}`;
  },
});

// ── setup_verification ──────────────────────────────────────────────────

registerTool('setup_verification', {
  category: 'config',
  description: 'Set up verification: posts a button panel in a channel; clicking it gives members a verified role. Use for "set up verification", "verify gate".',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to post the verify button in' },
      role: { type: 'string', description: 'Role granted on verifying' },
    },
    required: ['channel', 'role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;
    updateConfig(guild.id, { verification: { enabled: true, channel: ch.id, role: role.id } });
    const embed = new EmbedBuilder().setTitle('✿ Verify').setDescription('click the button below to verify and unlock the server~').setColor(getAccent(guild.id));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('doll_verify').setLabel('Verify').setStyle(ButtonStyle.Success).setEmoji('🎀'),
    );
    const msg = await ch.send({ embeds: [embed], components: [row] });
    recordUndo(guild, `set up verification in #${ch.name}`, 'delete_message', { channelId: ch.id, messageId: msg.id });
    return `verification is set up — members who click Verify in #${ch.name} get @${role.name}`;
  },
});

// ── setup_tickets ───────────────────────────────────────────────────────

registerTool('setup_tickets', {
  category: 'config',
  description: 'Set up a support-ticket system: posts a button panel; clicking opens a private ticket channel for staff. Use for "set up tickets".',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to post the "open ticket" button in' },
      category: { type: 'string', description: 'Category where ticket channels are created (created if missing; default "Tickets")' },
      staff_role: { type: 'string', description: 'Role that can see/handle tickets' },
    },
    required: ['channel', 'staff_role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const role = resolveRole(guild, params.staff_role);
    if (!role) return `couldn't find role "${params.staff_role}"`;
    const catName = params.category || 'Tickets';
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catName.toLowerCase());
    if (!category) category = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
    updateConfig(guild.id, { tickets: { category: category.id, staffRole: role.id, panelChannel: ch.id } });
    const embed = new EmbedBuilder().setTitle('🎫 Support Tickets').setDescription('need help? click below to open a private ticket with staff~').setColor(getAccent(guild.id));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('doll_ticket_open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
    );
    const msg = await ch.send({ embeds: [embed], components: [row] });
    recordUndo(guild, `set up tickets in #${ch.name}`, 'delete_message', { channelId: ch.id, messageId: msg.id });
    return `tickets are set up — people open them from #${ch.name}, and @${role.name} handles them under "${category.name}"`;
  },
});
