// Natural-language automation rules. Owners describe rules in plain English
// ("auto-mute anyone posting 5+ links in 10 seconds", "when someone hits level
// 10, give them Regular and post to #staff"). The LLM compiles the description
// into a structured rule; the evaluator runs it on the matching trigger.
//
// Rule shape:
// {
//   id, description, enabled,
//   trigger: 'message' | 'join' | 'levelup',
//   conditions: { ... },     // trigger-specific
//   actions: [ { type, ... } ]
// }

import { getStore, saveStore } from '../store.js';
import { completeJson } from './llm.js';
import { resolveRole, resolveChannel } from './resolvers.js';
import { getConfig, saveConfig } from '../config.js';

function store(guildId) {
  return getStore('rules', guildId, { rules: [], nextId: 1 });
}

export function listRules(guildId) {
  return store(guildId).rules;
}

export function removeRule(guildId, id) {
  const s = store(guildId);
  const before = s.rules.length;
  s.rules = s.rules.filter(r => r.id !== Number(id));
  saveStore('rules', guildId, s);
  return before - s.rules.length;
}

export function setRuleEnabled(guildId, id, enabled) {
  const s = store(guildId);
  const r = s.rules.find(x => x.id === Number(id));
  if (!r) return false;
  r.enabled = enabled;
  saveStore('rules', guildId, s);
  return true;
}

// ── Compile English → structured rule ────────────────────────────────────

const COMPILE_SYSTEM = `You compile a Discord moderation/automation rule from plain English into JSON.

Return ONLY JSON: {"trigger": "...", "conditions": {...}, "actions": [...], "summary": "short human description"}

trigger is one of: "message", "join", "levelup"

For trigger "message", conditions may include any of:
- "contains_words": ["word1","word2"]   (message text contains any of these, case-insensitive)
- "link_count_min": N                    (message has N+ links)
- "mention_count_min": N                 (message pings N+ users/roles)
- "caps_ratio_min": 0.0-1.0              (fraction of letters that are CAPS; also needs min length 8)
- "has_invite": true                     (message contains a Discord invite link)
- "rate_messages": {"count": N, "seconds": S}  (user sent N messages within S seconds)
- "rate_links": {"count": N, "seconds": S}     (user posted N links within S seconds)

For trigger "levelup", conditions may include:
- "level": N        (fires when a member reaches exactly level N)
- "level_min": N    (fires at level N or above)

For trigger "join": conditions is usually {} (fires for every new member). Optionally:
- "account_younger_than_days": N   (account created less than N days ago)

actions is an array; each action is one of:
- {"type":"delete"}                          (delete the triggering message)
- {"type":"warn","reason":"..."}             (warn the user)
- {"type":"timeout","minutes":N,"reason":"..."}
- {"type":"kick","reason":"..."}
- {"type":"ban","reason":"..."}
- {"type":"dm","text":"..."}                 (DM the user)
- {"type":"assign_role","role":"Role Name"}
- {"type":"remove_role","role":"Role Name"}
- {"type":"post","channel":"channel-name","text":"..."}   (post a message to a channel; use {user} for a mention)

Use {user} in dm/post text to reference the member. Keep it minimal — only include conditions/actions the English actually asks for. If the request is unclear or unsafe, return {"error":"reason"}.`;

export async function compileRule(guildId, description) {
  const result = await completeJson(COMPILE_SYSTEM, `Rule: ${description}`, { maxTokens: 500, temperature: 0.2 });
  if (!result) return { error: 'i couldn\'t understand that rule — try rephrasing it' };
  if (result.error) return { error: result.error };
  if (!result.trigger || !Array.isArray(result.actions) || result.actions.length === 0) {
    return { error: 'that rule is missing a trigger or an action' };
  }

  const s = store(guildId);
  const rule = {
    id: s.nextId++,
    description: result.summary || description,
    original: description,
    enabled: true,
    trigger: result.trigger,
    conditions: result.conditions || {},
    actions: result.actions,
  };
  s.rules.push(rule);
  saveStore('rules', guildId, s);
  return { rule };
}

// ── Rate tracking (sliding windows per user) ─────────────────────────────

const rateBuckets = new Map(); // `${guildId}:${userId}` -> { msgs: [ts], links: [ts] }

function recordRate(guildId, userId, linkCount) {
  const key = `${guildId}:${userId}`;
  if (!rateBuckets.has(key)) rateBuckets.set(key, { msgs: [], links: [] });
  const b = rateBuckets.get(key);
  const now = Date.now();
  b.msgs.push(now);
  for (let i = 0; i < linkCount; i++) b.links.push(now);
  // Prune anything older than 2 minutes
  const cutoff = now - 120_000;
  b.msgs = b.msgs.filter(t => t > cutoff);
  b.links = b.links.filter(t => t > cutoff);
  return b;
}

function countWithin(arr, seconds) {
  const cutoff = Date.now() - seconds * 1000;
  return arr.filter(t => t > cutoff).length;
}

// ── Condition evaluation ─────────────────────────────────────────────────

