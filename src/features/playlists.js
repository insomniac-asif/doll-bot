// Saved playlists, per guild. A playlist is a named list of track refs
// ({title, url}). Stored in src/data/playlists/{guildId}.json.

import { getStore, saveStore } from '../store.js';

function store(guildId) { return getStore('playlists', guildId, { lists: {} }); }

export function savePlaylist(guildId, name, tracks) {
  const s = store(guildId);
  s.lists[name.toLowerCase()] = { name, tracks: tracks.map(t => ({ title: t.title, url: t.url })) };
  saveStore('playlists', guildId, s);
  return s.lists[name.toLowerCase()].tracks.length;
}

export function getPlaylist(guildId, name) {
  return store(guildId).lists[name.toLowerCase()] || null;
}

export function deletePlaylist(guildId, name) {
  const s = store(guildId);
  if (!s.lists[name.toLowerCase()]) return false;
  delete s.lists[name.toLowerCase()];
  saveStore('playlists', guildId, s);
  return true;
}

export function listPlaylists(guildId) {
  return Object.values(store(guildId).lists).map(l => ({ name: l.name, count: l.tracks.length }));
}

// ── Lyrics (lrclib.net — free, no key) ───────────────────────────────────

export async function fetchLyrics(title) {
  // Strip noise from the track title for a cleaner search
  const clean = title.replace(/\(.*?\)|\[.*?\]|official|video|lyrics|audio|hd|4k/gi, '').trim();
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`, {
      headers: { 'User-Agent': 'DollBot/1.0 (Discord music bot)' },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    const hit = results.find(r => r.plainLyrics) || results[0];
    if (!hit?.plainLyrics) return null;
    return { title: hit.trackName, artist: hit.artistName, lyrics: hit.plainLyrics };
  } catch {
    return null;
  }
}
