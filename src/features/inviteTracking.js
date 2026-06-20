// Invite tracking — records who recruited each member. Caches invite uses per
// guild; on join, diffs to find which invite incremented.

import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

const cache = new Map(); // guildId -> Map(code -> uses)

export async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const inv of invites.values()) map.set(inv.code, inv.uses || 0);
    // Include vanity URL if present
    if (guild.vanityURLCode) {
      try { const v = await guild.fetchVanityData(); map.set('VANITY', v.uses || 0); } catch { /* none */ }
    }
    cache.set(guild.id, map);
  } catch { /* missing ManageGuild — tracking unavailable */ }
}

export async function cacheAllInvites(client) {
  for (const guild of client.guilds.cache.values()) await cacheGuildInvites(guild);
  console.log('[Invites] Cached invites for invite tracking');
}

// On member join, figure out which invite was used and record the inviter.
export async function trackJoin(member) {
  const guild = member.guild;
  if (!isEnabled(guild.id, 'inviteTracking')) return;
  const before = cache.get(guild.id) || new Map();
  let used = null;

  try {
    const invites = await guild.invites.fetch();
    for (const inv of invites.values()) {
      const prev = before.get(inv.code) || 0;
      if ((inv.uses || 0) > prev) { used = inv; break; }
    }
    // refresh cache
    await cacheGuildInvites(guild);
  } catch { return; }

  if (!used?.inviter) return;

  const store = getStore('invites', guild.id, { byMember: {}, counts: {} });
  store.byMember[member.id] = { inviterId: used.inviter.id, code: used.code, at: Date.now() };
  store.counts[used.inviter.id] = (store.counts[used.inviter.id] || 0) + 1;
  saveStore('invites', guild.id, store);
}

export function whoInvited(guildId, userId) {
  const store = getStore('invites', guildId, { byMember: {}, counts: {} });
  return store.byMember[userId] || null;
}

export function inviteCounts(guildId, limit = 10) {
  const store = getStore('invites', guildId, { byMember: {}, counts: {} });
  return Object.entries(store.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count], i) => ({ id, count, position: i + 1 }));
}
