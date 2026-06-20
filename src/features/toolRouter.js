// AI Tool Router — routes messages between pure chat (Mistral) and
// tool-calling (DeepSeek) paths. Handles the full function-calling loop
// including permission gating, execution, and result synthesis.

import { getTool, getToolDefinitions, PermLevel } from './toolRegistry.js';
import { isMod } from './roles.js';
import { requestApproval } from './approvals.js';
import { requestConfirmation, defaultPreview } from './confirmations.js';
import { checkTool, checkHeavy } from './rateLimiter.js';
import { isCategoryEnabled } from './featureToggle.js';
import { chatCompletion } from './aiProvider.js';
import { logIssue } from './devMonitor.js';

// Tools that make expensive LLM calls — rate-limited more tightly.
const HEAVY_TOOLS = new Set(['catch_up', 'build_faq', 'draft_announcement', 'server_digest', 'create_rule', 'translate']);

// ── Intent Detection ────────────────────────────────────────────────────

const MANAGEMENT_PATTERNS = [
  // Moderation
  /\b(kick|ban|unban|mute|unmute|timeout|warn)\b/i,
  /\bpurge\b|\bclear\s+\d+/i,
  /\blockdown\b|\block\s+(the\s+)?(server|channel)/i,
  /\bunlock\b.*\b(server|channel)\b/i,

  // Channel management
  /\b(create|make|add|set\s?up|delete|remove|rename)\b.*\b(channel|category|text.?channel|voice.?channel)\b/i,
  /\b(channel|category)\b.*\b(create|make|delete|remove|rename)\b/i,
  /\b(move|put|nest|organi[sz]e)\b.*\b(under|into|in|to)\b.*\b(category|channel)\b/i,
  /\b(should be|go)\s+(under|in|inside)\b.*\bcategory\b/i,
  /\b(make|set|lock)\b.*\b(read[\s-]?only|staff[\s-]?only|private|hidden|public)\b/i,
  /\b(who can|permissions?|visibility|access)\b.*\bchannel\b/i,
  /\b(contact|message|tell|report|reach)\b.*\b(developer|dev|creator|whoever made you)\b/i,
  /\b(bug|feature request|report a (bug|problem|issue))\b/i,
  /\b(rules?\s+(sheet|sample|template)|sample\s+rules|draft\s+(the\s+)?rules|make\s+(some\s+)?rules)\b/i,
  /\bslowmode\b/i,
  /\bedit\s+#?\w+.*\b(topic|name|nsfw)\b/i,
  /\barchive\b.*\bchannel\b|\bchannel\b.*\barchive\b/i,
  /\b(set|change|edit|update)\s+(the\s+)?permissions?\b/i,

  // Role management
  /\b(create|make|add|delete|remove)\b.*\brole\b/i,
  /\brole\b.*\b(create|make|delete|remove)\b/i,
  /\b(give|assign|grant|add|take|remove|strip)\b.*\brole\b/i,
  /\brole\b.*\b(give|assign|grant|take|remove)\b/i,
  /\b(who\s+has|members\s+with|list)\b.*\brole\b/i,
  /\brole\s+info\b|\binfo\b.*\brole\b/i,

  // Reaction roles
  /\breaction[\s-]?role/i,
  /\b(self[\s-]?assign|self[\s-]?role)/i,
  /\b(panel|embed)\b.*\b(role|react)/i,
  /\breact\b.*\b(to\s+)?(get|for)\b.*\brole/i,

  // Member management
  /\b(set|change|remove|give)\b.*\bnickname\b/i,
  /\bnickname\b.*\b(set|change|remove|give)\b/i,
  /\bprune\b.*\bmembers?\b/i,
  /\bmember\s+info\b|\binfo\s+(about|on|for)\b/i,
  /\bban\s*list\b/i,

  // Server management
  /\b(change|edit|set|update)\b.*\b(server\s+name|server\s+icon|verification\s*level)\b/i,
  /\bserver\s+(info|stats|settings)\b/i,

  // Invite management
  /\b(create|make|generate|revoke|delete|remove)\b.*\binvite\b/i,
  /\binvite\b.*\b(create|make|revoke|delete|list)\b/i,
  /\blist\s+(the\s+)?invites?\b/i,

  // Emoji management
  /\b(add|create|upload|remove|delete)\b.*\bemoji\b/i,
  /\bemoji\b.*\b(add|create|remove|delete|list)\b/i,
  /\blist\s+(the\s+)?emojis?\b/i,

  // Music
  /\bplay\b\s+.{3,}/i,
  /\b(skip|stop\s+(the\s+)?music|pause|resume)\b/i,
  /\b(queue|now\s*playing|np|what('?s| is) playing)\b/i,
  /\b(bass\s?boost|nightcore|vaporwave|8d|audio\s+filter|filter)\b/i,
  /\b(autoplay|24\/?7|lyrics|playlist)\b/i,

  // Info queries
  /\b(check|show|view|what('?s| is| are))\b.*\b(warnings?|audit\s*log|ban\s*list)\b/i,
  /\b(my|their|his|her|check)\s+(level|xp|rank)\b/i,
  /\bleaderboard\b/i,
  /\bcheck\s+(on|up\s+on)?\s*\b(activity|presence|status)\b/i,
  /\bserver\s*stats\b/i,

  // Voice management
  /\b(disconnect|dc|move)\b.*\b(from|to)\b.*\b(vc|voice|channel)\b/i,
  /\b(disconnect|dc)\b.*\bfrom\s+voice\b/i,

  // Pin management
  /\bpin\b.*\bmessage\b|\bunpin\b/i,

  // Audit log
  /\baudit\s*log\b/i,

  // Translate / search
  /\btranslate\b/i,
  /\b(search|look\s*up|google)\b\s+.{3,}/i,

  // AI features — catch-up, announcements, FAQ, rules, digest, toggles
  /\b(catch\s*me\s*up|catch\s*up|what('?d| did)?\s*i\s*miss|what'?s?\s*been\s*happening|recap|summari[sz]e)\b/i,
  /\b(announce|announcement|make\s+an?\s+announcement|draft\s+an?\s+announcement)\b/i,
  /\b(faq|auto[\s-]?answer|common\s+questions?|frequently\s+asked)\b/i,
  /\b(build|learn|make)\b.*\bfaq\b/i,
  /\b(rule|automation|auto[\s-]?(mod|mute|kick|ban|delete|role))\b/i,
  /\bauto[\s-]?(mute|kick|ban|delete|warn|assign)\b/i,
  /\b(when|whenever|if)\b.*\b(posts?|sends?|joins?|reach(es)?|hits?|level)\b.*\b(mute|kick|ban|delete|warn|give|assign|dm|post|remove)\b/i,
  /\b(server\s+health|how('?s| is)\s+(my|the)\s+server|server\s+digest|health\s+(report|digest|check))\b/i,
  // Personality
  /\b(be|act|become|switch to|set your personality|your personality)\b.*\b(cutesy|cute|sanrio|soft|professional|formal|casual|chill|playful|strict|firmer|nicer|sweeter)\b/i,
  /\b(be more|act more)\b/i,

  // Setup / config
  /\b(set|setup|set\s*up|configure|change|make)\b.*\b(log|welcome|leave|alert|mod|admin|ai|auto)\s*(channel|role|message)\b/i,
  /\b(log|welcome|leave|alert|ai)\s*channel\b/i,
  /\b(mod|auto)\s*role\b/i,
  /\b(view|show|what('?s| is))\b.*\b(setup|config|configuration|settings)\b/i,
  /\b(setup\s+checklist|what('?s| is)\s+missing|what.*still.*(set\s*up|configure)|what.*need.*set\s*up)\b/i,
  /\b(set\s*up|build|make|create)\s+(a\s+)?(community|gaming|social|whole|full|starter)\s+server\b/i,
  /\bserver\s+template\b/i,
  /\b(back\s*up|backup|snapshot|restore|rebuild)\b.*\bserver\b|\b(back\s*up|snapshot)\b.*\b(roles|channels)\b/i,
  /\brestore\b.*\b(backup|server|channels|roles)\b/i,
  /\b(generate|make|create|gen)\b.*\b(image|banner|icon|art|emoji|picture|pfp|avatar)\b/i,
  /\b(ai|generate)\s+(image|art|picture)\b/i,
  /\bwelcome\s+(image|card|banner)\b/i,

  // Feature setup (jtc, verification, tickets, starboard, confessions)
  /\b(jtc|join[\s-]?to[\s-]?create|temp\s*(voice|vc)|temporary\s*(voice|vc))\b/i,
  /\b(set|setup|set\s*up|configure|enable)\b.*\b(verification|verify|tickets?|starboard|confessions?|temp\s*voice|jtc)\b/i,
  /\b(verification|ticket\s*system|starboard|confession\s*channel)\b/i,

  // Status / presence
  /\b(set|change|update)\s+(your|the)\s+(status|presence|activity)\b/i,
  /\b(resume|go back to)\s+.*(status|rotation|rotating)\b/i,

  // Undo
  /\b(undo|revert|take\s+that\s+back|nevermind|never\s*mind|reverse\s+that|undo\s+that)\b/i,
  /\b(undo|action)\s+(history|log)\b/i,

  // Developer overview (cross-server)
  /\b(any\s+)?(issues?|problems?)\b.*\bservers?\b/i,
  /\b(anything|something)\s+(to worry about|wrong|broken)\b/i,
  /\bhow\s+are\s+(the\s+)?servers?\b|\bservers?\s+(health|status|doing|overview)\b/i,
  /\bdev\s+(overview|report|status)\b/i,

  // Diagnostics / self-test
  /\b(run\s+)?(diagnos\w*|self[\s-]?test|health\s*check|system\s*check)\b/i,
  /\b(full|complete|run\s+a)\s+(\w+\s+)?(check|test|diagnostic\w*)\b/i,
  /\b(test|check)\s+(everything|all|yourself|your\s+(tools|features|stuff)|if\s+you\s*('?re| are)\s+working)\b/i,
  /\bare\s+you\s+(working|ok|functional|good)\b/i,
  /\bwhat\s+(can'?t|cannot)\s+you\s+do\b/i,
  /\blive\s+test\b/i,

  // Feature toggles — broad, since "turn off X" in a server context is a toggle
  /\b(turn|switch)\s+(it\s+)?(on|off|back\s+on)\b/i,
  /\b(enable|disable|toggle|deactivate|activate)\b/i,
  /\b(what|which)\s+features?\b/i,
  /\bfeatures?\s+(are\s+)?(on|off|enabled|active|list)\b/i,

  // Scheduling + events
  /\bschedule\b.*\b(message|post|announcement)\b|\b(post|send)\b.*\b(every|daily|tomorrow|in\s+\d)\b/i,
  /\b(recurring|scheduled)\s+(message|post)\b/i,
  /\b(create|make|schedule|set\s*up)\b.*\bevent\b/i,
  /\b(list|show|cancel)\b.*\b(events?|scheduled)\b/i,
  /\bset\b.*\b(timezone|time\s*zone|tz)\b/i,

  // Automation — autoresponders, temp roles, invites, automod, anti-scam
  /\b(auto[\s-]?responder|auto[\s-]?reply|trigger)\b/i,
  /\bwhen\s+someone\s+says\b/i,
  /\b(temp|temporary|timed)\s+role\b/i,
  /\bgive\b.*\brole\b.*\bfor\s+\d/i,
  /\b(who\s+invited|invite[\s-]?(leaderboard|tracking|count))\b/i,
  /\bauto[\s-]?mod\b/i,
  /\b(anti[\s-]?scam|scam\s+(link|protection|filter)|phishing)\b/i,
  /\b(anti[\s-]?raid|raid\s+(protection|gate)|join[\s-]?gate|account\s+age\s+gate)\b/i,

  // Support — suggestions, modmail, applications
  /\b(suggest|suggestion)\b/i,
  /\b(approve|deny|reject)\b.*\bsuggestion\b/i,
  /\b(mod\s?mail|modmail)\b/i,
  /\b(application|apply|staff\s+app|whitelist\s+app)\b/i,
  /\bapply\s+(for|to)\b/i,

  // Edit / delete Doll's embeds
  /\b(edit|change|update|add\s+(a\s+)?gif\s+to|fix|tweak)\b.*\b(embed|panel|announcement|message|post)\b/i,
  /\b(add|change|update|remove)\b.*\bgif\b/i,
  /\b(delete|remove|repost|redo)\b.*\b(embed|panel|announcement|that\s+message|that\s+post)\b/i,
  /\b(edit|change)\s+(the\s+)?(title|description|color|gif|image)\b/i,

  // Extras — logging, translate, feeds, role menus
  /\b(voice|nickname|role|channel)\s+logging\b|\blog(ging)?\b.*\b(voice|nickname|role|channel)/i,
  /\bauto[\s-]?translat/i,
  /\btranslate\b.*\bchannel\b|\bchannel\b.*\btranslate\b/i,
  /\b(rss|feed|atom)\b/i,
  /\b(watch|follow)\b.*\b(feed|blog|subreddit)\b/i,
  /\b(role\s+menu|dropdown|drop[\s-]?down|select\s+menu)\b/i,
];

const ACTION_INDICATOR_PATTERNS = [
  // "I'll handle that" — intent to act
  /\blet me (check|look|handle|do|take care|set|create|make|fix|post|add|give|grant|assign)/i,
  /\bi('ll| will| can|'m gonna| am going to) (check|look|handle|do|take care|set|create|make|fix|get|post|add|give|grant|assign|put)/i,
  /\bi('ll| will) (kick|ban|mute|timeout|warn|delete|remove|add|give|create|make|post|set)/i,
  /\bon it\b/i,
  /\bgive me a (sec|moment|minute)\b/i,

  // PAST-TENSE COMPLETION CLAIMS — if the chat model says it already did
  // something, it's lying (chat path has no tools). Re-route so it ACTUALLY does it.
  /\b(created|made|deleted|removed|added|assigned|granted|posted|set up|renamed|moved|updated|banned|kicked|muted|timed out|locked|unlocked|pinned)\b/i,
  /\b(channel|role|embed|panel|invite|message)\b.*\b(created|made|ready|posted|set up|done|is in|going in)\b/i,
  /\b(roles?|channels?|embed|panel)\s+(are|is)\s+(ready|created|made|set|done)\b/i,
  /\b(all set|done|sorted|good to go|taken care of|handled)\b/i,
];

/**
 * Does the user's message look like it needs tool execution?
 */
export function isManagementRequest(text) {
  if (!text) return false;
  return MANAGEMENT_PATTERNS.some(p => p.test(text));
}

/**
 * Does Doll's chat reply indicate she wants to take action?
 * (Used to re-route from Mistral chat path → DeepSeek tool path)
 */
export function responseIndicatesAction(text) {
  if (!text) return false;
  return ACTION_INDICATOR_PATTERNS.some(p => p.test(text));
}

// ── Permission Checking ──────────────────────────────────────────────────

function checkToolPermission(tool, member, guild) {
  const isOwner = member.id === process.env.OWNER_ID;
  const isGuildOwner = member.id === guild.ownerId;

  switch (tool.permLevel) {
    case PermLevel.READ:
      return { allowed: true };
    case PermLevel.MOD:
      if (isOwner || isGuildOwner || isMod(member)) return { allowed: true };
      return { allowed: false, reason: 'you need a mod role or admin permission for that' };
    case PermLevel.ADMIN:
      if (isOwner || isGuildOwner || member.permissions?.has?.('Administrator')) return { allowed: true };
      return { allowed: false, reason: 'only admins can do that' };
    case PermLevel.OWNER:
      if (isOwner || isGuildOwner) return { allowed: true };
      return { allowed: false, reason: 'only the server owner can authorize that' };
    default:
      return { allowed: true };
  }
}

// ── DSML Fallback Parser ─────────────────────────────────────────────────
// DeepSeek sometimes emits tool calls as markup in the message content instead
// of using the tool_calls JSON field — e.g. <｜｜DSML｜｜invoke name="x">…. This
// normalizes the fullwidth unicode AND strips DeepSeek's "｜｜DSML｜｜" marker
// tokens so the tags are clean, then extracts the calls.

function normalizeDSML(text) {
  return (text || '')
    .replace(/｜/g, '|').replace(/＜/g, '<').replace(/＞/g, '>')
    .replace(/＝/g, '=').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    // strip "||DSML||" / "|DSML|" marker tokens that sit inside the tags
    .replace(/\|+\s*DSML\s*\|+/gi, '');
}

// Strip any leaked DSML/tool-call markup from a final user-facing reply.
export function stripDSML(text) {
  if (!text) return text;
  return normalizeDSML(text)
    .replace(/<\/?\s*(invoke|parameter|tool_calls|function_calls)[^>]*>/gi, '')
    .replace(/<\/?\s*>/g, '')
    .trim();
}

function coerceValue(raw) {
  const val = raw.trim();
  if (/^(true|false)$/i.test(val)) return val.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
  if (/^[[{]/.test(val)) { try { return JSON.parse(val); } catch { /* leave as string */ } }
  return val;
}

function parseDSMLToolCalls(text) {
  if (!text) return [];
  const norm = normalizeDSML(text);

  const calls = [];
  const invokeRe = /invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\s*invoke>/gi;
  let m;
  while ((m = invokeRe.exec(norm)) !== null) {
    const params = {};
    const paramRe = /parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\s*parameter>/gi;
    let pm;
    while ((pm = paramRe.exec(m[2])) !== null) params[pm[1]] = coerceValue(pm[2]);
    calls.push({
      id: `dsml_${Date.now()}_${calls.length}`,
      type: 'function',
      function: { name: m[1], arguments: JSON.stringify(params) },
    });
  }
  return calls;
}

// Image/link param keys we should back-fill from the user's message if the
// model filled them with a description instead of the real URL (or omitted them).
const URL_PARAM_KEYS = ['image', 'gif', 'icon', 'avatar_url', 'banner', 'url'];
const MEDIA_HOST_RE = /(tenor\.com|giphy\.com|imgur\.com|cdn\.discordapp|media\.discordapp)|\.(gif|png|jpe?g|webp)(\?|$)/i;

// If the user EXPLICITLY mentioned a channel (clicked it → <#id>), that's the
// strongest possible signal of which channel they mean. When there's exactly one
// such mention and the tool takes a channel, lock onto that exact ID so the model
// can't guess the wrong channel by name.
const CHANNEL_PARAM_KEYS = ['channel', 'channel_id', 'target_channel', 'review_channel'];
function recoverChannelMention(params, tool, message) {
  const content = message?.content;
  if (!content) return params;
  const ids = [...content.matchAll(/<#(\d+)>/g)].map(m => m[1]);
  if (ids.length !== 1) return params; // none, or ambiguous → trust the model
  const props = tool.parameters?.properties || {};
  for (const key of CHANNEL_PARAM_KEYS) {
    if (key in props) { params[key] = ids[0]; break; } // raw ID — resolveChannel handles it exactly
  }
  return params;
}

function recoverUrlParams(params, tool, message) {
  const content = message?.content;
  if (!content) return params;
  const urls = content.match(/https?:\/\/\S+/g);
  if (!urls?.length) return params;
  const props = tool.parameters?.properties || {};
  const mediaUrl = urls.find(u => MEDIA_HOST_RE.test(u)) || urls[0];

  for (const key of URL_PARAM_KEYS) {
    if (!(key in props)) continue;
    const v = params[key];
    const isUrl = typeof v === 'string' && /^https?:\/\//i.test(v);
    if (isUrl) continue; // model passed a real URL already — leave it
    // image-ish params prefer a media URL; a generic `url` takes the first link
    const pick = key === 'url' ? urls[0] : mediaUrl;
    // only fill if the model left it empty OR put a non-URL description there
    if (v === undefined || v === null || v === '' || typeof v === 'string') {
      if (pick) params[key] = pick;
    }
  }
  return params;
}

// Pick which tool categories to expose to the model for a given message.
// Core management + config/info are ALWAYS included; big/niche categories are
// added only when the message looks relevant. Generous on purpose — better to
// include an extra category than to miss the tool the user needs.
const CORE_CATEGORIES = ['config', 'info', 'channel', 'role', 'member', 'mod', 'server', 'invite', 'utility'];
const CONDITIONAL_CATEGORIES = [
  { cat: 'music', re: /\b(music|play|song|track|queue|skip|pause|resume|volume|filter|lyric|playlist|autoplay|24\/?7|bass|nightcore|vaporwave|np|now playing)\b/i },
  { cat: 'voice', re: /\b(voice|vc|disconnect|move .*(channel|vc)|drag)\b/i },
  { cat: 'schedule', re: /\b(schedul|remind|every\s+(day|week|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|at \d|event|timezone|recurring)\b/i },
  { cat: 'feeds', re: /\b(feed|rss|atom|watch .*(blog|site|subreddit))\b/i },
  { cat: 'automation', re: /\b(auto.?respond|auto.?repl|trigger|temp(orary)? role|timed role|invite (tracking|leaderboard)|who invited|automod|anti.?scam|when someone (says|posts|joins))\b/i },
  { cat: 'web', re: /\b(search|google|look up|youtube|web)\b/i },
  { cat: 'support', re: /\b(modmail|mod mail|suggest|suggestion|application|apply|form|ticket)\b/i },
  { cat: 'assistant', re: /\b(catch ?up|catch me up|what(\s+did|'?d)?\s*i\s*miss|summar|recap|announce|announcement|faq|frequently asked|digest|how('?s| is)\s+(my|the)\s+server|server health)\b/i },
];

function selectCategories(text) {
  const cats = new Set(CORE_CATEGORIES);
  const t = text || '';
  for (const { cat, re } of CONDITIONAL_CATEGORIES) {
    if (re.test(t)) cats.add(cat);
  }
  return [...cats];
}

// ── Tool Execution Loop ─────────────────────────────────────────────────

/**
 * Execute the full tool-calling loop. Mistral (free) is tried first; DeepSeek
 * is only used if Mistral fails (handled inside chatCompletion).
 *
 * @param {import('discord.js').Message} message - The Discord message
 * @param {string} systemPrompt - Full system prompt (personality + context + memory)
 * @param {Array} history - Conversation history array [{role, content}, ...]
 * @returns {string} Natural language reply incorporating tool results
 */
export async function executeToolPath(message, systemPrompt, history) {
  const { guild, channel, member, client } = message;
  // Only send the RELEVANT tool categories — keeps the request small so it
  // doesn't blow through Mistral's free-tier token budget (→ fewer rate limits
  // → less paid DeepSeek fallback). Core management is always included.
  const toolDefs = getToolDefinitions(selectCategories(message.content));
  const ctx = { guild, channel, member, client, message };

  const msgs = [
    { role: 'system', content: systemPrompt + toolCallInstructions() },
    ...history,
  ];

  // ── First call: let the model choose tools (Mistral first, DeepSeek fallback) ──
  const { response } = await chatCompletion(msgs, { tools: toolDefs, maxTokens: 600, temperature: 0.7 });
  const assistantMsg = response.choices?.[0]?.message;
  if (!assistantMsg) throw new Error('Empty model response');

  // Extract tool calls (standard JSON or DSML fallback)
  let toolCalls = assistantMsg.tool_calls || [];
  if (toolCalls.length === 0 && assistantMsg.content) {
    toolCalls = parseDSMLToolCalls(assistantMsg.content);
  }

  // No tools needed — just return the chat reply (stripped of any DSML junk)
  if (toolCalls.length === 0) {
    return stripDSML(assistantMsg.content) || 'hmm, not sure what to do with that.';
  }

  // ── Execute each tool call ──
  const toolResults = [];
  for (const call of toolCalls) {
    const fnName = call.function.name;
    const tool = getTool(fnName);

    if (!tool) {
      toolResults.push({ tool_call_id: call.id, role: 'tool', content: `unknown tool: ${fnName}` });
      continue;
    }

    // Feature gate — if this tool's category is a module that's turned off, skip
    if (!isCategoryEnabled(guild.id, tool.category)) {
      toolResults.push({ tool_call_id: call.id, role: 'tool', content: `the ${tool.category} feature is turned off for this server` });
      continue;
    }

    // Parse params (needed for both execution and approval forwarding)
    let params = {};
    try { params = JSON.parse(call.function.arguments || '{}'); } catch { params = {}; }

    // Recover URLs the model may have "summarized" into a description. If the
    // user pasted a link (e.g. a Tenor gif) but the model put a description in
    // an image/url param, swap in the real URL from the original message. This
    // runs BEFORE confirmation is stored, so the confirm-button path gets it too.
    params = recoverUrlParams(params, tool, message);
    params = recoverChannelMention(params, tool, message);

    // Permission gate
    const perm = checkToolPermission(tool, member, guild);
    if (!perm.allowed) {
      // Owner-approval flow: if an admin asks for an OWNER-level action, don't
      // just refuse — forward the request to the owner for sign-off.
      if (tool.permLevel === PermLevel.OWNER && member.permissions?.has?.('Administrator')) {
        const delivered = await requestApproval(client, guild, member, tool, params).catch(() => false);
        toolResults.push({
          tool_call_id: call.id, role: 'tool',
          content: delivered
            ? `pending owner approval: "${fnName}" needs the server owner's sign-off. i've sent them an approve/deny prompt.`
            : `"${fnName}" needs the owner's approval but i couldn't reach them (their DMs may be closed and no alert channel is set).`,
        });
        continue;
      }
      toolResults.push({ tool_call_id: call.id, role: 'tool', content: `denied: ${perm.reason}` });
      continue;
    }

    // Rate limiting — protect against spam + runaway LLM cost
    if (tool.permLevel !== PermLevel.READ) {
      const rl = checkTool(member.id);
      if (!rl.allowed) {
        toolResults.push({ tool_call_id: call.id, role: 'tool', content: `slow down — you're doing a lot at once. try again in ${rl.retryAfter}s` });
        continue;
      }
    }
    if (HEAVY_TOOLS.has(fnName)) {
      const rl = checkHeavy(member.id);
      if (!rl.allowed) {
        toolResults.push({ tool_call_id: call.id, role: 'tool', content: `that's a heavier request — give me ${rl.retryAfter}s before asking for another` });
        continue;
      }
    }

    // Confirm-before-commit for high-impact tools: spell out exactly what will
    // happen and wait for a Confirm/Cancel button. Nothing runs yet.
    if (tool.confirm) {
      let previewText;
      try {
        previewText = tool.preview ? await tool.preview(params, ctx) : defaultPreview(fnName, params);
      } catch { previewText = defaultPreview(fnName, params); }
      const delivered = await requestConfirmation(channel, member, tool, params, previewText).catch(() => false);
      toolResults.push({
        tool_call_id: call.id, role: 'tool',
        content: delivered
          ? `I posted a confirmation prompt for "${fnName}" with the exact details and Confirm/Cancel buttons. Nothing has happened yet — tell the user to review and confirm. Relay the preview: ${previewText}`
          : `couldn't post a confirmation prompt for "${fnName}"`,
      });
      continue;
    }

    // Execute
    try {
      const result = await tool.execute(params, ctx);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      toolResults.push({ tool_call_id: call.id, role: 'tool', content: resultStr });
      console.log(`[Tool] ${fnName} → ok`);
    } catch (err) {
      console.error(`[Tool] ${fnName} failed:`, err.message);
      logIssue(guild, 'tool_failed', `${fnName}: ${err.message}`);
      toolResults.push({ tool_call_id: call.id, role: 'tool', content: `failed: ${err.message}` });
    }
  }

  // ── Cost saver: for a single clean action result, skip the 2nd LLM call ──
  // Our tool results are already user-friendly ("created role @VIP"), so a
  // lone successful write doesn't need synthesis. This halves the request
  // count for the common case — fewer Mistral requests → fewer rate-limits →
  // less DeepSeek fallback → cheaper/freer. Anything error-y, awaiting, or
  // multi-tool still gets a natural synthesis pass.
  if (toolResults.length === 1) {
    const only = toolResults[0].content || '';
    const messy = /couldn'?t|can'?t|failed|denied|error|awaiting|pending|turned off|unknown tool|slow down/i.test(only);
    if (!messy && only.length > 0 && only.length < 300) {
      return only;
    }
  }

  // ── Second call: synthesize results into natural reply ──
  // NOTE: no system/user message may follow tool messages (Mistral rejects it
  // with "Unexpected role 'system' after role 'tool'"). The honesty rules live
  // in the initial system prompt (toolCallInstructions) instead.
  const followUp = [
    ...msgs,
    { role: 'assistant', content: assistantMsg.content || null, tool_calls: toolCalls },
    ...toolResults,
  ];

  const { response: synthesis } = await chatCompletion(followUp, { maxTokens: 350, temperature: 0.6 });
  let reply = synthesis.choices?.[0]?.message?.content || 'done.';

  // Strip any leaked DSML / tool-call artifacts
  reply = stripDSML(reply) || 'done.';

  return reply;
}

// ── Extra instructions appended to system prompt on tool path ──

function toolCallInstructions() {
  return `

tool-calling rules:
- you have tools to manage channels, roles, members, invites, emojis, moderation, music, and more
- use the right tool for what the user asks. if multiple steps are needed, call multiple tools

HONESTY (the most important rule):
- you ONLY actually do something by CALLING A TOOL. words are not actions.
- NEVER say something was created, made, posted, set up, assigned, deleted, or "is ready"/"going in" unless you called the tool for it THIS turn AND its result confirmed success
- if you haven't called the tool yet, don't describe it as done — call the tool
- if a tool result says couldn't/failed/denied/error/awaiting confirmation/turned off, tell the user that plainly. never fake success

GIFS & IMAGES — make it just work, never invent URLs:
- the image param of create_reaction_role_panel and edit_embed accepts a SEARCH TERM (e.g. "pastel sparkles", "cute bunny") — just pass that and a real gif is found + added automatically. THIS IS THE DEFAULT — do it this way.
- so when the user wants "a cute gif" on a panel, pass a fitting search term to image and it's done in one step. don't make them pick across messages
- only show options if the user explicitly wants to choose — then call search_gif (it posts the real gifs numbered); when they pick a number, pass that NUMBER to the image param
- never make up or guess a tenor/giphy URL; if they paste a link, use it verbatim
- if you're adding gifs to MULTIPLE panels, just give each a fitting search term — don't offer a numbered list for several panels at once (the numbers get confused)

EDITING WHAT YOU POSTED:
- to change something you already posted (add a gif to a panel, fix a title), use edit_embed — don't make a brand-new one unless asked. if no message id is given it edits your most recent embed; pass a "which" hint (e.g. "colors") if there are several
- if they want it gone, use delete_message; to fully redo, delete then post fresh
- if you're not sure WHICH message or WHAT exactly to change, ask before editing

MULTI-STEP TASKS — do the WHOLE thing, not just the first step:
- if a request needs several actions (e.g. "make a reaction-role panel": create the roles, create/find the channel, then post the panel), call ALL the needed tools in order in this turn
- don't stop after one tool and claim the rest is done — chain the calls
- for a reaction-role panel use create_reaction_role_panel (it can create missing roles and the channel) — pass the emoji→role pairs, the image/gif, and the channel
- for "make a category with channels a, b, c" OR "move a, b, c under the X category" → use build_category (it nests them correctly). do NOT create a category and channels separately and assume they're linked — they won't be

THINK ABOUT PERMISSIONS (owners forget this until it breaks):
- channels you create are open to everyone by default. when you make channels that clearly shouldn't be, flag it and offer to fix with set_channel_visibility
- sensible defaults to SUGGEST (ask, don't silently assume): #rules / #announcements → read-only; #staff / #mod / #admin / #logs / #modlog → staff-only (ask which role); ticket/modmail channels → staff-only
- after building a set of channels, if any look like they need locking down, ask ONE question like "want me to make #staff staff-only and #rules read-only?"

BE PROACTIVELY HELPFUL (but never naggy):
- after setting something up, offer ONE relevant next step if it's genuinely useful — e.g. after making a #rules channel that's empty, offer to draft rules (draft_rules); after making color roles, offer a pick-a-color panel; after making channels, offer to set their permissions
- exactly ONE short offer, phrased as a question, then stop. never pile on multiple suggestions or repeat an offer they ignored
- if the owner asks for something you genuinely can't do, be honest — and if it's a bug or missing feature, offer to send it to your developer (contact_developer)
- you're showing the owner you're capable — be the helpful smart assistant, not a pushy salesperson

CLARIFY BEFORE YOU ACT:
- if a request is vague or missing details, ask a specific question first and don't call the tool yet
- "give the helper role perms" → ask which permissions and whether server-wide or per-channel
- match the server's vibe — if it's a cute/sanrio/pastel server, style embeds and wording to fit; when unsure of look (color, emojis, wording), offer a quick sample/option and confirm before posting
- big or destructive actions auto-pop a Confirm/Cancel button — when that happens, tell the user to review and confirm; it is NOT done yet

after acting:
- explain what you actually did in plain english — no JSON, no raw IDs (use #channel, @role, @name)
- when the user references something by name, pass that name to the tool — it resolves it`;
}
