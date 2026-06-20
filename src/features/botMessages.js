// Tracks embeds/panels Doll posts so she can edit or delete them later without
// the user having to find a message ID ("add a gif to that panel" just works).
// Per-guild, recent, capped.

import { getStore, saveStore } from '../store.js';

const MAX = 40;

export function recordBotMessage(guild, { channelId, messageId, kind, title }) {
  if (!guild) return;
  const s = getStore('botmsgs', guild.id, { msgs: [] });
  s.msgs.push({ channelId, messageId, kind: kind || 'embed', title: title || '', at: Date.now() });
  if (s.msgs.length > MAX) s.msgs = s.msgs.slice(-MAX);
  saveStore('botmsgs', guild.id, s);
}

export function getBotMessages(guildId) { return getStore('botmsgs', guildId, { msgs: [] }).msgs; }

// Find the message the user means: explicit id wins; else most-recent embed Doll
// posted, optionally filtered by channel and/or a title/kind hint.
export function findBotMessage(guildId, { messageId, channelId, hint } = {}) {
  const msgs = getBotMessages(guildId);
  if (messageId) {
    return msgs.find(m => m.messageId === messageId) || { messageId, channelId };
  }
  let cand = msgs.slice();
  if (channelId) cand = cand.filter(m => m.channelId === channelId);
  if (hint) {
    const q = hint.toLowerCase();
    const matches = cand.filter(m => m.title?.toLowerCase().includes(q) || m.kind?.toLowerCase().includes(q));
    if (matches.length) cand = matches;
  }
  return cand[cand.length - 1] || null;
}

// Fetch the actual discord message for a tracked entry (or by scanning if we
// only have an id). Returns the Message or null.
export async function fetchTrackedMessage(guild, entry) {
  if (!entry) return null;
  if (entry.channelId) {
    const ch = await guild.channels.fetch(entry.channelId).catch(() => null);
    if (ch?.isTextBased?.()) {
      const msg = await ch.messages.fetch(entry.messageId).catch(() => null);
      if (msg) return msg;
    }
  }
  // fall back to scanning text channels for the id
  for (const ch of guild.channels.cache.filter(c => c.isTextBased?.()).values()) {
    const msg = await ch.messages.fetch(entry.messageId).catch(() => null);
    if (msg) return msg;
  }
  return null;
}
