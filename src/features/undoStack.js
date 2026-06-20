// Undo journal. Reversible tools record an undo entry; "doll undo" reverses the
// most recent one. Persisted per-guild so it survives restarts. Not every action
// is fully reversible (deleted messages can't come back), but creates, role
// grants, bans, timeouts, nicknames, locks, panels, etc. all are.

import { getStore, saveStore } from '../store.js';

const MAX = 25;

function load(guildId) { return getStore('undo', guildId, { stack: [] }); }

export function recordUndo(guild, label, kind, data) {
  if (!guild) return;
  const s = load(guild.id);
  s.stack.push({ label, kind, data, at: Date.now() });
  if (s.stack.length > MAX) s.stack = s.stack.slice(-MAX);
  saveStore('undo', guild.id, s);
}

export function peekUndo(guildId) {
  const s = load(guildId);
  return s.stack[s.stack.length - 1] || null;
}

export function popEntry(guildId) {
  const s = load(guildId);
  const e = s.stack.pop();
  saveStore('undo', guildId, s);
  return e || null;
}

export function undoCount(guildId) { return load(guildId).stack.length; }

// Reverse a single entry. Returns a short human description of what it did.
export async function executeUndo(guild, entry) {
  const d = entry.data || {};
  switch (entry.kind) {
    case 'delete_role': {
      const r = guild.roles.cache.get(d.roleId);
      if (!r) return 'that role is already gone';
      const n = r.name; await r.delete('undo'); return `deleted role @${n}`;
    }
    case 'delete_channel': {
      const c = guild.channels.cache.get(d.channelId);
      if (!c) return 'that channel is already gone';
      const n = c.name; await c.delete('undo'); return `deleted #${n}`;
    }
    case 'delete_channels': {
      const names = [];
      for (const id of (d.channelIds || [])) {
        const c = guild.channels.cache.get(id);
        if (c) { names.push(c.name); await c.delete('undo').catch(() => {}); }
      }
      return names.length ? `deleted ${names.map(n => `#${n}`).join(', ')}` : 'already gone';
    }
    case 'remove_role_from': {
      const m = await guild.members.fetch(d.userId).catch(() => null);
      const r = guild.roles.cache.get(d.roleId);
      if (m && r) { await m.roles.remove(r, 'undo').catch(() => {}); return `removed @${r.name} from ${m.displayName}`; }
      return 'couldn\'t undo (member or role gone)';
    }
    case 'add_role_to': {
      const m = await guild.members.fetch(d.userId).catch(() => null);
      const r = guild.roles.cache.get(d.roleId);
      if (m && r) { await m.roles.add(r, 'undo').catch(() => {}); return `gave @${r.name} back to ${m.displayName}`; }
      return 'couldn\'t undo';
    }
    case 'restore_nick': {
      const m = await guild.members.fetch(d.userId).catch(() => null);
      if (m) { await m.setNickname(d.nick || null, 'undo').catch(() => {}); return `restored ${m.user.username}'s nickname`; }
      return 'couldn\'t undo';
    }
    case 'unban': {
      await guild.bans.remove(d.userId, 'undo').catch(() => {});
      return 'unbanned them';
    }
    case 'remove_timeout': {
      const m = await guild.members.fetch(d.userId).catch(() => null);
      if (m) { await m.timeout(null, 'undo').catch(() => {}); return 'removed the timeout'; }
      return 'couldn\'t undo';
    }
    case 'set_channel_send': {
      const c = guild.channels.cache.get(d.channelId);
      if (c) { await c.permissionOverwrites.edit(guild.id, { SendMessages: d.value }).catch(() => {}); return `reverted #${c.name}`; }
      return 'channel gone';
    }
    case 'revoke_invite': {
      const invs = await guild.invites.fetch().catch(() => null);
      const inv = invs?.find(i => i.code === d.code);
      if (inv) { await inv.delete('undo').catch(() => {}); return `revoked invite ${d.code}`; }
      return 'invite already gone';
    }
    case 'delete_message': {
      const c = guild.channels.cache.get(d.channelId);
      if (c) { const msg = await c.messages.fetch(d.messageId).catch(() => null); if (msg) { await msg.delete().catch(() => {}); return 'removed it'; } }
      return 'already gone';
    }
    case 'delete_panel': {
      const out = [];
      const c = guild.channels.cache.get(d.channelId);
      if (c) { const msg = await c.messages.fetch(d.messageId).catch(() => null); if (msg) { await msg.delete().catch(() => {}); out.push('removed the panel'); } }
      for (const rid of (d.createdRoleIds || [])) { const r = guild.roles.cache.get(rid); if (r) { out.push(`deleted @${r.name}`); await r.delete('undo').catch(() => {}); } }
      if (d.createdChannelId) { const cc = guild.channels.cache.get(d.createdChannelId); if (cc) { out.push(`deleted #${cc.name}`); await cc.delete('undo').catch(() => {}); } }
      return out.length ? out.join(', ') : 'panel already gone';
    }
    default:
      return 'i don\'t know how to reverse that one';
  }
}
