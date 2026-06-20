// Lightweight sliding-window rate limiting. Protects against spam and keeps
// LLM cost bounded — per-user and per-guild. In-memory; resets on restart.

const buckets = new Map(); // key -> [timestamps]

function hit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => t > now - windowMs);
  if (arr.length >= limit) {
    const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { allowed: true };
}

// Periodic sweep so old keys don't accumulate.
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of buckets.entries()) {
    const fresh = arr.filter(t => t > now - 120_000);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, 120_000).unref?.();

// ── Limits ───────────────────────────────────────────────────────────────
// Tuned to be generous for real use, strict enough to stop spam/cost blowups.

const LIMITS = {
  chatUser: { limit: 10, windowMs: 60_000 },   // AI replies per user / minute
  chatGuild: { limit: 40, windowMs: 60_000 },  // AI replies per guild / minute (cost cap)
  toolUser: { limit: 20, windowMs: 60_000 },   // tool executions per user / minute
  heavyUser: { limit: 6, windowMs: 60_000 },   // heavy LLM ops (catch-up, faq build, digest) / user
};

/** Gate an AI chat response. */
export function checkChat(guildId, userId) {
  const u = hit(`chat:u:${userId}`, LIMITS.chatUser.limit, LIMITS.chatUser.windowMs);
  if (!u.allowed) return { allowed: false, scope: 'user', retryAfter: u.retryAfter };
  const g = hit(`chat:g:${guildId}`, LIMITS.chatGuild.limit, LIMITS.chatGuild.windowMs);
  if (!g.allowed) return { allowed: false, scope: 'guild', retryAfter: g.retryAfter };
  return { allowed: true };
}

/** Gate a tool execution (mutations). */
export function checkTool(userId) {
  return hit(`tool:u:${userId}`, LIMITS.toolUser.limit, LIMITS.toolUser.windowMs);
}

/** Gate a heavy LLM operation (catch-up, faq build, digest, announcement). */
export function checkHeavy(userId) {
  return hit(`heavy:u:${userId}`, LIMITS.heavyUser.limit, LIMITS.heavyUser.windowMs);
}
