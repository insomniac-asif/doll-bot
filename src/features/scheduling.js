// Scheduled & recurring messages. Supports one-time ("in 2h", "tomorrow at 9am")
// and recurring ("every day at 9am", "every monday at 8pm", "every hour",
// "every 30m"). Times honor the per-guild UTC offset (config.tzOffset).

import { getStore, saveStore } from '../store.js';
import { getConfig } from '../config.js';
import { isEnabled } from './featureToggle.js';

const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Time parsing ──────────────────────────────────────────────────────────

function parseClock(str) {
  if (/\bnoon\b/i.test(str)) return { h: 12, m: 0 };
  if (/\bmidnight\b/i.test(str)) return { h: 0, m: 0 };
  // "9am", "9:30pm", "21:00", "9 am"
  const m = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function durationMs(str) {
  let total = 0; let found = false;
  const re = /(\d+)\s*(d|day|days|h|hr|hour|hours|m|min|mins|minute|minutes|s|sec|secs|seconds)/gi;
  let mt;
  while ((mt = re.exec(str)) !== null) {
    const n = parseInt(mt[1], 10);
    const u = mt[2].toLowerCase();
    if (u.startsWith('d')) total += n * 86400000;
    else if (u.startsWith('h')) total += n * 3600000;
    else if (u.startsWith('s')) total += n * 1000;
    else total += n * 60000; // minutes
    found = true;
  }
  return found ? total : null;
}

function nextDailyUTC(h, m, tzOffset, fromTs) {
  const off = tzOffset * 3600000;
  const local = new Date(fromTs + off);
  const t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m, 0);
  let utc = t - off;
  if (utc <= fromTs) utc += 86400000;
  return utc;
}

function nextWeeklyUTC(weekday, h, m, tzOffset, fromTs) {
  let utc = nextDailyUTC(h, m, tzOffset, fromTs);
  const off = tzOffset * 3600000;
  const localDow = new Date(utc + off).getUTCDay();
  const add = (weekday - localDow + 7) % 7;
  utc += add * 86400000;
  if (utc <= fromTs) utc += 7 * 86400000;
  return utc;
}

/**
 * Parse a schedule spec into a structured schedule. Returns { schedule } or { error }.
 */
export function parseSchedule(text, tzOffset = 0, now = Date.now()) {
  const t = text.toLowerCase().trim();

  // Recurring: every <weekday> at <time>
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`every\\s+${name}`).test(t)) {
      const clock = parseClock(t.split('at')[1] || t) || { h: 9, m: 0 };
      return { schedule: { type: 'weekly', weekday: dow, h: clock.h, m: clock.m, nextRun: nextWeeklyUTC(dow, clock.h, clock.m, tzOffset, now) } };
    }
  }

  // every day / daily at <time>
  if (/every\s+day|daily/.test(t)) {
    const clock = parseClock(t.split('at')[1] || t) || { h: 9, m: 0 };
    return { schedule: { type: 'daily', h: clock.h, m: clock.m, nextRun: nextDailyUTC(clock.h, clock.m, tzOffset, now) } };
  }

  // every hour / hourly
  if (/every\s+hour|hourly/.test(t)) {
    return { schedule: { type: 'interval', intervalMs: 3600000, nextRun: now + 3600000 } };
  }

  // every <duration> (interval)
  const everyDur = t.match(/every\s+(.+)/);
  if (everyDur) {
    const d = durationMs(everyDur[1]);
    if (d && d >= 60000) return { schedule: { type: 'interval', intervalMs: d, nextRun: now + d } };
  }

  // tomorrow at <time>
  if (/tomorrow/.test(t)) {
    const clock = parseClock(t.split('at')[1] || t) || { h: 9, m: 0 };
    return { schedule: { type: 'once', nextRun: nextDailyUTC(clock.h, clock.m, tzOffset, now) + 86400000 } };
  }

  // in <duration> (one-time)
  const inDur = t.match(/in\s+(.+)/) || (durationMs(t) ? [null, t] : null);
  if (inDur) {
    const d = durationMs(inDur[1]);
    if (d) return { schedule: { type: 'once', nextRun: now + d } };
  }

  // (today/at) <time> one-time
  const clock = parseClock(t);
  if (clock && /at|am|pm|:/.test(t)) {
    return { schedule: { type: 'once', nextRun: nextDailyUTC(clock.h, clock.m, tzOffset, now) } };
  }

  return { error: 'i couldn\'t understand that timing. try "in 2h", "every day at 9am", "every monday at 8pm", "tomorrow at noon", or "every 30m"' };
}

export function describeSchedule(s, tzOffset = 0) {
  const time = s.h !== undefined ? `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}` : '';
  switch (s.type) {
    case 'daily': return `every day at ${time}`;
    case 'weekly': return `every ${WEEKDAY_NAMES[s.weekday]} at ${time}`;
    case 'interval': return `every ${Math.round(s.intervalMs / 60000)} min`;
    case 'once': return `once, <t:${Math.floor(s.nextRun / 1000)}:R>`;
    default: return s.type;
  }
}

// ── Storage ───────────────────────────────────────────────────────────────

function store(guildId) { return getStore('scheduled', guildId, { items: [], nextId: 1 }); }

export function addScheduled(guildId, { channelId, content, schedule, createdBy }) {
  const s = store(guildId);
  const item = { id: s.nextId++, channelId, content, ...schedule, createdBy, enabled: true };
  s.items.push(item);
  saveStore('scheduled', guildId, s);
  return item;
}

export function listScheduled(guildId) { return store(guildId).items; }

export function removeScheduled(guildId, id) {
  const s = store(guildId);
  const before = s.items.length;
  s.items = s.items.filter(i => i.id !== Number(id));
  saveStore('scheduled', guildId, s);
  return before - s.items.length;
}

// ── Loop ──────────────────────────────────────────────────────────────────

export function startScheduledLoop(client) {
  setInterval(() => runDue(client).catch(e => console.error('[Scheduled] loop error:', e.message)), 30_000);
  console.log('[Scheduled] Message scheduler started');
}

async function runDue(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    if (!isEnabled(guild.id, 'scheduling')) continue;
    const s = store(guild.id);
    let changed = false;
    const tzOffset = getConfig(guild.id).tzOffset || 0;

    for (const item of s.items) {
      if (!item.enabled || item.nextRun > now) continue;

      try {
        const ch = await guild.channels.fetch(item.channelId).catch(() => null);
        if (ch?.isTextBased?.()) await ch.send({ content: item.content, allowedMentions: { parse: ['roles', 'everyone'] } });
      } catch (e) { console.error('[Scheduled] send failed:', e.message); }

      // Compute next run / retire one-time
      if (item.type === 'once') {
        item.enabled = false;
      } else if (item.type === 'daily') {
        item.nextRun = nextDailyUTC(item.h, item.m, tzOffset, now);
      } else if (item.type === 'weekly') {
        item.nextRun = nextWeeklyUTC(item.weekday, item.h, item.m, tzOffset, now);
      } else if (item.type === 'interval') {
        item.nextRun = now + item.intervalMs;
      }
      changed = true;
    }

    // Drop retired one-time items
    const live = s.items.filter(i => i.enabled);
    if (live.length !== s.items.length) { s.items = live; changed = true; }
    if (changed) saveStore('scheduled', guild.id, s);
  }
}
