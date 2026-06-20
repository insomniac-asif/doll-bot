// Music tools — play, skip, stop, pause, resume, queue, now playing.
// Wraps the existing music.js feature for AI-driven control.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import * as music from '../features/music.js';

// ── play_music ──────────────────────────────────────────────────────────

registerTool('play_music', {
  category: 'music',
  description: 'Play a song or add it to the queue. Searches YouTube by default. Joins the requesting user\'s voice channel.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Song name, artist, or YouTube URL' } },
    required: ['query'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, channel, member }) {
    const vc = member.voice?.channel;
    if (!vc) return `you need to be in a voice channel first`;

    try {
      const result = await music.play(vc, channel, params.query, member.displayName);
      if (result.queued) {
        return `queued "${result.track.title}" at position #${result.position}`;
      }
      return `now playing: ${result.track.title}`;
    } catch (e) {
      return `couldn't play that: ${e.message}`;
    }
  },
});

// ── skip_track ──────────────────────────────────────────────────────────

registerTool('skip_track', {
  category: 'music',
  description: 'Skip the currently playing song',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const np = music.nowPlaying(guild.id);
    if (!np) return 'nothing is playing right now';
    const title = np.track.title;
    const skipped = music.skip(guild.id);
    return skipped ? `skipped "${title}"` : 'nothing to skip';
  },
});

// ── stop_music ──────────────────────────────────────────────────────────

registerTool('stop_music', {
  category: 'music',
  description: 'Stop playing music, clear the queue, and leave the voice channel',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    music.stop(guild.id);
    return 'stopped the music and left the voice channel';
  },
});

// ── pause_music ─────────────────────────────────────────────────────────

registerTool('pause_music', {
  category: 'music',
  description: 'Pause the currently playing song',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const ok = music.pause(guild.id);
    return ok ? 'paused' : 'nothing is playing';
  },
});

// ── resume_music ────────────────────────────────────────────────────────

registerTool('resume_music', {
  category: 'music',
  description: 'Resume playback of a paused song',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const ok = music.resume(guild.id);
    return ok ? 'resumed' : 'nothing to resume';
  },
});

// ── now_playing ─────────────────────────────────────────────────────────

registerTool('now_playing', {
  category: 'music',
  description: 'Show what song is currently playing',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const np = music.nowPlaying(guild.id);
    if (!np) return 'nothing is playing right now';
    const elapsed = music.formatTime(np.elapsed);
    const total = music.formatTime(np.track.durationSec);
    return `now playing: ${np.track.title} [${elapsed}/${total}] — requested by ${np.track.requestedBy}`;
  },
});

// ── show_queue ──────────────────────────────────────────────────────────

registerTool('show_queue', {
  category: 'music',
  description: 'Show the current music queue',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const { current, queue } = music.getQueue(guild.id);
    if (!current) return 'queue is empty — nothing playing';

    const lines = [`now playing: ${current.title}`];
    if (queue.length === 0) {
      lines.push('queue is empty after this');
    } else {
      queue.slice(0, 15).forEach((t, i) => {
        lines.push(`${i + 1}. ${t.title} — ${t.requestedBy}`);
      });
      if (queue.length > 15) lines.push(`...and ${queue.length - 15} more`);
    }
    return lines.join('\n');
  },
});

// ── set_volume ──────────────────────────────────────────────────────────

registerTool('set_volume', {
  category: 'music',
  description: 'Set the music volume (1-100)',
  parameters: {
    type: 'object',
    properties: { level: { type: 'number', description: 'Volume level 1-100' } },
    required: ['level'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const vol = music.setVolume(guild.id, params.level);
    return `volume set to ${vol}%`;
  },
});
