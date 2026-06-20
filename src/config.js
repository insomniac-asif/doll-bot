import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVERS_DIR = join(__dirname, 'data', 'servers');

if (!existsSync(SERVERS_DIR)) mkdirSync(SERVERS_DIR, { recursive: true });

const defaults = {
  logChannel: null,
  welcomeChannel: null,
  modRoles: [],
  autoRole: null,
  aiChannels: [],
  personality: 'default',
  automod: {
    enabled: true,
    level: 'moderate',
    actions: {
      warn: true,
      delete: true,
      mute: false,
      escalate: true,
    },
  },
  welcomeMessage: 'Welcome to the server, {user}!',
  leaveMessage: '{user} has left the server.',
  warnings: {},
  reactionRoles: {},

  // Leveling
  leveling: { enabled: true, xpPerMessage: 15, cooldownSec: 60, announceChannel: null, levelRoles: {} },

  // Economy
  economy: { enabled: true, currency: 'coins', dailyAmount: 250, shop: [] },

  // Starboard
  starboard: { enabled: false, channel: null, emoji: '⭐', threshold: 3 },

  // Verification
  verification: { enabled: false, channel: null, role: null },

  // Tickets
  tickets: { category: null, staffRole: null, panelChannel: null },

  // Temp voice (join-to-create)
  tempVoice: { hub: null, category: null },

  // Confessions
  confessions: { channel: null },

  // Birthdays
  birthdays: { channel: null, role: null, list: {} },

  // Owner/admin alerting — Doll forwards problems here (DM via OWNER_ID + this channel)
  ownerAlert: { channel: null },

  // Social live notifications: { twitch: [{login, roleId, channelId}], youtube: [...], tiktok: [...] }
  social: { twitch: [], youtube: [], tiktok: [] },

  // Accent color for embeds (soft pink default — fits Doll's branding)
  accentColor: 0xffb3d9,

  // UTC offset in hours for this server (e.g. -5 = EST). Used by scheduling.
  tzOffset: 0,

  // Anti-scam link scanning. action: delete | timeout | kick
  antiScam: { enabled: false, action: 'delete' },

  // Anti-raid: lock down on a burst of joins; optional new-account gate.
  antiRaid: { enabled: false, joinThreshold: 8, windowSec: 10, action: 'lockdown', minAccountAgeDays: 0, ageAction: 'alert' },

  // ModMail (DM ↔ staff bridge)
  modmail: { enabled: false, category: null, staffRole: null, logChannel: null },

  // Suggestion board
  suggestions: { channel: null },

  // Richer logging — per-category toggles (only used if logChannel is set).
  // All on by default; toggle any off by talking to Doll.
  logging: { voice: true, nicknames: true, roles: true, channels: true },

  // Per-channel auto-translation: { channelId: 'es' }
  autotranslate: {},

  // Unified feature/module toggles (see features/featureToggle.js). Anything not
  // listed here uses the registry default. Toggle by talking to Doll.
  modules: {},

  // Anti-nuke (raid/mass-action protection). punish: 'strip' removes the
  // attacker's roles + times them out; 'none' only alerts.
  antinuke: { enabled: false, punish: 'strip', whitelist: [], thresholds: { channelDelete: 3, roleDelete: 3, ban: 5 }, windowSec: 30 },

  // OwO-style game inventory lives in its own store; shop items here
  shop: [],

  // AI-native features — all toggleable by talking to Doll ("doll turn off auto-faq").
  // Defaults: convenience features ON, anything that DMs the owner or auto-acts is OFF
  // until the owner opts in.
  aiFeatures: {
    catchup: true,        // "what did I miss in #channel?"
    announcements: true,  // AI-drafted announcement embeds
    autoFaq: true,        // auto-answer repeat questions from a learned FAQ
    rulesEngine: true,    // natural-language automod/automation rules
    healthDigest: false,  // weekly server-health DM to the owner (opt-in)
    smartModeration: false, // LLM intent check on automod edge cases (opt-in)
  },
};

const thresholds = {
  strict: 0.3,
  moderate: 0.6,
  lenient: 0.85,
};

function configPath(guildId) {
  return join(SERVERS_DIR, `${guildId}.json`);
}

export function getConfig(guildId) {
  const path = configPath(guildId);
  if (!existsSync(path)) return { ...structuredClone(defaults), guildId };
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return { ...structuredClone(defaults), ...data, guildId };
  } catch {
    return { ...structuredClone(defaults), guildId };
  }
}

export function saveConfig(guildId, config) {
  const { guildId: _, ...data } = config;
  writeFileSync(configPath(guildId), JSON.stringify(data, null, 2));
}

export function updateConfig(guildId, updates) {
  const config = getConfig(guildId);
  const merged = { ...config, ...updates };
  saveConfig(guildId, merged);
  return merged;
}

export function getThreshold(level) {
  return thresholds[level] ?? thresholds.moderate;
}

export function getAccent(guildId) {
  return getConfig(guildId).accentColor ?? 0xffb3d9;
}

export { defaults };
