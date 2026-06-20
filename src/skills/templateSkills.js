// Setup checklist (audit unconfigured things + offer fixes) and one-shot server
// templates (build a full structure with sensible perms).

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { getConfig } from '../config.js';
import { recordUndo } from '../features/undoStack.js';
import { saveBackup, listBackups, restoreStructure } from '../features/backup.js';

// ── backup_server ───────────────────────────────────────────────────────

registerTool('backup_server', {
  category: 'config',
  description: 'Save a snapshot of the server\'s roles, channels, and permissions. Use for "back up the server", "save a snapshot". Lets you rebuild later if something gets deleted or nuked.',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.ADMIN,
  async execute(_params, { guild }) {
    const r = saveBackup(guild);
    return `backed up the server 🎀 — ${r.roles} roles + ${r.channels} channels saved (snapshot ${r.total}/5). say "restore the server" if anything gets deleted`;
  },
});

registerTool('list_backups', {
  category: 'config',
  description: 'List saved server backups',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.MOD,
  async execute(_params, { guild }) {
    const snaps = listBackups(guild.id);
    if (snaps.length === 0) return 'no backups saved yet — say "back up the server"';
    return `backups:\n${snaps.map((s, i) => `${i + 1}. <t:${Math.floor(s.at / 1000)}:R> — ${s.roles.length} roles, ${s.channels.length} channels`).join('\n')}`;
  },
});

registerTool('restore_server', {
  category: 'config',
  description: 'Rebuild MISSING roles and channels from the latest backup (recover from a nuke). It only CREATES what\'s gone — never deletes or edits existing things, so it\'s safe. Use for "restore the server", "rebuild from backup".',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.OWNER,
  confirm: true,
  preview(_params, { guild }) {
    const snaps = listBackups(guild.id);
    if (snaps.length === 0) return 'there are no backups to restore from — make one first with "back up the server"';
    const s = snaps.at(-1);
    return `i'll rebuild anything MISSING from the latest backup (${s.roles.length} roles, ${s.channels.length} channels). i won't touch or delete anything that already exists. confirm?`;
  },
  async execute(_params, { guild }) {
    const r = await restoreStructure(guild);
    if (r.error) return r.error;
    return `restored from backup — recreated ${r.rolesMade} missing roles and ${r.channelsMade} missing channels`;
  },
});

// ── setup_checklist ─────────────────────────────────────────────────────

registerTool('setup_checklist', {
  category: 'config',
  description: 'Audit the server\'s setup and report what still needs configuring (log channel, rules, welcome, mod roles, open staff channels, off safety features) with suggested fixes. Use for "what do i still need to set up", "setup checklist", "what\'s missing".',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.MOD,
  async execute(_params, { guild }) {
    const c = getConfig(guild.id);
    const todo = [], done = [];
    const push = (ok, label) => (ok ? done : todo).push(label);

    push(c.logChannel, 'log channel — say "set the log channel to #logs"');
    push(c.welcomeChannel, 'welcome channel — say "set the welcome channel to #welcome"');
    push(c.modRoles?.length, 'mod role — say "set @Mods as a mod role"');
    push(c.ownerAlert?.channel, 'alert channel (where i ping you for problems)');
    push(c.automod?.enabled, 'auto-moderation');
    push(c.antiScam?.enabled, 'anti-scam links — say "turn on anti-scam"');
    push(c.antiRaid?.enabled, 'anti-raid protection — say "set up anti-raid"');
    push(c.verification?.enabled, 'verification gate — say "set up verification in #verify with @Member"');
    push(c.starboard?.enabled, 'starboard');
    push(c.tempVoice?.hub, 'join-to-create voice — say "set up jtc"');

    // open channels that probably shouldn't be
    const risky = [];
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText) continue;
      const n = ch.name.toLowerCase();
      if (/(staff|mod|admin|log|ticket)/.test(n)) {
        const everyone = ch.permissionOverwrites.cache.get(guild.id);
        const canView = !everyone || !everyone.deny.has(PermissionFlagsBits.ViewChannel);
        if (canView) risky.push(`#${ch.name} is visible to everyone — say "make #${ch.name} staff-only"`);
      }
    }

    const lines = [`**Setup for ${guild.name}** — ${done.length} done, ${todo.length} to go`];
    if (todo.length) lines.push(`\n⚠️ still to set up:\n${todo.map(t => `• ${t}`).join('\n')}`);
    if (risky.length) lines.push(`\n🔒 channels to lock down:\n${risky.map(r => `• ${r}`).join('\n')}`);
    if (!todo.length && !risky.length) lines.push('\n🎀 everything important is configured!');
    lines.push('\nwant me to knock any of these out for you?');
    return lines.join('\n');
  },
});