const LINK_RE = /https?:\/\/\S+/gi;
const INVITE_RE = /(discord\.gg|discord(app)?\.com\/invite)\/\S+/i;

function evalMessageConditions(message, conditions, bucket) {
  const text = message.content || '';

  if (conditions.contains_words?.length) {
    const lower = text.toLowerCase();
    if (!conditions.contains_words.some(w => lower.includes(String(w).toLowerCase()))) return false;
  }
  if (conditions.link_count_min) {
    const links = (text.match(LINK_RE) || []).length;
    if (links < conditions.link_count_min) return false;
  }
  if (conditions.mention_count_min) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions < conditions.mention_count_min) return false;
  }
  if (conditions.caps_ratio_min) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 8) return false;
    const caps = text.replace(/[^A-Z]/g, '').length;
    if (caps / letters.length < conditions.caps_ratio_min) return false;
  }
  if (conditions.has_invite) {
    if (!INVITE_RE.test(text)) return false;
  }
  if (conditions.rate_messages) {
    const { count, seconds } = conditions.rate_messages;
    if (countWithin(bucket.msgs, seconds) < count) return false;
  }
  if (conditions.rate_links) {
    const { count, seconds } = conditions.rate_links;
    if (countWithin(bucket.links, seconds) < count) return false;
  }
  return true;
}

// ── Action execution ─────────────────────────────────────────────────────

async function runAction(action, { guild, member, message, channel }) {
  try {
    switch (action.type) {
      case 'delete':
        if (message) await message.delete().catch(() => {});
        break;
      case 'warn': {
        const config = getConfig(guild.id);
        if (!config.warnings[member.id]) config.warnings[member.id] = [];
        config.warnings[member.id].push({ reason: action.reason || 'Automation rule', by: guild.members.me.id, at: Date.now() });
        saveConfig(guild.id, config);
        break;
      }
      case 'timeout':
      case 'mute':
        if (member.moderatable) await member.timeout((action.minutes || 10) * 60_000, action.reason || 'Automation rule').catch(() => {});
        break;
      case 'kick':
        if (member.kickable) await member.kick(action.reason || 'Automation rule').catch(() => {});
        break;
      case 'ban':
        if (member.bannable) await guild.members.ban(member, { reason: action.reason || 'Automation rule' }).catch(() => {});
        break;
      case 'dm':
        await member.send((action.text || '').replace(/\{user\}/g, member.displayName)).catch(() => {});
        break;
      case 'assign_role': {
        const role = resolveRole(guild, action.role);
        if (role) await member.roles.add(role).catch(() => {});
        break;
      }
      case 'remove_role': {
        const role = resolveRole(guild, action.role);
        if (role) await member.roles.remove(role).catch(() => {});
        break;
      }
      case 'post': {
        const ch = resolveChannel(guild, action.channel) || channel;
        if (ch?.isTextBased?.()) {
          await ch.send({
            content: (action.text || '').replace(/\{user\}/g, `<@${member.id}>`),
            allowedMentions: { users: [member.id] },
          }).catch(() => {});
        }
        break;
      }
    }
  } catch (e) {
    console.error(`[Rules] Action ${action.type} failed:`, e.message);
  }
}

// ── Public evaluators (wired into events) ────────────────────────────────

export async function evaluateMessage(message) {
  if (message.author.bot || !message.guild) return;
  const rules = store(message.guild.id).rules.filter(r => r.enabled && r.trigger === 'message');
  // Always record rate even if no rate rule, so windows are warm
  const linkCount = (message.content?.match(LINK_RE) || []).length;
  const bucket = recordRate(message.guild.id, message.author.id, linkCount);
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (evalMessageConditions(message, rule.conditions, bucket)) {
      const ctx = { guild: message.guild, member: message.member, message, channel: message.channel };
      for (const action of rule.actions) await runAction(action, ctx);
    }
  }
}

export async function evaluateJoin(member) {
  const rules = store(member.guild.id).rules.filter(r => r.enabled && r.trigger === 'join');
  for (const rule of rules) {
    const c = rule.conditions || {};
    if (c.account_younger_than_days) {
      const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
      if (ageDays >= c.account_younger_than_days) continue;
    }
    const ctx = { guild: member.guild, member, message: null, channel: null };
    for (const action of rule.actions) await runAction(action, ctx);
  }
}

export async function evaluateLevelUp(member, level) {
  const rules = store(member.guild.id).rules.filter(r => r.enabled && r.trigger === 'levelup');
  for (const rule of rules) {
    const c = rule.conditions || {};
    if (c.level !== undefined && level !== c.level) continue;
    if (c.level_min !== undefined && level < c.level_min) continue;
    const ctx = { guild: member.guild, member, message: null, channel: null };
    for (const action of rule.actions) await runAction(action, ctx);
  }
}

// Pretty-print a rule for humans.
export function describeRule(rule) {
  const cond = JSON.stringify(rule.conditions);
  const acts = rule.actions.map(a => a.type).join(', ');
  return `#${rule.id} ${rule.enabled ? '' : '(disabled) '}[${rule.trigger}] ${rule.description} — actions: ${acts}`;
}
