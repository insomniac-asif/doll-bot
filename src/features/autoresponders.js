// Custom auto-responders / triggers. "When someone says X, reply Y."
// Match types: contains, exact, startswith, wildcard (* glob). Per-channel
// cooldown stops loops/spam.

import { getStore, saveStore } from '../store.js';

function store(guildId) { return getStore('autoresponders', guildId, { items: [], nextId: 1 }); }

export function addAutoresponder(guildId, { trigger, response, match = 'contains' }) {
  const s = store(guildId);
  const item = { id: s.nextId++, trigger, response, match, enabled: true };
  s.items.push(item);
  saveStore('autoresponders', guildId, s);
  return item;
}

export function removeAutoresponder(guildId, idOrTrigger) {
  const s = store(guildId);
  const before = s.items.length;
  if (/^\d+$/.test(String(idOrTrigger))) {
    s.items = s.items.filter(i => i.id !== Number(idOrTrigger));
  } else {
    s.items = s.items.filter(i => i.trigger.toLowerCase() !== String(idOrTrigger).toLowerCase());
  }
  saveStore('autoresponders', guildId, s);
  return before - s.items.length;
}

export function listAutoresponders(guildId) { return store(guildId).items; }

function wildcardToRe(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matches(item, text) {
  const t = text.toLowerCase();
  const trig = item.trigger.toLowerCase();
  switch (item.match) {
    case 'exact': return t === trig;
    case 'startswith': return t.startsWith(trig);
    case 'wildcard': return wildcardToRe(item.trigger).test(text);
    case 'contains':
    default: return t.includes(trig);
  }
}

const cooldown = new Map(); // `${guildId}:${channelId}` -> ts
const COOLDOWN_MS = 3000;

// Returns the response string to send, or null.
export function matchAutoresponder(guildId, channelId, text) {
  if (!text) return null;
  const key = `${guildId}:${channelId}`;
  if (Date.now() - (cooldown.get(key) || 0) < COOLDOWN_MS) return null;
  for (const item of store(guildId).items) {
    if (item.enabled && matches(item, text)) {
      cooldown.set(key, Date.now());
      return item.response;
    }
  }
  return null;
}
