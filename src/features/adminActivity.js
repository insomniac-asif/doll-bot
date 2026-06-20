// Admin-activity tracking — records who performs admin actions (channel/role
// create/delete, bans) by reading the audit log, so the owner can see each
// admin's activity. Ported from Crodie. Opt-in per server (toggle 'adminTracking').

import { AuditLogEvent } from 'discord.js';
import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

const MAX_PER_USER = 50;

function load(guildId) { return getStore('adminactivity', guildId, { users: {} }); }

function record(guildId, executorId, action, target) {
  const s = load(guildId);
  if (!s.users[executorId]) s.users[executorId] = { actions: [] };
  s.users[executorId].actions.push({ action, target, at: Date.now() });
  if (s.users[executorId].actions.length > MAX_PER_USER) {
    s.users[executorId].actions = s.users[executorId].actions.slice(-MAX_PER_USER);
  }
  saveStore('adminactivity', guildId, s);
}

// Look up who did a recent action of a given type via the audit log.
async function attribute(guild, auditType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 10000) return null; // must be fresh
    return { executorId: entry.executor?.id, target: entry.target?.name || entry.target?.tag || entry.targetId };
  } catch { return null; }
}

// ── Event hooks (wired in index.js) ──
export async function onChannelCreate(channel) {
  if (!channel.guild || !isEnabled(channel.guild.id, 'adminTracking')) return;
  const a = await attribute(channel.guild, AuditLogEvent.ChannelCreate);
  if (a?.executorId) record(channel.guild.id, a.executorId, 'created channel', `#${channel.name}`);
}
export async function onChannelDelete(channel) {
  if (!channel.guild || !isEnabled(channel.guild.id, 'adminTracking')) return;
  const a = await attribute(channel.guild, AuditLogEvent.ChannelDelete);
  if (a?.executorId) record(channel.guild.id, a.executorId, 'deleted channel', `#${channel.name}`);
}
export async function onRoleCreate(role) {
  if (!isEnabled(role.guild.id, 'adminTracking')) return;
  const a = await attribute(role.guild, AuditLogEvent.RoleCreate);
  if (a?.executorId) record(role.guild.id, a.executorId, 'created role', `@${role.name}`);
}
export async function onRoleDelete(role) {
  if (!isEnabled(role.guild.id, 'adminTracking')) return;
  const a = await attribute(role.guild, AuditLogEvent.RoleDelete);
  if (a?.executorId) record(role.guild.id, a.executorId, 'deleted role', `@${role.name}`);
}
export async function onBanAdd(ban) {
  if (!isEnabled(ban.guild.id, 'adminTracking')) return;
  const a = await attribute(ban.guild, AuditLogEvent.MemberBanAdd);
  if (a?.executorId) record(ban.guild.id, a.executorId, 'banned', ban.user?.tag || a.target);
}

// ── Read API (for the tool) ──
export function getAdminActivity(guildId, userId) {
  const s = load(guildId);
  const u = s.users[userId];
  if (!u || u.actions.length === 0) return null;
  const counts = {};
  for (const a of u.actions) counts[a.action] = (counts[a.action] || 0) + 1;
  const recent = u.actions.slice(-8).reverse();
  return { total: u.actions.length, counts, recent };
}
