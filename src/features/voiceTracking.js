import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

const sessions = new Map(); // `${guildId}:${userId}` -> joinedAt

export function handleVoiceTrack(oldState, newState) {
  const guildId = newState.guild.id;
  if (!isEnabled(guildId, 'voiceTracking')) return;
  const userId = newState.id;
  const key = `${guildId}:${userId}`;

  const wasIn = !!oldState.channelId;
  const isIn = !!newState.channelId;

  if (!wasIn && isIn) {
    sessions.set(key, Date.now());
  } else if (wasIn && !isIn) {
    commit(guildId, userId, key);
  }
}

function commit(guildId, userId, key) {
  const joinedAt = sessions.get(key);
  if (!joinedAt) return;
  sessions.delete(key);
  const seconds = Math.floor((Date.now() - joinedAt) / 1000);
  if (seconds < 1) return;
  const store = getStore('voicetime', guildId, { users: {} });
  store.users[userId] = (store.users[userId] || 0) + seconds;
  saveStore('voicetime', guildId, store);
}

export function getVoiceTime(guildId, userId) {
  const store = getStore('voicetime', guildId, { users: {} });
  return store.users[userId] || 0;
}

export function voiceLeaderboard(guildId, limit = 10) {
  const store = getStore('voicetime', guildId, { users: {} });
  return Object.entries(store.users)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, seconds], i) => ({ id, seconds, position: i + 1 }));
}

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
