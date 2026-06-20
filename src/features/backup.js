// Server backup/restore — snapshot the roles + channels + permissions, and
// rebuild what's missing later (recover from a nuke, or clone a structure).
// Restore is CREATE-ONLY: it never deletes or edits existing things, so it's
// safe to run — it just fills in what's gone.

import { ChannelType } from 'discord.js';
import { getStore, saveStore } from '../store.js';

const MAX_SNAPSHOTS = 5;

export function exportStructure(guild) {
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id && !r.managed)
    .sort((a, b) => a.position - b.position)
    .map(r => ({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString() }));

  const channels = guild.channels.cache
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map(c => ({
      name: c.name,
      type: c.type,
      parent: c.parent?.name || null,
      topic: c.topic || null,
      nsfw: c.nsfw || false,
      rateLimit: c.rateLimitPerUser || 0,
      overwrites: [...(c.permissionOverwrites?.cache?.values() || [])].map(o => ({
        targetName: o.type === 0 ? guild.roles.cache.get(o.id)?.name : guild.members.cache.get(o.id)?.user?.username,
        targetType: o.type,
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
      })).filter(o => o.targetName),
    }));

  return { at: Date.now(), guildName: guild.name, roles, channels };
}

export function saveBackup(guild) {
  const snap = exportStructure(guild);
  const s = getStore('backups', guild.id, { snapshots: [] });
  s.snapshots.push(snap);
  if (s.snapshots.length > MAX_SNAPSHOTS) s.snapshots = s.snapshots.slice(-MAX_SNAPSHOTS);
  saveStore('backups', guild.id, s);
  return { roles: snap.roles.length, channels: snap.channels.length, total: s.snapshots.length };
}

export function listBackups(guildId) {
  return getStore('backups', guildId, { snapshots: [] }).snapshots;
}

// Rebuild MISSING roles + channels from a snapshot (default: latest). Never
// touches existing items. Returns counts.
export async function restoreStructure(guild, index = -1) {
  const snaps = listBackups(guild.id);
  if (snaps.length === 0) return { error: 'no backups saved for this server' };
  const snap = snaps.at(index) || snaps.at(-1);

  let rolesMade = 0, channelsMade = 0;

  // roles first (so channel overwrites can reference them)
  for (const r of snap.roles) {
    if (guild.roles.cache.some(x => x.name === r.name)) continue;
    try {
      await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions) });
      rolesMade++;
    } catch { /* skip */ }
  }

  // categories first, then their children
  const cats = snap.channels.filter(c => c.type === ChannelType.GuildCategory);
  const rest = snap.channels.filter(c => c.type !== ChannelType.GuildCategory);
  const order = [...cats, ...rest];

  for (const c of order) {
    if (guild.channels.cache.some(x => x.name === c.name && x.type === c.type)) continue;
    try {
      const parent = c.parent ? guild.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === c.parent) : null;
      const ch = await guild.channels.create({
        name: c.name, type: c.type,
        parent: parent?.id,
        topic: c.type === ChannelType.GuildText ? (c.topic || undefined) : undefined,
        nsfw: c.nsfw || undefined,
        rateLimitPerUser: c.rateLimit || undefined,
      });
      // re-apply permission overwrites by role name
      for (const o of (c.overwrites || [])) {
        if (o.targetType !== 0) continue; // roles only
        const role = o.targetName === '@everyone' ? guild.roles.everyone : guild.roles.cache.find(x => x.name === o.targetName);
        if (role) await ch.permissionOverwrites.create(role, {}).then(() =>
          ch.permissionOverwrites.edit(role, permsFromBits(o.allow, o.deny))).catch(() => {});
      }
      channelsMade++;
    } catch { /* skip */ }
  }

  return { rolesMade, channelsMade, from: snap.at };
}

// Convert allow/deny bitfields into an overwrite-edit object isn't trivial via
// flags; simplest is to set raw via PermissionOverwrites — but discord.js edit
// takes flag:boolean. We approximate by leaving channels at category-inherited
// perms and only restoring the deny-view / deny-send essentials.
function permsFromBits(allowStr, denyStr) {
  const allow = BigInt(allowStr), deny = BigInt(denyStr);
  const VIEW = 1n << 10n, SEND = 1n << 11n;
  const out = {};
  if (deny & VIEW) out.ViewChannel = false; else if (allow & VIEW) out.ViewChannel = true;
  if (deny & SEND) out.SendMessages = false; else if (allow & SEND) out.SendMessages = true;
  return out;
}
