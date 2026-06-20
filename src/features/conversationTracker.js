// Tracks active conversations so Doll keeps responding to follow-ups without
// the user needing to say "doll" or @mention every time. Once a conversation
// starts (user triggers Doll), she stays engaged for ACTIVE_TTL as long as
// messages keep coming. Resets the timer on each exchange.

const ACTIVE_TTL = 3 * 60 * 1000;        // 3 minutes of silence ends the convo
const MIN_EXCHANGES = 1;                   // 1 exchange = user triggered + Doll replied

// Map<`${channelId}:${userId}` -> { exchanges, lastActivity, dollLastMsg }>
const conversations = new Map();

// Call after Doll sends a reply.
export function markDollReply(channelId, userId) {
  const key = `${channelId}:${userId}`;
  const convo = conversations.get(key) || { exchanges: 0, lastActivity: 0, dollLastMsg: 0 };
  convo.exchanges += 1;
  convo.dollLastMsg = Date.now();
  convo.lastActivity = Date.now();
  conversations.set(key, convo);
}

// Call when checking whether Doll should respond to a user's message.
// Returns true if there's an active conversation window.
export function isActiveConversation(channelId, userId) {
  const key = `${channelId}:${userId}`;
  const convo = conversations.get(key);
  if (!convo) return false;
  if (Date.now() - convo.lastActivity > ACTIVE_TTL) {
    conversations.delete(key);
    return false;
  }
  if (convo.exchanges < MIN_EXCHANGES) return false;
  // Refresh the timer since the user is still talking
  convo.lastActivity = Date.now();
  return true;
}

// ── Action context ──────────────────────────────────────────────────────
// When Doll is in the middle of a server-management task (created roles, asked
// "what should I name the channel?", etc.), follow-up messages like "roles as
// the name" or "yeah do it" must keep routing to the TOOL path — otherwise the
// chat model answers and may falsely claim it did the action. We mark an action
// context per channel+user and keep it warm for a few minutes.
const ACTION_TTL = 5 * 60 * 1000;
const actionContext = new Map(); // `${channelId}:${userId}` -> timestamp

export function markActionContext(channelId, userId) {
  actionContext.set(`${channelId}:${userId}`, Date.now());
}

export function isActionContext(channelId, userId) {
  const t = actionContext.get(`${channelId}:${userId}`);
  if (!t) return false;
  if (Date.now() - t > ACTION_TTL) { actionContext.delete(`${channelId}:${userId}`); return false; }
  return true;
}

export function clearActionContext(channelId, userId) {
  actionContext.delete(`${channelId}:${userId}`);
}

// Also track Doll's last message time per channel (for any-user context).
const dollChannelActivity = new Map(); // channelId -> timestamp

export function markDollChannelActivity(channelId) {
  dollChannelActivity.set(channelId, Date.now());
}

// Was Doll's last message in this channel within the last N ms?
// Used so that if Doll just spoke and someone replies (not via Discord reply),
// she picks it up.
export function dollSpokeRecently(channelId, withinMs = 60_000) {
  const t = dollChannelActivity.get(channelId);
  return t && (Date.now() - t) < withinMs;
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, convo] of conversations) {
    if (now - convo.lastActivity > ACTIVE_TTL * 2) conversations.delete(key);
  }
  for (const [key, t] of dollChannelActivity) {
    if (now - t > 10 * 60 * 1000) dollChannelActivity.delete(key);
  }
  for (const [key, t] of actionContext) {
    if (now - t > ACTION_TTL) actionContext.delete(key);
  }
}, 60_000).unref?.();
