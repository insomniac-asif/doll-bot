// Awareness tools — searchable conversation vault + server lore (ported from
// Crodie, multi-guild + opt-in).

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { isEnabled } from '../features/featureToggle.js';
import { searchVault, vaultSize } from '../features/vault.js';
import { addLore, recallLore, searchLore, loreCount } from '../features/lore.js';
import { readImage, firstImageUrl } from '../features/ocr.js';
import { getAdminActivity } from '../features/adminActivity.js';
import { resolveMemberFetch } from '../features/resolvers.js';

// ── read_image (OCR) ────────────────────────────────────────────────────

registerTool('read_image', {
  category: 'assistant',
  description: 'Read the text out of an image (OCR) — a screenshot, meme, or any posted picture. Use when asked "what does this say", "read this image", or to understand an attached picture.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'Image URL (optional — defaults to the most recent image in the channel)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, channel, message }) {
    if (!isEnabled(guild.id, 'ocr')) return 'image reading (OCR) is off for this server — turn it on first';
    let url = params.url;
    if (!url && message) url = firstImageUrl(message);
    if (!url) {
      // look back a few messages for an image
      try {
        const recent = await channel.messages.fetch({ limit: 10 });
        for (const m of recent.values()) { const u = firstImageUrl(m); if (u) { url = u; break; } }
      } catch { /* ignore */ }
    }
    if (!url) return 'i don\'t see an image to read — point me at one or post it';
    const text = await readImage(url);
    return text && text.length > 3 ? `here's what i can read in it:\n"${text.slice(0, 1500)}"` : `i couldn't read any clear text in that image`;
  },
});

// ── admin_activity ──────────────────────────────────────────────────────

registerTool('admin_activity', {
  category: 'info',
  description: 'Show an admin/mod\'s recent server-management activity — channels/roles they created or deleted, bans, etc. Use to see what a staff member has been doing.',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'The admin/mod to look up' } },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    if (!isEnabled(guild.id, 'adminTracking')) return 'admin-activity tracking is off for this server — turn it on to start recording';
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    const data = getAdminActivity(guild.id, target.id);
    if (!data) return `no recorded admin activity for ${target.displayName} (since tracking was turned on)`;
    const summary = Object.entries(data.counts).map(([k, v]) => `${k}: ${v}`).join(', ');
    const recent = data.recent.map(a => `• ${a.action} ${a.target} <t:${Math.floor(a.at / 1000)}:R>`).join('\n');
    return `**${target.displayName}'s admin activity** (${data.total} actions)\n${summary}\n\nrecent:\n${recent}`;
  },
});

// ── search_memory ───────────────────────────────────────────────────────

registerTool('search_memory', {
  category: 'assistant',
  description: 'Search the server\'s long-term conversation vault for past discussions about a topic. Use when someone asks "what did we say about X", "did anyone mention X", or you need older context.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What to search for in past conversations' } },
    required: ['query'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    if (!isEnabled(guild.id, 'vault')) return 'the conversation vault is off for this server (turn it on to give me long-term memory)';
    const hits = searchVault(guild.id, params.query, 5);
    if (hits.length === 0) return `i don't have past conversations about "${params.query}" in my memory`;
    const lines = hits.map(d => {
      const ago = Math.round((Date.now() - d.at) / 86400000);
      return `• ${d.author} in #${d.channel} (${ago === 0 ? 'today' : ago + 'd ago'}): "${d.text}"`;
    });
    return `here's what i found about "${params.query}":\n${lines.join('\n')}`;
  },
});

// ── remember_lore ───────────────────────────────────────────────────────

registerTool('remember_lore', {
  category: 'assistant',
  description: 'Save a notable/funny moment as server lore. Use when someone says "remember this", "add this to the lore", or a moment is worth keeping.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The quote/moment to save' },
      who: { type: 'string', description: 'Who said/did it (optional)' },
    },
    required: ['text'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, channel }) {
    if (!isEnabled(guild.id, 'lore')) return 'server lore is off for this server (turn it on first)';
    const r = addLore(guild.id, { text: params.text, author: params.who || 'someone', channel: channel?.name });
    return r.dupe ? `that\'s already in the lore` : `added to the lore 📖 (#${r.entry.id})`;
  },
});

// ── recall_lore ─────────────────────────────────────────────────────────

registerTool('recall_lore', {
  category: 'assistant',
  description: 'Recall a random piece of server lore — a notable past moment',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    if (!isEnabled(guild.id, 'lore')) return 'server lore is off for this server';
    const e = recallLore(guild.id);
    if (!e) return 'no lore saved yet — react to good messages or say "remember this" to start building it';
    const ago = Math.round((Date.now() - e.at) / 86400000);
    return `📖 from the lore (${ago === 0 ? 'today' : ago + 'd ago'}) — ${e.author}: "${e.text}"`;
  },
});

// ── search_lore ─────────────────────────────────────────────────────────

registerTool('search_lore', {
  category: 'assistant',
  description: 'Search server lore by keyword or person',
  parameters: {
    type: 'object',
    properties: { keyword: { type: 'string', description: 'Word or name to find in the lore' } },
    required: ['keyword'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    if (!isEnabled(guild.id, 'lore')) return 'server lore is off for this server';
    const hits = searchLore(guild.id, params.keyword);
    if (hits.length === 0) return `no lore matching "${params.keyword}"`;
    return `lore matching "${params.keyword}":\n${hits.map(e => `📖 ${e.author}: "${e.text}"`).join('\n')}`;
  },
});
