// Unified feature/module toggles. EVERY feature can be turned on or off per
// guild by talking to Doll. Features with a legacy config flag (e.g.
// automod.enabled) bridge to it via `path`; the rest live in config.modules.

import { getConfig, saveConfig } from '../config.js';

// key → { label, aliases[], path?, default?, category? }
// path: dot-path to a legacy config flag (kept as the source of truth)
// category: AI-tool category this module gates (so all tools in that category
//           switch off together)
export const FEATURES = {
  // ── AI features ──
  catchup:        { label: 'catch-up summaries', aliases: ['catchup', 'catch up', 'catch-up', 'summaries', 'recap'], default: true },
  announcements:  { label: 'AI announcements', aliases: ['announcements', 'announce'], default: true },
  autoFaq:        { label: 'auto-FAQ', aliases: ['autofaq', 'auto faq', 'auto-faq', 'faq'], default: true },
  rulesEngine:    { label: 'automation rules', aliases: ['rulesengine', 'rules engine', 'rules', 'automation rules'], default: true },
  healthDigest:   { label: 'server health digest', aliases: ['healthdigest', 'health digest', 'digest', 'health report'], default: false },
  smartModeration:{ label: 'smart moderation', aliases: ['smartmoderation', 'smart moderation', 'smart mod'], default: false },

  // ── Moderation / safety ──
  automod:        { label: 'auto-moderation', aliases: ['automod', 'auto mod', 'auto-moderation', 'content filter'], path: 'automod.enabled' },
  antinuke:       { label: 'anti-nuke', aliases: ['antinuke', 'anti nuke', 'anti-nuke', 'raid protection'], path: 'antinuke.enabled' },
  antiScam:       { label: 'anti-scam links', aliases: ['antiscam', 'anti scam', 'anti-scam', 'scam protection', 'phishing'], path: 'antiScam.enabled' },
  antiRaid:       { label: 'anti-raid join-gate', aliases: ['antiraid', 'anti raid', 'anti-raid', 'raid protection', 'join gate', 'join-gate'], path: 'antiRaid.enabled' },

  // ── Engagement ──
  leveling:       { label: 'leveling / XP', aliases: ['leveling', 'levelling', 'levels', 'xp', 'ranks'], path: 'leveling.enabled' },
  economy:        { label: 'economy / coins', aliases: ['economy', 'coins', 'currency', 'money'], path: 'economy.enabled' },
  starboard:      { label: 'starboard', aliases: ['starboard', 'star board'], path: 'starboard.enabled' },
  birthdays:      { label: 'birthdays', aliases: ['birthday', 'birthdays', 'bday'], default: true },
  giveaways:      { label: 'giveaways', aliases: ['giveaway', 'giveaways'], default: true },
  confessions:    { label: 'confessions', aliases: ['confession', 'confessions'], default: true },
  kawaii:         { label: 'kawaii / anime reactions', aliases: ['kawaii', 'anime', 'hug', 'roleplay actions'], default: true },
  games:          { label: 'OwO hunting game', aliases: ['owo', 'games', 'hunting', 'critters'], default: true },
  fun:            { label: 'fun commands', aliases: ['fun', 'fun commands', '8ball', 'memes'], default: true },

  // ── Community / onboarding ──
  welcome:        { label: 'welcome & leave messages', aliases: ['welcome', 'welcomes', 'greetings', 'leave messages', 'goodbye'], default: true },
  welcomeImage:   { label: 'welcome images (rendered cards)', aliases: ['welcome image', 'welcome images', 'welcome card', 'welcome cards', 'welcome banner'], default: false },
  reactionRoles:  { label: 'reaction roles', aliases: ['reaction roles', 'reactionroles', 'reaction role'], default: true },
  roleMenus:      { label: 'dropdown role menus', aliases: ['role menu', 'role menus', 'dropdown roles', 'select menu roles'], default: true },
  suggestions:    { label: 'suggestion board', aliases: ['suggestions', 'suggestion board', 'suggest'], default: true },
  applications:   { label: 'applications / forms', aliases: ['applications', 'application', 'apply', 'forms'], default: true },
  modmail:        { label: 'modmail', aliases: ['modmail', 'mod mail', 'dm bridge'], path: 'modmail.enabled' },
  tickets:        { label: 'tickets', aliases: ['tickets', 'ticket', 'support tickets'], default: true },
  verification:   { label: 'verification', aliases: ['verification', 'verify', 'verify gate'], path: 'verification.enabled' },
  tempVoice:      { label: 'temp voice channels', aliases: ['temp voice', 'tempvoice', 'join to create', 'temp vc'], default: true },
  voiceTracking:  { label: 'voice activity tracking', aliases: ['voice tracking', 'voicetracking', 'vc time', 'voice time'], default: true },
  afk:            { label: 'AFK system', aliases: ['afk', 'away'], default: true },

  // ── Content / automation ──
  music:          { label: 'music', aliases: ['music', 'songs', 'player'], default: true, category: 'music' },
  social:         { label: 'social live alerts', aliases: ['social', 'live alerts', 'twitch', 'youtube', 'tiktok', 'stream alerts'], default: true },
  feeds:          { label: 'RSS feeds', aliases: ['rss', 'feeds', 'feed'], default: true, category: 'feeds' },
  scheduling:     { label: 'scheduled messages & events', aliases: ['scheduling', 'scheduled messages', 'schedule', 'events'], default: true, category: 'schedule' },
  autoresponders: { label: 'auto-responders', aliases: ['autoresponder', 'autoresponders', 'auto reply', 'triggers'], default: true },
  autoTranslate:  { label: 'auto-translate', aliases: ['auto translate', 'autotranslate', 'auto-translate', 'translation'], default: true },
  tempRoles:      { label: 'temporary roles', aliases: ['temp roles', 'temporary roles', 'timed roles'], default: true },
  inviteTracking: { label: 'invite tracking', aliases: ['invite tracking', 'invitetracking', 'who invited'], default: true },
  logging:        { label: 'audit logging', aliases: ['logging', 'logs', 'audit log'], default: true },

  // ── Crodie-ported awareness (opt-in per server) ──
  vault:          { label: 'conversation vault (long-term memory)', aliases: ['vault', 'conversation memory', 'long term memory', 'long-term memory', 'memory archive'], default: false },
  lore:           { label: 'server lore', aliases: ['lore', 'server lore', 'moments', 'notable moments'], default: false },
  ocr:            { label: 'image reading (OCR)', aliases: ['ocr', 'image reading', 'read images', 'read text in images', 'image text'], default: false },
  adminTracking:  { label: 'admin-activity tracking', aliases: ['admin tracking', 'admintracking', 'admin activity', 'staff activity', 'admin logging'], default: false },
};

