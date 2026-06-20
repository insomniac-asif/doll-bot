// Temporary / timed roles. Grant a role that auto-removes after a duration.
// Pending removals persist globally so they survive restarts.

import { getGlobal, saveGlobal } from '../store.js';

function load() { return getGlobal('temproles', { pending: [] }); }
function save(data) { saveGlobal('temproles', data); }

export function durationToMs(str) {
  let total = 0; let found = false;
  const re = /(\d+)\s*(d|day|days|h|hr|hour|hours|m|min|mins|minute|minutes)/gi;
  let m;
  while ((m = re.exec(str)) !== null) {
    const n = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    if (u.startsWith('d')) total += n * 86400000;
    else if (u.startsWith('h')) total += n * 3600000;
    else total += n * 60000;
    found = true;
  }
  return found ? total : null;
}

export function scheduleRemoval(guildId, userId, roleId, expiresAt) {
  const data = load();
  // Replace any existing pending for the same user+role
  data.pending = data.pending.filter(p => !(p.guildId === guildId && p.userId === userId && p.roleId === roleId));
  data.pending.push({ guildId, userId, roleId, expiresAt });
  save(data);
}

export function startTempRoleLoop(client) {
  setInterval(() => sweep(client).catch(e => console.error('[TempRoles] sweep error:', e.message)), 30_000);
  console.log('[TempRoles] Timed-role loop started');
}

async function sweep(client) {
  const data = load();
  const now = Date.now();
  const due = data.pending.filter(p => p.expiresAt <= now);
  if (due.length === 0) return;

  for (const p of due) {
    try {
      const guild = client.guilds.cache.get(p.guildId);
      if (guild) {
        const member = await guild.members.fetch(p.userId).catch(() => null);
        if (member && member.roles.cache.has(p.roleId)) {
          await member.roles.remove(p.roleId, 'Temporary role expired').catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }
  data.pending = data.pending.filter(p => p.expiresAt > now);
  save(data);
}
