import { getStore, saveStore } from '../store.js';

function wallet(guildId, userId) {
  const store = getStore('economy', guildId, { users: {} });
  if (!store.users[userId]) store.users[userId] = { balance: 0, lastDaily: 0 };
  return { store, user: store.users[userId] };
}

export function getBalance(guildId, userId) {
  return wallet(guildId, userId).user.balance;
}

export function addBalance(guildId, userId, amount) {
  const { store, user } = wallet(guildId, userId);
  user.balance += amount;
  saveStore('economy', guildId, store);
  return user.balance;
}

export function transfer(guildId, fromId, toId, amount) {
  const { store } = wallet(guildId, fromId);
  wallet(guildId, toId); // ensure target exists
  const fresh = getStore('economy', guildId, { users: {} });
  if ((fresh.users[fromId]?.balance || 0) < amount) return { ok: false, reason: 'insufficient' };
  fresh.users[fromId].balance -= amount;
  if (!fresh.users[toId]) fresh.users[toId] = { balance: 0, lastDaily: 0 };
  fresh.users[toId].balance += amount;
  saveStore('economy', guildId, fresh);
  return { ok: true };
}

export function claimDaily(guildId, userId, amount) {
  const { store, user } = wallet(guildId, userId);
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  if (now - user.lastDaily < DAY) {
    return { ok: false, nextIn: DAY - (now - user.lastDaily) };
  }
  user.lastDaily = now;
  user.balance += amount;
  saveStore('economy', guildId, store);
  return { ok: true, balance: user.balance };
}

export function leaderboard(guildId, limit = 10) {
  const store = getStore('economy', guildId, { users: {} });
  return Object.entries(store.users)
    .sort((a, b) => b[1].balance - a[1].balance)
    .slice(0, limit)
    .map(([id, u], i) => ({ id, balance: u.balance, position: i + 1 }));
}