// Resolve a natural-language feature name → canonical key.
export function resolveFeature(name) {
  if (!name) return null;
  const q = name.toLowerCase().trim();
  if (FEATURES[q]) return q;
  let best = null, bestLen = 0;
  for (const [key, def] of Object.entries(FEATURES)) {
    if (key.toLowerCase() === q) return key;
    for (const a of def.aliases) {
      if (a === q) return key;
      if (q.includes(a) && a.length > bestLen) { best = key; bestLen = a.length; }
    }
  }
  return best;
}

// ── nested path helpers (for legacy flags) ──
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export function isEnabled(guildId, key) {
  const def = FEATURES[key];
  const config = getConfig(guildId);
  if (def?.path) {
    const v = getByPath(config, def.path);
    return v ?? def.default ?? true;
  }
  if (config.modules && key in config.modules) return config.modules[key];
  // legacy aiFeatures block (pre-unification)
  if (config.aiFeatures && key in config.aiFeatures) return config.aiFeatures[key];
  return def?.default ?? true;
}

export function setFeature(guildId, key, enabled) {
  const def = FEATURES[key];
  const config = getConfig(guildId);
  if (def?.path) {
    setByPath(config, def.path, enabled);
  } else {
    if (!config.modules) config.modules = {};
    config.modules[key] = enabled;
  }
  saveConfig(guildId, config);
  return enabled;
}

export function getAllFeatures(guildId) {
  return Object.entries(FEATURES).map(([key, def]) => ({
    key, label: def.label, enabled: isEnabled(guildId, key),
  }));
}

// ── Category gating (for AI tools) ──
// Maps a tool category to the module key that gates it. Categories not listed
// (config, info, utility, web, channel, role, member, server, invite, voice,
//  mod, automation, support, assistant) are never gated here — they're either
// core management or gated individually at the feature level.
const CATEGORY_MODULE = {
  music: 'music',
  feeds: 'feeds',
  schedule: 'scheduling',
};

export function isCategoryEnabled(guildId, category) {
  const moduleKey = CATEGORY_MODULE[category];
  if (!moduleKey) return true; // not a gated category
  return isEnabled(guildId, moduleKey);
}
