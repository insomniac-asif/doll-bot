// FAQ tools — build from history, add, remove, list, search.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { isEnabled } from '../features/featureToggle.js';
import { buildFaqFromHistory, addFaq, removeFaq, listFaq, matchFaq } from '../features/faq.js';

// ── build_faq ───────────────────────────────────────────────────────────

registerTool('build_faq', {
  category: 'assistant',
  description: 'Learn the server\'s FAQ by scanning chat history for recurring questions and their answers. Run this once to bootstrap, or again to refresh.',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.ADMIN,
  async execute(_params, { guild }) {
    if (!isEnabled(guild.id, 'autoFaq')) return 'auto-FAQ is turned off for this server (turn it on first)';
    const result = await buildFaqFromHistory(guild);
    if (result.added === 0) return result.reason || 'couldn\'t build an FAQ from history';
    return `learned ${result.added} FAQ entries from chat history. i'll answer these automatically now`;
  },
});

// ── add_faq ─────────────────────────────────────────────────────────────

registerTool('add_faq', {
  category: 'assistant',
  description: 'Add a question→answer pair to the server FAQ so Doll answers it automatically',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question' },
      answer: { type: 'string', description: 'The answer Doll should give' },
    },
    required: ['question', 'answer'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const { updated } = addFaq(guild.id, params.question, params.answer, 'manual');
    return updated
      ? `updated the answer for "${params.question}"`
      : `added to the FAQ: "${params.question}"`;
  },
});

// ── remove_faq ──────────────────────────────────────────────────────────

registerTool('remove_faq', {
  category: 'assistant',
  description: 'Remove an FAQ entry by its number or by describing the question',
  parameters: {
    type: 'object',
    properties: { question: { type: 'string', description: 'The FAQ number or question text to remove' } },
    required: ['question'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const removed = removeFaq(guild.id, params.question);
    return removed > 0 ? `removed ${removed} FAQ entry/entries` : `couldn't find a matching FAQ entry`;
  },
});

// ── list_faq ────────────────────────────────────────────────────────────

registerTool('list_faq', {
  category: 'assistant',
  description: 'Show the server\'s learned FAQ entries',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const entries = listFaq(guild.id);
    if (entries.length === 0) return 'no FAQ entries yet — run build_faq or add some';
    const lines = entries.slice(0, 25).map(e => `${e.id}. Q: ${e.q}\n   A: ${e.a}${e.hits ? ` (answered ${e.hits}×)` : ''}`);
    const extra = entries.length > 25 ? `\n…and ${entries.length - 25} more` : '';
    return `server FAQ (${entries.length} entries):\n${lines.join('\n')}${extra}`;
  },
});
