// Lightweight server activity tracking — feeds the health digest and churn
// detection. Stores per-day message counts, per-channel totals, and per-user
// last-seen + message count. Buffered in memory, flushed every 30s to avoid
// hammering disk on busy servers.

import { getStore, saveStore } from '../store.js';

// guildId -> { days: {YYYY-MM-DD: count}, channels: {chId: count}, users: {uid: {last, count}} }
const buffers = new Map();
let flushTimer = null;

function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function getBuffer(guildId) {
  if (!buffers.has(guildId)) {
    buffers.set(guildId, getStore('activity', guildId, { days: {}, channels: {}, users: {} }));
  }
  return buffers.get(guildId);
}

export function trackMessage(message) {
  if (message.author.bot || !message.guild) return;
  const buf = getBuffer(message.guild.id);
  const day = dayKey();

  buf.days[day] = (buf.days[day] || 0) + 1;
  buf.channels[message.channel.id] = (buf.channels[message.channel.id] || 0) + 1;

  const u = buf.users[message.author.id] || { last: 0, count: 0 };
  u.last = Date.now();
  u.count += 1;
  buf.users[message.author.id] = u;

  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAll();
  }, 30_000);
}

function flushAll() {
  for (const [guildId, buf] of buffers.entries()) {
    // Prune day buckets older than 60 days to keep files small
    const cutoff = dayKey(Date.now() - 60 * 24 * 60 * 60 * 1000);
    for (const d of Object.keys(buf.days)) {
      if (d < cutoff) delete buf.days[d];
    }
    saveStore('activity', guildId, buf);
  }
}

// Force a flush (used on shutdown or before reading fresh stats)
export function flushActivity() {
  flushAll();
}

// ── Read helpers for digest/churn ────────────────────────────────────────

export function getActivityStats(guildId) {
  const buf = getBuffer(guildId);
  const today = dayKey();
  const days = buf.days || {};

  // Last 7 vs previous 7 days for trend
  const sortedDays = Object.keys(days).sort();
  const last7 = sumLastNDays(days, 7);
  const prev7 = sumDaysRange(days, 14, 7);
  const trendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  // Top channels
  const topChannels = Object.entries(buf.channels || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));

  return {
    today: days[today] || 0,
    last7,
    prev7,
    trendPct,
    totalTracked: Object.values(days).reduce((a, b) => a + b, 0),
    topChannels,
    activeUsers: Object.keys(buf.users || {}).length,
  };
}

function sumLastNDays(days, n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = dayKey(Date.now() - i * 24 * 60 * 60 * 1000);
    total += days[d] || 0;
  }
  return total;
}

function sumDaysRange(days, startAgo, count) {
  let total = 0;
  for (let i = startAgo - count; i < startAgo; i++) {
    const d = dayKey(Date.now() - i * 24 * 60 * 60 * 1000);
    total += days[d] || 0;
  }
  return total;
}

// Members who were active before but have gone quiet (churn risk).
// Returns user IDs whose last message was between `quietDays` and `maxDays` ago.
export function getChurnRisk(guildId, quietDays = 10, maxDays = 45) {
  const buf = getBuffer(guildId);
  const now = Date.now();
  const quietMs = quietDays * 24 * 60 * 60 * 1000;
  const maxMs = maxDays * 24 * 60 * 60 * 1000;

  return Object.entries(buf.users || {})
    .filter(([, u]) => {
      const ago = now - u.last;
      // Was reasonably active (5+ msgs) but has gone quiet recently
      return u.count >= 5 && ago >= quietMs && ago <= maxMs;
    })
    .sort((a, b) => a[1].last - b[1].last)
    .slice(0, 10)
    .map(([id, u]) => ({ id, lastSeen: u.last, messages: u.count }));
}

export function getUserLastSeen(guildId, userId) {
  const buf = getBuffer(guildId);
  return buf.users?.[userId]?.last || 0;
}
