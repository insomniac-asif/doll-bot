// Web tools — web_search (DuckDuckGo Instant Answer, free no-key) and
// youtube_search (yt-dlp flat playlist).

import { spawn } from 'node:child_process';
import { registerTool, PermLevel } from '../features/toolRegistry.js';

// ── web_search ──────────────────────────────────────────────────────────
// DuckDuckGo Instant Answer API: free, no key. Best for facts/definitions.

registerTool('web_search', {
  category: 'web',
  description: 'Search the web for quick facts, definitions, or info on a topic. Returns a short summary.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What to search for' } },
    required: ['query'],
  },
  permLevel: PermLevel.READ,
  async execute(params) {
    const q = encodeURIComponent(params.query);
    try {
      const res = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`, {
        headers: { 'User-Agent': 'DollBot/1.0' },
      });
      if (!res.ok) return `search failed (${res.status})`;
      const data = await res.json();

      // Primary abstract
      if (data.AbstractText) {
        const src = data.AbstractSource ? ` (${data.AbstractSource})` : '';
        return `${data.AbstractText}${src}${data.AbstractURL ? `\n${data.AbstractURL}` : ''}`;
      }
      // Direct answer (calculations, conversions, etc.)
      if (data.Answer) return String(data.Answer);
      // Definition
      if (data.Definition) {
        return `${data.Definition}${data.DefinitionSource ? ` (${data.DefinitionSource})` : ''}`;
      }
      // Related topics fallback
      if (data.RelatedTopics?.length) {
        const topics = data.RelatedTopics
          .filter(t => t.Text)
          .slice(0, 3)
          .map(t => `• ${t.Text}`);
        if (topics.length) return `here's what i found:\n${topics.join('\n')}`;
      }
      return `couldn't find a clear answer for "${params.query}" — might need a more specific search`;
    } catch (e) {
      return `search failed: ${e.message}`;
    }
  },
});

// ── youtube_search ──────────────────────────────────────────────────────
// yt-dlp flat playlist search — returns top results with URLs.

function ytSearch(query, count = 5) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      `ytsearch${count}:${query}`,
      '--flat-playlist', '--dump-json', '--no-warnings',
    ]);
    let out = '', err = '';
    proc.stdout.on('data', d => (out += d));
    proc.stderr.on('data', d => (err += d));
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0 && !out.trim()) return reject(new Error(err || `yt-dlp exited ${code}`));
      const results = out.trim().split('\n').filter(Boolean).map(line => {
        try {
          const j = JSON.parse(line);
          return {
            title: j.title,
            url: j.url || `https://youtube.com/watch?v=${j.id}`,
            uploader: j.uploader || j.channel || 'unknown',
            duration: j.duration,
          };
        } catch { return null; }
      }).filter(Boolean);
      resolve(results);
    });
  });
}

registerTool('youtube_search', {
  category: 'web',
  description: 'Search YouTube and return the top video results with titles and links',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for on YouTube' },
      count: { type: 'number', description: 'How many results (default 5, max 10)' },
    },
    required: ['query'],
  },
  permLevel: PermLevel.READ,
  async execute(params) {
    const count = Math.min(10, Math.max(1, params.count || 5));
    try {
      const results = await ytSearch(params.query, count);
      if (results.length === 0) return `no youtube results for "${params.query}"`;
      const lines = results.map((r, i) => {
        const dur = r.duration ? ` [${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}]` : '';
        return `${i + 1}. ${r.title}${dur} — ${r.uploader}\n${r.url}`;
      });
      return `youtube results:\n${lines.join('\n')}`;
    } catch (e) {
      return `youtube search failed: ${e.message}`;
    }
  },
});
