// Persistent memory — survives restarts. Two scopes:
// 1. Per-user: things Doll remembers about a specific member.
// 2. Per-guild: server-wide notes (rules, culture, preferences).
// Stored as JSON in src/data/memory/{guildId}.json.
import { getStore, saveStore } from '../store.js';

const MAX_USER_NOTES = 20;
const MAX_GUILD_NOTES = 30;

function getGuildStore(guildId) {
  return getStore('memory', guildId, { users: {}, guild: [] });
}

// ── Per-user memory ──────────────────────────────────────────────────────
export function getMemory(guildId, userId) {
  const store = getGuildStore(guildId);
  return store.users[userId] || { notes: [] };
}

export function addMemory(guildId, userId, note) {
  const store = getGuildStore(guildId);
  if (!store.users[userId]) store.users[userId] = { notes: [] };
  store.users[userId].notes.push(note);
  if (store.users[userId].notes.length > MAX_USER_NOTES) {
    store.users[userId].notes = store.users[userId].notes.slice(-MAX_USER_NOTES);
  }
  saveStore('memory', guildId, store);
}

export function clearMemory(guildId, userId) {
  const store = getGuildStore(guildId);
  delete store.users[userId];
  saveStore('memory', guildId, store);
}

// ── Per-guild memory ─────────────────────────────────────────────────────
export function getGuildMemory(guildId) {
  return getGuildStore(guildId).guild || [];
}

export function addGuildMemory(guildId, note) {
  const store = getGuildStore(guildId);
  store.guild.push(note);
  if (store.guild.length > MAX_GUILD_NOTES) store.guild = store.guild.slice(-MAX_GUILD_NOTES);
  saveStore('memory', guildId, store);
}

// ── AI-callable: Doll can store things she learns during conversation ────
// Call this from the chat pipeline when Doll learns something noteworthy.
export function rememberFromChat(guildId, userId, fact) {
  if (!fact || fact.length < 3) return;
  const existing = getMemory(guildId, userId);
  // Avoid near-duplicates
  if (existing.notes.some(n => n.toLowerCase().includes(fact.toLowerCase().substring(0, 30)))) return;
  addMemory(guildId, userId, fact);
}
