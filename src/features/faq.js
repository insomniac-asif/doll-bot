// Auto-FAQ — Doll learns the repeat questions a server gets and answers them.
// Entries: { id, q, a, keywords[], hits, source }. Stored per-guild.
// Used three ways: (1) injected into AI context so Doll answers correctly when
// engaged, (2) conservative auto-answer of obvious repeat questions, (3) CRUD
// via AI tools. Built from history by mining channels with the LLM.

import { getStore, saveStore } from '../store.js';
import { complete, completeJson } from './llm.js';
import { ChannelType } from 'discord.js';

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'does', 'how', 'what', 'where', 'when', 'why', 'can', 'i', 'you', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'my', 'me', 'we', 'it', 'this', 'that', 'with', 'get', 'got', 'have', 'has', 'be', 'will', 'would', 'should', 'could', 'about', 'please', 'help', 'anyone', 'someone', 'there', 'here', 'doll']);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

function store(guildId) {
  return getStore('faq', guildId, { entries: [], nextId: 1 });
}

export function listFaq(guildId) {
  return store(guildId).entries;
}

export function addFaq(guildId, q, a, source = 'manual') {
  const s = store(guildId);
  const keywords = [...new Set(tokenize(q))];
  // Avoid near-duplicates
  const existing = s.entries.find(e => tokenize(e.q).filter(t => keywords.includes(t)).length >= Math.max(2, keywords.length * 0.6));
  if (existing) {
    existing.a = a; // update the answer
    saveStore('faq', guildId, s);
    return { updated: true, entry: existing };
  }
  const entry = { id: s.nextId++, q, a, keywords, hits: 0, source };
  s.entries.push(entry);
  saveStore('faq', guildId, s);
  return { updated: false, entry };
}

export function removeFaq(guildId, idOrText) {
  const s = store(guildId);
  const before = s.entries.length;
  if (/^\d+$/.test(String(idOrText))) {
    s.entries = s.entries.filter(e => e.id !== Number(idOrText));
  } else {
    const kw = tokenize(idOrText);
    s.entries = s.entries.filter(e => kw.filter(t => e.keywords.includes(t)).length < 2);
  }
  saveStore('faq', guildId, s);
  return before - s.entries.length;
}

// Score how well a query matches an entry (0..1).
function scoreEntry(queryTokens, entry) {
  if (queryTokens.length === 0) return 0;
  const matches = queryTokens.filter(t => entry.keywords.includes(t)).length;
  return matches / Math.max(queryTokens.length, entry.keywords.length, 1);
}

// Best match for a query, with the score.
export function matchFaq(guildId, query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  let best = null, bestScore = 0;
  for (const entry of store(guildId).entries) {
    const score = scoreEntry(tokens, entry);
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  if (!best) return null;
  return { entry: best, score: bestScore };
}

// Top-N entries relevant to a query, for AI context injection.
export function getFaqContext(guildId, query, n = 3) {
  const tokens = tokenize(query);
  const scored = store(guildId).entries
    .map(e => ({ e, score: scoreEntry(tokens, e) }))
    .filter(x => x.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
  if (scored.length === 0) return '';
  const lines = scored.map(x => `Q: ${x.e.q}\nA: ${x.e.a}`);
  return `\n\nknown answers to common questions here (use if relevant):\n${lines.join('\n\n')}`;
}

function bumpHit(guildId, entryId) {
  const s = store(guildId);
  const e = s.entries.find(x => x.id === entryId);
  if (e) { e.hits++; saveStore('faq', guildId, s); }
}

// ── Auto-answer ──────────────────────────────────────────────────────────
// Conservative: only fires on clear questions that strongly match an entry.
// Per-channel cooldown stops Doll from spamming.

const autoCooldown = new Map(); // channelId -> timestamp
const AUTO_COOLDOWN_MS = 60_000;

function looksLikeQuestion(text) {
  if (!text) return false;
  if (text.includes('?')) return true;
  return /^(how|what|where|when|why|who|can|does|is there|do you|anyone know|is it possible)\b/i.test(text.trim());
}

export function tryAutoAnswerFaq(guildId, channelId, text) {
  if (!looksLikeQuestion(text)) return null;
  const last = autoCooldown.get(channelId) || 0;
  if (Date.now() - last < AUTO_COOLDOWN_MS) return null;

  const match = matchFaq(guildId, text);
  if (!match || match.score < 0.5) return null;
  const tokens = tokenize(text);
  // Require at least 2 concrete keyword overlaps to be safe
  if (tokens.filter(t => match.entry.keywords.includes(t)).length < 2) return null;

  autoCooldown.set(channelId, Date.now());
  bumpHit(guildId, match.entry.id);
  return match.entry.a;
}

// ── Build from history ───────────────────────────────────────────────────
// Mine recent messages across channels, extract recurring Q&A with the LLM.

export async function buildFaqFromHistory(guild, maxChannels = 8) {
  const textChannels = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText && c.viewable)
    .sort((a, b) => a.position - b.position)
    .first(maxChannels);

  let collected = [];
  for (const ch of textChannels) {
    try {
      const msgs = await ch.messages.fetch({ limit: 80 });
      for (const m of msgs.values()) {
        if (m.author.bot || !m.content) continue;
        if (m.content.length > 15 && m.content.length < 400) {
          collected.push(`${m.member?.displayName || m.author.username}: ${m.content}`);
        }
      }
    } catch { /* no access */ }
  }

  if (collected.length < 10) return { added: 0, reason: 'not enough history to learn from yet' };

  const transcript = collected.slice(-300).join('\n').substring(0, 9000);

  const result = await completeJson(
    `You analyze a Discord server's chat to build an FAQ. Identify recurring QUESTIONS members ask and the best ANSWER from context. Only include questions that are clearly about how this server/community works (rules, roles, channels, how to do things) — NOT casual chat. Return JSON: {"faqs":[{"q":"...","a":"..."}]}. Max 12. If the answer isn't clear from context, give a sensible short answer or skip it. Keep answers under 2 sentences.`,
    `Chat log:\n\n${transcript}`,
    { maxTokens: 1200, temperature: 0.3 },
  );

  if (!result?.faqs?.length) return { added: 0, reason: 'couldn\'t extract clear FAQs from the chat' };

  let added = 0;
  for (const f of result.faqs) {
    if (f.q && f.a) { addFaq(guild.id, f.q.substring(0, 300), f.a.substring(0, 500), 'history'); added++; }
  }
  return { added };
}
