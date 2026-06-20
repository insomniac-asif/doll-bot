// Conversation vault — a searchable long-term memory of what's been said in the
// server (ported concept from Crodie, made multi-guild). Doll archives
// meaningful messages, and when she's engaged she can pull up relevant past
// context via a lightweight TF-IDF search. Opt-in per server (toggle 'vault').
//
// Bounded: keeps the most recent N meaningful messages per guild so it never
// grows without limit. Stored as per-guild JSON.

import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

const MAX_DOCS = 1500;
const MIN_LEN = 25;            // skip short/noise messages
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'it', 'this', 'that', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'my', 'your', 'so', 'just', 'like', 'lol', 'lmao', 'yeah', 'nah', 'ok', 'okay', 'doll']);

function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

function load(guildId) { return getStore('vault', guildId, { docs: [] }); }

export function archiveMessage(message) {
  if (message.author?.bot || !message.guild) return;
  if (!isEnabled(message.guild.id, 'vault')) return;
  const text = message.content?.trim();
  if (!text || text.length < MIN_LEN) return;

  const s = load(message.guild.id);
  s.docs.push({
    text: text.slice(0, 400),
    author: message.member?.displayName || message.author.username,
    channel: message.channel.name,
    at: Date.now(),
  });
  if (s.docs.length > MAX_DOCS) s.docs = s.docs.slice(-MAX_DOCS);
  saveStore('vault', message.guild.id, s);
}

// TF-IDF-ish scoring: rarer query terms weigh more.
export function searchVault(guildId, query, n = 3) {
  const docs = load(guildId).docs;
  if (docs.length === 0) return [];
  const qTerms = [...new Set(tokenize(query))];
  if (qTerms.length === 0) return [];

  // document frequency for each query term
  const df = {};
  for (const term of qTerms) df[term] = 0;
  const docTokens = docs.map(d => new Set(tokenize(d.text)));
  for (const toks of docTokens) for (const term of qTerms) if (toks.has(term)) df[term]++;

  const N = docs.length;
  const scored = docs.map((d, i) => {
    let score = 0;
    for (const term of qTerms) {
      if (docTokens[i].has(term) && df[term] > 0) {
        score += Math.log(1 + N / df[term]); // idf weight
      }
    }
    return { d, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, n);

  return scored.map(x => x.d);
}

// Compact context block for the AI prompt.
export function getVaultContext(guildId, query) {
  if (!isEnabled(guildId, 'vault')) return '';
  const hits = searchVault(guildId, query, 3);
  if (hits.length === 0) return '';
  const lines = hits.map(d => {
    const ago = Math.round((Date.now() - d.at) / 86400000);
    return `- ${d.author} in #${d.channel} (${ago === 0 ? 'today' : ago + 'd ago'}): "${d.text}"`;
  });
  return `\n\nrelevant past conversations from the server (your long-term memory — use if helpful):\n${lines.join('\n')}`;
}

export function vaultSize(guildId) { return load(guildId).docs.length; }
