// Shared one-shot LLM helper for AI features (catch-up, FAQ, rules compilation,
// digest, translate). Routes through aiProvider so it's Mistral-first /
// DeepSeek-fallback and counted alongside everything else.

import { chatText } from './aiProvider.js';

/**
 * Run a one-shot LLM completion with a system + user prompt.
 * Returns the text (or '' on total failure).
 */
export async function complete(systemPrompt, userPrompt, opts = {}) {
  const { maxTokens = 500, temperature = 0.5, json = false } = opts;
  return chatText([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens, temperature, json });
}

/**
 * Like complete() but parses a JSON object out of the reply. Returns null on failure.
 */
export async function completeJson(systemPrompt, userPrompt, opts = {}) {
  const raw = await complete(systemPrompt, userPrompt, { ...opts, json: true });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }
    return null;
  }
}
