// Music playback via yt-dlp (search + stream) piped through ffmpeg to PCM.
// Per-guild in-memory player; no persistence (restart clears queues).
// Requires the `yt-dlp` and `ffmpeg` binaries on PATH.
import { spawn } from 'node:child_process';
import {
  joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, getVoiceConnection,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { EmbedBuilder } from 'discord.js';

const EMBED_COLOR = 0xc77dff;
const DEFAULT_VOLUME = 50;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const YT_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|soundcloud\.com|spotify\.com)/i;

// Audio filters → ffmpeg -af strings.
export const FILTERS = {
  none: null,
  bassboost: 'bass=g=18',
  nightcore: 'aresample=48000,asetrate=48000*1.25',
  vaporwave: 'aresample=48000,asetrate=48000*0.8',
  '8d': 'apulsator=hz=0.09',
  treble: 'treble=g=12',
  karaoke: 'pan=mono|c0=0.5*c0+-0.5*c1',
  soft: 'lowpass=f=3500',
};

const players = new Map(); // guildId -> state

function getState(guildId) {
  if (!players.has(guildId)) {
    players.set(guildId, {
      connection: null, player: null, queue: [], currentTrack: null,
      volume: DEFAULT_VOLUME, textChannel: null, idleTimer: null, startedAt: 0,
      filter: null, autoplay: false, stay247: false, recent: [],
    });
  }
  return players.get(guildId);
}

function dumpJson(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', ...args]);
    let out = '', err = '';
    proc.stdout.on('data', d => (out += d));
    proc.stderr.on('data', d => (err += d));
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0 || !out.trim()) return reject(new Error(err || `yt-dlp exited ${code}`));
      try {
        const first = out.trim().split('\n')[0];
        resolve(JSON.parse(first));
      } catch (e) { reject(e); }
    });
  });
}

async function resolveTrack(query, requestedBy) {
  const args = YT_URL_RE.test(query) ? [query] : ['--default-search', 'ytsearch1:', query];
  const info = await dumpJson(args);
  return {
    title: info.title,
    url: info.webpage_url || info.url,
    durationSec: info.duration || 0,
    thumbnail: info.thumbnail || null,
    requestedBy,
  };
}

async function ensureConnection(voiceChannel, state) {
  const existing = getVoiceConnection(voiceChannel.guild.id);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
    state.connection = existing;
  } else {
    state.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (e) {
      state.connection.destroy();
      state.connection = null;
      throw new Error('Could not join the voice channel in time.');
    }
  }

  if (!state.player) {
    state.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    state.player.on(AudioPlayerStatus.Idle, () => onTrackFinished(voiceChannel.guild.id));
    state.player.on('error', err => console.error('[Music] Player error:', err.message));
  }
  state.connection.subscribe(state.player);
}

function startIdleTimer(guildId) {
  const state = getState(guildId);
  if (state.stay247) return; // 24/7 mode: never auto-disconnect
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => teardown(guildId), IDLE_TIMEOUT_MS);
}

function teardown(guildId) {
  const state = getState(guildId);
  clearTimeout(state.idleTimer);
  try { state.connection?.destroy(); } catch { /* already gone */ }
  players.delete(guildId);
}

async function onTrackFinished(guildId) {
  const state = getState(guildId);
  if (state.queue.length > 0) {
    const next = state.queue.shift();
    await playTrack(guildId, next);
    return;
  }
  // Autoplay/radio: queue a related track when the queue runs dry
  if (state.autoplay && state.currentTrack) {
    const related = await findRelated(state).catch(() => null);
    if (related) { await playTrack(guildId, related); return; }
  }
  state.currentTrack = null;
  startIdleTimer(guildId);
}