// ── setup_server_template ───────────────────────────────────────────────

const TEMPLATES = {
  community: {
    roles: ['Member', 'Mod'],
    categories: [
      { name: 'Welcome', channels: ['welcome', 'rules', 'roles', 'announcements'], lock: { rules: 'readonly', announcements: 'readonly', welcome: 'readonly' } },
      { name: 'Community', channels: ['general', 'media', 'off-topic'] },
      { name: 'Staff', channels: ['staff-chat', 'mod-log'], staffOnly: true },
      { name: 'Voice', voice: ['General', 'Music', 'AFK'] },
    ],
  },
  gaming: {
    roles: ['Member', 'Mod'],
    categories: [
      { name: 'Welcome', channels: ['welcome', 'rules', 'roles'], lock: { rules: 'readonly', welcome: 'readonly' } },
      { name: 'General', channels: ['general', 'clips', 'lfg'] },
      { name: 'Staff', channels: ['staff-chat'], staffOnly: true },
      { name: 'Voice', voice: ['Lobby', 'Game 1', 'Game 2', 'AFK'] },
    ],
  },
  social: {
    roles: ['Member', 'Mod'],
    categories: [
      { name: '✿ Welcome', channels: ['welcome', 'rules', 'roles'], lock: { rules: 'readonly', welcome: 'readonly' } },
      { name: '✿ Hangout', channels: ['chatting', 'pics', 'vents', 'spam'] },
      { name: '✿ Staff', channels: ['staff-chat'], staffOnly: true },
      { name: '✿ Voice', voice: ['General', 'Chill', 'AFK'] },
    ],
  },
};

registerTool('setup_server_template', {
  category: 'config',
  description: 'Build a whole server structure in one go from a template, with sensible permissions. Types: "community", "gaming", "social". Creates categories, channels (rules/announcements read-only, staff channels hidden), and Member/Mod roles. Confirm the type first.',
  parameters: {
    type: 'object',
    properties: { type: { type: 'string', enum: ['community', 'gaming', 'social'], description: 'Which template' } },
    required: ['type'],
  },
  permLevel: PermLevel.ADMIN,
  confirm: true,
  preview(params) {
    const t = TEMPLATES[params.type];
    if (!t) return `i have these templates: community, gaming, social. which one?`;
    const cats = t.categories.map(c => `**${c.name}**: ${(c.channels || c.voice || []).join(', ')}`).join('\n');
    return `i'll build a **${params.type}** server:\n${cats}\nroles: ${t.roles.join(', ')}\n(rules/announcements read-only, staff channels staff-only)\nconfirm?`;
  },
  async execute(params, { guild }) {
    const t = TEMPLATES[params.type];
    if (!t) return `pick a template: community, gaming, or social`;
    const createdChannelIds = [], createdRoleIds = [];
    const roleMap = {};

    // roles
    for (const rn of t.roles) {
      let role = guild.roles.cache.find(r => r.name.toLowerCase() === rn.toLowerCase());
      if (!role) { role = await guild.roles.create({ name: rn }).catch(() => null); if (role) createdRoleIds.push(role.id); }
      if (role) roleMap[rn] = role;
    }
    const staffRole = roleMap['Mod'];

    // categories + channels
    for (const cat of t.categories) {
      const category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory }).catch(() => null);
      if (!category) continue;
      createdChannelIds.push(category.id);
      if (cat.staffOnly && staffRole) {
        await category.permissionOverwrites.edit(guild.id, { ViewChannel: false }).catch(() => {});
        await category.permissionOverwrites.edit(staffRole.id, { ViewChannel: true }).catch(() => {});
      }
      for (const chName of (cat.channels || [])) {
        const ch = await guild.channels.create({ name: chName, type: ChannelType.GuildText, parent: category.id }).catch(() => null);
        if (!ch) continue;
        createdChannelIds.push(ch.id);
        const lockMode = cat.lock?.[chName];
        if (lockMode === 'readonly') await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
      }
      for (const vcName of (cat.voice || [])) {
        const vc = await guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: category.id }).catch(() => null);
        if (vc) createdChannelIds.push(vc.id);
      }
    }

    if (createdChannelIds.length) recordUndo(guild, `built the ${params.type} server template`, 'delete_channels', { channelIds: createdChannelIds });
    return `built your **${params.type}** server 🎀 — ${createdChannelIds.length} channels/categories, roles: ${Object.keys(roleMap).join(', ')}. rules/announcements are read-only and staff channels are hidden. want me to add a welcome message or reaction-role panels next?`;
  },
});