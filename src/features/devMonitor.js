// Developer monitoring — you (OWNER_ID) run infrastructure for many servers, so
// Doll tracks issues per guild (failed actions, raids, permission gaps) and can
// give you a cross-server health report on demand (DM her "status" / "issues").

import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGlobal, saveGlobal } from '../store.js';
import { getConfig } from '../config.js';

const MAX = 300;
let _client = null; // set by startDevWatch so logIssue can fire proactive alerts

// Record a notable issue (tool failure, raid, nuke, scam, error).
export function logIssue(guild, kind, detail) {
  if (!guild) return;
  const s = getGlobal('devissues', { issues: [] });
  s.issues.push({ guildId: guild.id, guildName: guild.name, kind, detail: String(detail).slice(0, 200), at: Date.now() });
  if (s.issues.length > MAX) s.issues = s.issues.slice(-MAX);
  saveGlobal('devissues', s);
  if (_client) checkAlert(guild, kind).catch(() => {});
}

// ── Proactive developer alerts (throttled, DM to OWNER_ID) ──
const throttle = new Map(); // key -> ts
const ALERT_THROTTLE = 30 * 60 * 1000;

async function devAlert(key, title, description, level = 'warn') {
  if (!_client || !process.env.OWNER_ID) return;
  if (Date.now() - (throttle.get(key) || 0) < ALERT_THROTTLE) return;
  throttle.set(key, Date.now());
  try {
    const dev = await _client.users.fetch(process.env.OWNER_ID);
    const embed = new EmbedBuilder()
      .setTitle(`🛰️ ${title}`)
      .setColor(level === 'urgent' ? 0xe74c3c : 0xf1c40f)
      .setDescription(description)
      .setFooter({ text: 'proactive dev alert · DM me "status" for the full picture' })
      .setTimestamp();
    await dev.send({ embeds: [embed] });
  } catch { /* dms closed */ }
}

// Decide whether a freshly-logged issue warrants pinging the developer.
async function checkAlert(guild, kind) {
  if (kind === 'raid') {
    return devAlert(`${guild.id}:raid`, 'Raid in a server you manage', `**${guild.name}** got raided — i locked it down. check on it.`, 'urgent');
  }
  if (kind === 'nuke') {
    return devAlert(`${guild.id}:nuke`, 'Nuke attempt', `anti-nuke triggered in **${guild.name}**.`, 'urgent');
  }
  if (kind === 'tool_failed') {
    // spike: 5+ failures in 10 min for this guild
    const recent = getGlobal('devissues', { issues: [] }).issues
      .filter(i => i.guildId === guild.id && i.kind === 'tool_failed' && i.at > Date.now() - 10 * 60 * 1000);
    if (recent.length >= 5) {
      return devAlert(`${guild.id}:failspike`, 'Repeated failures in a server', `**${guild.name}** has had ${recent.length} action failures in 10 min — likely a permission or setup problem.\nlatest: ${recent.at(-1).detail}`, 'warn');
    }
  }
}

const CRITICAL_FLAGS = ['ManageRoles', 'ManageChannels', 'BanMembers', 'ManageMessages'];
const lastPermOk = new Map(); // guildId -> bool

// Periodic watch for lost permissions (alerts once on transition, not repeatedly).
function permWatch(client) {
  for (const guild of client.guilds.cache.values()) {
    const me = guild.members.me;
    if (!me) continue;
    const ok = me.permissions.has(PermissionFlagsBits.Administrator) || CRITICAL_FLAGS.every(f => me.permissions.has(PermissionFlagsBits[f]));
    const was = lastPermOk.get(guild.id);
    if (was === true && ok === false) {
      const missing = CRITICAL_FLAGS.filter(f => !me.permissions.has(PermissionFlagsBits[f]));
      devAlert(`${guild.id}:perms`, 'Lost permissions in a server', `i lost critical permissions in **${guild.name}** — missing: ${missing.join(', ')}. i can't do my job there until it's restored.`, 'urgent');
      logIssue(guild, 'lost_perms', missing.join(', '));
    }
    lastPermOk.set(guild.id, ok);
  }
}

