// Single source of truth for LLM calls. Mistral (free tier) is primary for
// EVERYTHING — chat, tool-calling, and feature helpers. DeepSeek is only a
// fallback when Mistral errors or rate-limits (429). This keeps normal usage
// free; DeepSeek (pay-as-you-go) only costs money when Mistral is unavailable.
//
// Flip the order with PRIMARY_AI=deepseek in .env if you ever want to.

const PRIMARY = (process.env.PRIMARY_AI || 'mistral').toLowerCase();

const PROVIDERS = {
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: () => process.env.MISTRAL_MODEL || 'mistral-large-latest',
    key: () => process.env.MISTRAL_API_KEY,
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: () => process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    key: () => process.env.DEEPSEEK_API_KEY,
  },
};

// Lightweight in-memory usage counters so you can verify who's being used.
const usage = {
  mistral: 0, deepseek: 0, mistralFail: 0, deepseekFail: 0, fallbacks: 0,
  mistralIn: 0, mistralOut: 0, deepseekIn: 0, deepseekOut: 0, sinceReset: Date.now(),
};

// $/million tokens (input, output) — current public rates, June 2026. Update if
// you switch models. Keyed by the model alias actually in use.
const PRICES = {
  'mistral-large-latest': { in: 0.50, out: 1.50 },
  'mistral-medium-latest': { in: 1.50, out: 7.50 },
  'mistral-small-latest': { in: 0.10, out: 0.30 },
  'ministral-8b-latest': { in: 0.15, out: 0.15 },
  'deepseek-chat': { in: 0.14, out: 0.28 }, // cache-miss input; cache hits are ~50x cheaper
};
function priceFor(provider) {
  const model = PROVIDERS[provider].model();
  return PRICES[model] || (provider === 'mistral' ? PRICES['mistral-large-latest'] : PRICES['deepseek-chat']);
}

async function callOne(provider, messages, { tools, maxTokens, temperature, json }) {
  const p = PROVIDERS[provider];
  const key = p.key();
  if (!key) throw new Error(`${provider}: no API key`);

  const body = { model: p.model(), messages, max_tokens: maxTokens, temperature };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`${provider} ${res.status}: ${txt.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Retry the same provider once on a 429 (rate limit) before failing over.
// Keeps transient rate-limits on the FREE provider instead of paying DeepSeek.
async function callWithRetry(provider, messages, opts) {
  try {
    return await callOne(provider, messages, opts);
  } catch (e) {
    if (e.status === 429) {
      await new Promise(r => setTimeout(r, 900));
      return callOne(provider, messages, opts); // one retry
    }
    throw e;
  }
}

/**
 * Run a chat completion with automatic Mistral→DeepSeek failover.
 * @returns {{ provider: string, response: object }}
 */
export async function chatCompletion(messages, opts = {}) {
  const { tools = null, maxTokens = 600, temperature = 0.7, json = false } = opts;
  const order = PRIMARY === 'deepseek' ? ['deepseek', 'mistral'] : ['mistral', 'deepseek'];

  let lastErr;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    if (!PROVIDERS[provider].key()) continue; // skip unconfigured provider
    try {
      const response = await callWithRetry(provider, messages, { tools, maxTokens, temperature, json });
      usage[provider]++;
      const u = response.usage;
      if (u) {
        usage[`${provider}In`] += u.prompt_tokens || 0;
        usage[`${provider}Out`] += u.completion_tokens || 0;
      }
      if (i > 0) {
        usage.fallbacks++;
        console.warn(`[AI] used ${provider} as fallback (primary unavailable)`);
      }
      return { provider, response };
    } catch (e) {
      usage[`${provider}Fail`]++;
      lastErr = e;
      const more = i < order.length - 1 ? ' → trying fallback' : '';
      console.warn(`[AI] ${provider} failed: ${e.message}${more}`);
    }
  }
  throw lastErr || new Error('no AI provider available');
}

// Convenience: return just the assistant text (or '' on total failure).
export async function chatText(messages, opts = {}) {
  try {
    const { response } = await chatCompletion(messages, opts);
    return response.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    console.error('[AI] all providers failed:', e.message);
    return '';
  }
}

export function getUsageStats() {
  const total = usage.mistral + usage.deepseek;
  const mp = priceFor('mistral'), dp = priceFor('deepseek');
  const mistralCost = (usage.mistralIn / 1e6) * mp.in + (usage.mistralOut / 1e6) * mp.out;
  const deepseekCost = (usage.deepseekIn / 1e6) * dp.in + (usage.deepseekOut / 1e6) * dp.out;
  const calls = total || 1;
  const costPerCall = (mistralCost + deepseekCost) / calls;
  return {
    ...usage,
    total,
    deepseekShare: total ? Math.round((usage.deepseek / total) * 100) : 0,
    uptimeMin: Math.round((Date.now() - usage.sinceReset) / 60000),
    primary: PRIMARY,
    mistralModel: PROVIDERS.mistral.model(),
    mistralCost, deepseekCost,
    totalCost: mistralCost + deepseekCost,
    costPerCall,
    projMonthly10k: costPerCall * 20000, // ~2 calls per command × 10k commands
  };
}

export function resetUsage() {
  Object.assign(usage, { mistral: 0, deepseek: 0, mistralFail: 0, deepseekFail: 0, fallbacks: 0, sinceReset: Date.now() });
}