// Find a track related to what just played (for autoplay/radio). Searches a
// few results derived from the seed and returns the first not-recently-played.
async function findRelated(state) {
  const seed = (state.currentTrack?.title || '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
  if (!seed) return null;
  const artist = seed.split('-')[0].trim();
  const queries = [`${artist} mix`, `${seed} radio`, `songs like ${seed}`];
  for (const q of queries) {
    try {
      const t = await resolveTrack(q, 'autoplay');
      if (t && t.url !== state.currentTrack?.url && !state.recent.includes(t.url)) {
        state.recent.push(t.url);
        if (state.recent.length > 25) state.recent.shift();
        return t;
      }
    } catch { /* try next query */ }
  }
  return null;
}

async function playTrack(guildId, track) {
  const state = getState(guildId);
  clearTimeout(state.idleTimer);

  const ytdlp = spawn('yt-dlp', ['-f', 'ba', '--no-playlist', '-o', '-', '--quiet', track.url]);
  const ffArgs = ['-i', 'pipe:0'];
  if (state.filter && FILTERS[state.filter]) ffArgs.push('-af', FILTERS[state.filter]);
  ffArgs.push('-f', 's16le', '-ar', '48000', '-ac', '2', '-loglevel', 'error', 'pipe:1');
  const ff = spawn('ffmpeg', ffArgs);
  ytdlp.on('error', e => console.error('[Music] yt-dlp spawn error:', e.message));
  ff.on('error', e => console.error('[Music] ffmpeg spawn error:', e.message));
  ytdlp.stdout.pipe(ff.stdin);
  ytdlp.stderr.on('data', () => {});

  const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume?.setVolume(state.volume / 100);
  state.player.play(resource);
  state.currentTrack = track;
  state.startedAt = Date.now();

  if (state.textChannel) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Now Playing')
      .setDescription(`[${track.title}](${track.url})`)
      .setFooter({ text: `Requested by ${track.requestedBy}` });
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);
    state.textChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

// ── Public API ──────────────────────────────────────────────
export async function play(voiceChannel, textChannel, query, requestedBy) {
  const state = getState(voiceChannel.guild.id);
  state.textChannel = textChannel;
  await ensureConnection(voiceChannel, state);
  const track = await resolveTrack(query, requestedBy);
  if (!state.currentTrack) {
    await playTrack(voiceChannel.guild.id, track);
    return { track, queued: false };
  }
  state.queue.push(track);
  return { track, queued: true, position: state.queue.length };
}

export function skip(guildId) {
  const state = getState(guildId);
  if (!state.currentTrack) return false;
  state.player.stop(); // triggers Idle -> onTrackFinished
  return true;
}

export function stop(guildId) {
  const state = getState(guildId);
  state.queue = [];
  try { state.player?.stop(); } catch { /* noop */ }
  teardown(guildId);
  return true;
}

export function pause(guildId) {
  const state = getState(guildId);
  return state.player?.pause() ?? false;
}

export function resume(guildId) {
  const state = getState(guildId);
  return state.player?.unpause() ?? false;
}

export function setVolume(guildId, level) {
  const state = getState(guildId);
  state.volume = Math.max(1, Math.min(100, level));
  const res = state.player?.state?.resource;
  res?.volume?.setVolume(state.volume / 100);
  return state.volume;
}

export function getQueue(guildId) {
  const state = getState(guildId);
  return { current: state.currentTrack, queue: state.queue };
}

export function nowPlaying(guildId) {
  const state = getState(guildId);
  if (!state.currentTrack) return null;
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  return { track: state.currentTrack, elapsed };
}

export function formatTime(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Premium controls ────────────────────────────────────────────────────

// Set an audio filter. Re-plays the current track from the start so the
// effect is immediately audible.
export function setFilter(guildId, name) {
  const state = getState(guildId);
  const key = (name || 'none').toLowerCase();
  if (!(key in FILTERS)) return { ok: false, available: Object.keys(FILTERS) };
  state.filter = key === 'none' ? null : key;
  if (state.currentTrack) playTrack(guildId, state.currentTrack); // restart with filter
  return { ok: true, filter: state.filter || 'none' };
}

export function getFilter(guildId) {
  return getState(guildId).filter || 'none';
}

export function setAutoplay(guildId, on) {
  getState(guildId).autoplay = !!on;
  return on;
}

export function setStay247(guildId, on) {
  const state = getState(guildId);
  state.stay247 = !!on;
  if (on) clearTimeout(state.idleTimer);
  else if (!state.currentTrack) startIdleTimer(guildId);
  return on;
}

export function getMusicStatus(guildId) {
  const state = getState(guildId);
  return {
    playing: !!state.currentTrack,
    filter: state.filter || 'none',
    autoplay: state.autoplay,
    stay247: state.stay247,
    volume: state.volume,
    queueLength: state.queue.length,
  };
}

// Queue many tracks at once (for playlists). Returns count queued.
export async function enqueueMany(voiceChannel, textChannel, queries, requestedBy) {
  const state = getState(voiceChannel.guild.id);
  state.textChannel = textChannel;
  await ensureConnection(voiceChannel, state);
  let queued = 0;
  for (const q of queries) {
    try {
      const track = await resolveTrack(q, requestedBy);
      if (!state.currentTrack) await playTrack(voiceChannel.guild.id, track);
      else state.queue.push(track);
      queued++;
    } catch { /* skip bad entries */ }
  }
  return queued;
}
