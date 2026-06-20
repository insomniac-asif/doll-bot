// Premium music tools — filters, autoplay/radio, 24/7, playlists, lyrics.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import * as music from '../features/music.js';
import {
  savePlaylist, getPlaylist, deletePlaylist, listPlaylists, fetchLyrics,
} from '../features/playlists.js';

// ── set_audio_filter ────────────────────────────────────────────────────

registerTool('set_audio_filter', {
  category: 'music',
  description: 'Apply an audio filter to the music. Options: none, bassboost, nightcore, vaporwave, 8d, treble, karaoke, soft.',
  parameters: {
    type: 'object',
    properties: { filter: { type: 'string', description: 'Filter name (bassboost, nightcore, 8d, vaporwave, treble, karaoke, soft, or none to clear)' } },
    required: ['filter'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const result = music.setFilter(guild.id, params.filter);
    if (!result.ok) return `unknown filter. options: ${result.available.join(', ')}`;
    return result.filter === 'none' ? 'cleared the audio filter' : `applied the **${result.filter}** filter`;
  },
});

// ── toggle_autoplay ─────────────────────────────────────────────────────

registerTool('toggle_autoplay', {
  category: 'music',
  description: 'Turn autoplay/radio on or off — when on, Doll keeps the music going with related tracks after the queue ends',
  parameters: {
    type: 'object',
    properties: { enabled: { type: 'boolean', description: 'true to enable autoplay' } },
    required: ['enabled'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    music.setAutoplay(guild.id, params.enabled);
    return params.enabled ? 'autoplay on — i\'ll keep the vibes going when the queue runs out' : 'autoplay off';
  },
});

// ── toggle_247 ──────────────────────────────────────────────────────────

registerTool('toggle_247', {
  category: 'music',
  description: 'Turn 24/7 mode on or off — when on, Doll stays in the voice channel instead of leaving when idle',
  parameters: {
    type: 'object',
    properties: { enabled: { type: 'boolean', description: 'true to stay 24/7' } },
    required: ['enabled'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    music.setStay247(guild.id, params.enabled);
    return params.enabled ? '24/7 mode on — i\'ll stay in the voice channel' : '24/7 mode off — i\'ll leave when idle';
  },
});

// ── get_lyrics ──────────────────────────────────────────────────────────

registerTool('get_lyrics', {
  category: 'music',
  description: 'Get the lyrics for the currently playing song (or a song you name)',
  parameters: {
    type: 'object',
    properties: { song: { type: 'string', description: 'Song to look up (defaults to what\'s playing)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    let title = params.song;
    if (!title) {
      const np = music.nowPlaying(guild.id);
      if (!np) return 'nothing is playing — tell me which song you want lyrics for';
      title = np.track.title;
    }
    const result = await fetchLyrics(title);
    if (!result) return `couldn't find lyrics for "${title}"`;
    const body = result.lyrics.length > 1800 ? result.lyrics.substring(0, 1800) + '\n…' : result.lyrics;
    return `**${result.title}** — ${result.artist}\n\n${body}`;
  },
});

// ── save_playlist ───────────────────────────────────────────────────────

registerTool('save_playlist', {
  category: 'music',
  description: 'Save the current queue (and now-playing) as a named playlist for later',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Name for the playlist' } },
    required: ['name'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const { current, queue } = music.getQueue(guild.id);
    const tracks = [current, ...queue].filter(Boolean);
    if (tracks.length === 0) return 'nothing is queued to save';
    const count = savePlaylist(guild.id, params.name, tracks);
    return `saved playlist "${params.name}" with ${count} track${count === 1 ? '' : 's'}`;
  },
});

// ── play_playlist ───────────────────────────────────────────────────────

registerTool('play_playlist', {
  category: 'music',
  description: 'Load and play a saved playlist',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Playlist name to play' } },
    required: ['name'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, channel, member }) {
    const vc = member.voice?.channel;
    if (!vc) return 'you need to be in a voice channel first';
    const pl = getPlaylist(guild.id, params.name);
    if (!pl) return `couldn't find a playlist called "${params.name}"`;
    const queries = pl.tracks.map(t => t.url || t.title);
    const queued = await music.enqueueMany(vc, channel, queries, member.displayName);
    return `queued ${queued} track${queued === 1 ? '' : 's'} from "${pl.name}"`;
  },
});

// ── list_playlists ──────────────────────────────────────────────────────

registerTool('list_playlists', {
  category: 'music',
  description: 'List saved playlists',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const lists = listPlaylists(guild.id);
    if (lists.length === 0) return 'no saved playlists yet';
    return `saved playlists:\n${lists.map(l => `• ${l.name} (${l.count} tracks)`).join('\n')}`;
  },
});

// ── delete_playlist ─────────────────────────────────────────────────────

registerTool('delete_playlist', {
  category: 'music',
  description: 'Delete a saved playlist',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Playlist name to delete' } },
    required: ['name'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    return deletePlaylist(guild.id, params.name) ? `deleted playlist "${params.name}"` : `no playlist called "${params.name}"`;
  },
});

// ── music_status ────────────────────────────────────────────────────────

registerTool('music_status', {
  category: 'music',
  description: 'Show current music settings — filter, autoplay, 24/7, volume, queue length',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const s = music.getMusicStatus(guild.id);
    return [
      `playing: ${s.playing ? 'yes' : 'no'}`,
      `filter: ${s.filter}`,
      `autoplay: ${s.autoplay ? 'on' : 'off'}`,
      `24/7: ${s.stay247 ? 'on' : 'off'}`,
      `volume: ${s.volume}%`,
      `queue: ${s.queueLength}`,
    ].join('\n');
  },
});
