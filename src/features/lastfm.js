// Last.fm now-playing. Requires LASTFM_API_KEY.
import { getStore, saveStore } from '../store.js';

export function setUser(guildId, userId, lastfmUser) {
  const store = getStore('lastfm', guildId, { users: {} });
  store.users[userId] = lastfmUser;
  saveStore('lastfm', guildId, store);
}

export function getUser(guildId, userId) {
  return getStore('lastfm', guildId, { users: {} }).users[userId] || null;
}

export async function nowPlaying(lastfmUser) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return { error: 'Last.fm isn\'t configured (missing API key).' };
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(lastfmUser)}&api_key=${key}&format=json&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return { error: `Last.fm returned ${res.status}.` };
  const data = await res.json();
  if (data.error) return { error: data.message || 'Last.fm error.' };
  const track = data.recenttracks?.track?.[0];
  if (!track) return { error: 'No recent tracks found.' };
  return {
    name: track.name,
    artist: track.artist?.['#text'],
    album: track.album?.['#text'],
    image: track.image?.find(i => i.size === 'large')?.['#text'] || null,
    url: track.url,
    nowPlaying: track['@attr']?.nowplaying === 'true',
  };
}