export function startDevWatch(client) {
  _client = client;
  setInterval(() => permWatch(client), 10 * 60 * 1000);
  permWatch(client); // seed the lastPermOk map
  console.log('[DevMonitor] proactive dev alerts active');
}

function recentIssues(sinceMs) {
  const cutoff = Date.now() - sinceMs;
  return getGlobal('devissues', { issues: [] }).issues.filter(i => i.at > cutoff);
}

const CRITICAL_PERMS = [
  ['ManageRoles', 'Manage Roles'], ['ManageChannels', 'Manage Channels'],
  ['BanMembers', 'Ban Members'], ['KickMembers', 'Kick Members'],
  ['ManageMessages', 'Manage Messages'], ['ModerateMembers', 'Timeout Members'],
];

// Build a cross-server (or single-server) health report for the developer.
export function buildDevReport(client, onlyGuildId = null) {
  const guilds = [...client.guilds.cache.values()].filter(g => !onlyGuildId || g.id === onlyGuildId);
  if (guilds.length === 0) return 'i\'m not in any servers (or that one isn\'t found).';

  const issues24h = recentIssues(24 * 60 * 60 * 1000);
  const attention = [];
  let healthy = 0;

  for (const guild of guilds) {
    const flags = [];
    const me = guild.members.me;

    // permissions
    if (me && !me.permissions.has(PermissionFlagsBits.Administrator)) {
      const missing = CRITICAL_PERMS.filter(([f]) => !me.permissions.has(PermissionFlagsBits[f])).map(([, n]) => n);
      if (missing.length) flags.push(`missing perms: ${missing.join(', ')}`);
      // role too low
      const above = guild.roles.cache.filter(r => r.position > me.roles.highest.position && r.id !== guild.id).size;
      if (above > 3) flags.push(`my role is low (${above} roles above me)`);
    }

    // config gaps
    const c = getConfig(guild.id);
    if (!c.logChannel) flags.push('no log channel set');
    if (!c.modRoles?.length) flags.push('no mod role set');

    // recent issues for this guild
    const gi = issues24h.filter(i => i.guildId === guild.id);
    if (gi.length) {
      const byKind = {};
      for (const i of gi) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
      flags.push(`${gi.length} issue(s) (24h): ${Object.entries(byKind).map(([k, n]) => `${k}×${n}`).join(', ')}`);
    }

    if (flags.length) attention.push(`**${guild.name}** (${guild.memberCount} members)\n  • ${flags.join('\n  • ')}`);
    else healthy++;
  }

  const lines = [`📊 **${guilds.length} server${guilds.length === 1 ? '' : 's'}** — ${healthy} healthy, ${attention.length} need a look`];
  if (attention.length) lines.push('', ...attention);
  else lines.push('\n🎀 everything looks good across the board — nothing to worry about right now.');
  return lines.join('\n');
}

// Handle developer DM commands for monitoring. Returns true if handled.
export async function handleDevMonitor(message, client) {
  if (message.author.id !== process.env.OWNER_ID || message.guild) return false;
  const t = message.content.trim().toLowerCase();
  if (!/^(status|issues?|health|report|anything wrong|how('?s| are)\s+(the\s+)?servers?|everything ok)\b/i.test(t)) return false;

  // optional "issues in <server name>"
  const m = t.match(/(?:in|for)\s+(.+)$/);
  let onlyId = null;
  if (m) {
    const q = m[1].trim();
    const g = client.guilds.cache.find(x => x.name.toLowerCase().includes(q));
    if (g) onlyId = g.id;
  }

  const report = buildDevReport(client, onlyId);
  // chunk if long
  if (report.length > 1900) {
    for (const chunk of report.match(/[\s\S]{1,1900}/g)) await message.reply(chunk).catch(() => {});
  } else {
    await message.reply(report);
  }
  return true;
}
