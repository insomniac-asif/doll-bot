// Anti-nuke: watch for a single actor performing many destructive actions in a
// short window (mass channel/role deletes, mass bans). On trip, alert the owner
// and optionally neutralize the actor (strip roles + timeout).
import { AuditLogEvent } from 'discord.js';
import { getConfig } from '../config.js';
import { notifyOwner } from './ownerForward.js';
import { logIssue } from './devMonitor.js';

// guildId -> Map(`${actorId}:${type}` -> number[] timestamps)
const tracker = new Map();

function record(guildId, actorId, type, windowSec) {
  if (!tracker.has(guildId)) tracker.set(guildId, new Map());
  const g = tracker.get(guildId);
  const key = `${actorId}:${type}`;
  const now = Date.now();
  const arr = (g.get(key) || []).filter(t => now - t < windowSec * 1000);
  arr.push(now);
  g.set(key, arr);
  return arr.length;
}

async function actorFromAudit(guild, auditType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry) return null;
    // Only trust entries created in the last few seconds
    if (Date.now() - entry.createdTimestamp > 10_000) return null;
    return entry.executor;
  } catch {
    return null; // missing View Audit Log permission
  }
}

async function evaluate(guild, actor, type, threshold) {
  const config = getConfig(guild.id);
  if (!config.antinuke.enabled) return;
  if (!actor || actor.bot) return;
  if (actor.id === guild.ownerId) return;
  if (actor.id === process.env.OWNER_ID) return;
  if (config.antinuke.whitelist.includes(actor.id)) return;

  const count = record(guild.id, actor.id, type, config.antinuke.windowSec);
  if (count < threshold) return;

  // Trip — only act once per burst by clearing the counter
  tracker.get(guild.id).set(`${actor.id}:${type}`, []);

  let actionTaken = 'alert only';
  if (config.antinuke.punish === 'strip') {
    try {
      const member = await guild.members.fetch(actor.id).catch(() => null);
      if (member?.manageable) {
        await member.roles.set([]).catch(() => {});
        await member.timeout(24 * 60 * 60 * 1000, 'Anti-nuke: mass destructive actions').catch(() => {});
        actionTaken = 'stripped roles + 24h timeout';
      } else {
        actionTaken = 'could not punish (insufficient role hierarchy)';
      }
    } catch (e) {
      actionTaken = `punish failed: ${e.message}`;
    }
  }

  logIssue(guild, 'nuke', `${actor.tag} tripped ${type} threshold`);
  await notifyOwner(guild.client, guild, {
    title: '🚨 ANTI-NUKE TRIPPED',
    description: `<@${actor.id}> (${actor.tag}) triggered the **${type}** threshold (${count} in ${config.antinuke.windowSec}s).`,
    level: 'urgent',
    fields: [{ name: 'Action taken', value: actionTaken }],
  });
}

export async function handleChannelDelete(channel) {
  if (!channel.guild) return;
  const actor = await actorFromAudit(channel.guild, AuditLogEvent.ChannelDelete);
  await evaluate(channel.guild, actor, 'channelDelete', getConfig(channel.guild.id).antinuke.thresholds.channelDelete);
}

export async function handleRoleDelete(role) {
  const actor = await actorFromAudit(role.guild, AuditLogEvent.RoleDelete);
  await evaluate(role.guild, actor, 'roleDelete', getConfig(role.guild.id).antinuke.thresholds.roleDelete);
}

export async function handleBanAdd(ban) {
  const actor = await actorFromAudit(ban.guild, AuditLogEvent.MemberBanAdd);
  await evaluate(ban.guild, actor, 'ban', getConfig(ban.guild.id).antinuke.thresholds.ban);
}
