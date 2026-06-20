// Server lore — captures notable/funny moments (ported concept from Crodie,
// multi-guild). Auto-captures messages that get a lot of reactions, plus manual
// "remember this as lore". Doll can recall random lore or search it. Opt-in
// per server (toggle 'lore').

import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

const MAX_LORE = 300;
const AUTO_REACTION_THRESHOLD = 6; // total reactions to auto-capture

function load(guildId) { return getStore('lore', guildId, { entries: [], nextId: 1 }); }

export function addLore(guildId, { text, author, channel, source = 'manual' }) {
  const s = load(guildId);
  // avoid dupes
  if (s.entries.some(e => e.text === text)) return { dupe: true };
  const entry = { id: s.nextId++, text: text.slice(0, 500), author, channel, source, at: Date.now() };
  s.entries.push(entry);
  if (s.entries.length > MAX_LORE) s.entries = s.entries.slice(-MAX_LORE);
  saveStore('lore', guildId, s);
  return { entry };
}

export function recallLore(guildId) {
  const entries = load(guildId).entries;
  if (entries.length === 0) return null;
  // deterministic-ish pick based on time to avoid Math.random concerns
  return entries[Math.floor((Date.now() / 1000) % entries.length)];
}

export function searchLore(guildId, keyword) {
  const q = keyword.toLowerCase();
  return load(guildId).entries.filter(e =>
    e.text.toLowerCase().includes(q) || e.author?.toLowerCase().includes(q)
  ).slice(-10);
}

export function loreCount(guildId) { return load(guildId).entries.length; }

// Auto-capture on highly-reacted messages.
export async function handleLoreReaction(reaction, user) {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); } catch { return; }
  const msg = reaction.message;
  if (!msg.guild || !isEnabled(msg.guild.id, 'lore')) return;
  if (!msg.content || msg.content.length < 10) return;

  const total = msg.reactions.cache.reduce((sum, r) => sum + r.count, 0);
  if (total < AUTO_REACTION_THRESHOLD) return;

  addLore(msg.guild.id, {
    text: msg.content,
    author: msg.member?.displayName || msg.author.username,
    channel: msg.channel.name,
    source: 'auto (viral)',
  });
}
