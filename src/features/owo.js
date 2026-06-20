// OwO-style critter hunting game. Hunt on a cooldown, collect critters by
// rarity into your zoo, sell them for economy coins, and battle other members.
import { getStore, saveStore } from '../store.js';

export const HUNT_COOLDOWN_MS = 10 * 1000;

// tier -> drop weight
const WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, mythic: 1 };

export const CRITTERS = [
  { name: 'bunny', emoji: '🐰', tier: 'common', value: 8 },
  { name: 'kitty', emoji: '🐱', tier: 'common', value: 8 },
  { name: 'puppy', emoji: '🐶', tier: 'common', value: 8 },
  { name: 'hamster', emoji: '🐹', tier: 'common', value: 10 },
  { name: 'chick', emoji: '🐥', tier: 'common', value: 6 },
  { name: 'mouse', emoji: '🐭', tier: 'common', value: 6 },
  { name: 'fox', emoji: '🦊', tier: 'uncommon', value: 28 },
  { name: 'panda', emoji: '🐼', tier: 'uncommon', value: 32 },
  { name: 'koala', emoji: '🐨', tier: 'uncommon', value: 30 },
  { name: 'bear', emoji: '🐻', tier: 'uncommon', value: 26 },
  { name: 'raccoon', emoji: '🦝', tier: 'uncommon', value: 24 },
  { name: 'owl', emoji: '🦉', tier: 'rare', value: 75 },
  { name: 'whale', emoji: '🐳', tier: 'rare', value: 90 },
  { name: 'butterfly', emoji: '🦋', tier: 'rare', value: 65 },
  { name: 'swan', emoji: '🦢', tier: 'rare', value: 80 },
  { name: 'dragon', emoji: '🐉', tier: 'epic', value: 200 },
  { name: 'peacock', emoji: '🦚', tier: 'epic', value: 175 },
  { name: 'eagle', emoji: '🦅', tier: 'epic', value: 160 },
  { name: 'unicorn', emoji: '🦄', tier: 'mythic', value: 600 },
  { name: 'rainbow-cat', emoji: '🌈', tier: 'mythic', value: 800 },
];

const BY_NAME = Object.fromEntries(CRITTERS.map(c => [c.name, c]));

function rollCritter() {
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  let tier = 'common';
  for (const [t, w] of Object.entries(WEIGHTS)) {
    if (r < w) { tier = t; break; }
    r -= w;
  }
  const pool = CRITTERS.filter(c => c.tier === tier);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getUser(store, userId) {
  if (!store.users[userId]) store.users[userId] = { animals: {}, lastHunt: 0 };
  return store.users[userId];
}

export function hunt(guildId, userId) {
  const store = getStore('owo', guildId, { users: {} });
  const user = getUser(store, userId);
  const now = Date.now();
  const remaining = HUNT_COOLDOWN_MS - (now - user.lastHunt);
  if (remaining > 0) return { ok: false, remaining };

  const critter = rollCritter();
  user.animals[critter.name] = (user.animals[critter.name] || 0) + 1;
  user.lastHunt = now;
  saveStore('owo', guildId, store);
  return { ok: true, critter };
}

export function getZoo(guildId, userId) {
  const store = getStore('owo', guildId, { users: {} });
  const user = store.users[userId];
  if (!user) return [];
  return Object.entries(user.animals)
    .map(([name, count]) => ({ ...BY_NAME[name], count }))
    .filter(c => c.name)
    .sort((a, b) => b.value - a.value);
}

// Sell critters of a tier (or all). Returns coins earned; removes them from zoo.
export function sell(guildId, userId, tier) {
  const store = getStore('owo', guildId, { users: {} });
  const user = store.users[userId];
  if (!user) return 0;
  let earned = 0;
  for (const [name, count] of Object.entries(user.animals)) {
    const c = BY_NAME[name];
    if (!c) continue;
    if (tier && tier !== 'all' && c.tier !== tier) continue;
    earned += c.value * count;
    delete user.animals[name];
  }
  saveStore('owo', guildId, store);
  return earned;
}

// Battle: each side fields its highest-value critter + a luck roll.
export function battle(guildId, aId, bId) {
  const za = getZoo(guildId, aId);
  const zb = getZoo(guildId, bId);
  if (!za.length || !zb.length) return { ok: false };
  const ca = za[0], cb = zb[0];
  const scoreA = ca.value * (0.7 + Math.random() * 0.6);
  const scoreB = cb.value * (0.7 + Math.random() * 0.6);
  return { ok: true, ca, cb, winner: scoreA >= scoreB ? aId : bId };
}

export function tierEmoji(tier) {
  return { common: '⚪', uncommon: '🟢', rare: '🔵', epic: '🟣', mythic: '🌈' }[tier] || '⚪';
}
