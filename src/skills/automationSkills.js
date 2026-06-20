// Automation tools — auto-responders, temp roles, invite tracking,
// native Discord AutoMod, anti-scam toggle.

import {
  AutoModerationRuleTriggerType, AutoModerationRuleEventType, AutoModerationActionType,
} from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveRole, resolveMemberFetch } from '../features/resolvers.js';
import { getConfig, updateConfig } from '../config.js';
import { addAutoresponder, removeAutoresponder, listAutoresponders } from '../features/autoresponders.js';
import { durationToMs, scheduleRemoval } from '../features/tempRoles.js';
import { whoInvited, inviteCounts } from '../features/inviteTracking.js';

// ── add_autoresponder ───────────────────────────────────────────────────

registerTool('add_autoresponder', {
  category: 'automation',
  description: 'Create an auto-responder: when someone says the trigger, Doll replies with the response. Match types: contains (default), exact, startswith, wildcard (use * for any text).',
  parameters: {
    type: 'object',
    properties: {
      trigger: { type: 'string', description: 'The phrase that triggers the response' },
      response: { type: 'string', description: 'What Doll replies with' },
      match: { type: 'string', enum: ['contains', 'exact', 'startswith', 'wildcard'], description: 'How to match (default: contains)' },
    },
    required: ['trigger', 'response'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const item = addAutoresponder(guild.id, { trigger: params.trigger, response: params.response, match: params.match || 'contains' });
    return `added auto-responder #${item.id}: when someone says "${params.trigger}" (${item.match}) i'll reply "${params.response.substring(0, 60)}"`;
  },
});

registerTool('remove_autoresponder', {
  category: 'automation',
  description: 'Remove an auto-responder by its number or trigger phrase',
  parameters: {
    type: 'object',
    properties: { which: { type: 'string', description: 'The number or trigger phrase' } },
    required: ['which'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const n = removeAutoresponder(guild.id, params.which);
    return n > 0 ? `removed ${n} auto-responder(s)` : `couldn't find that auto-responder`;
  },
});

registerTool('list_autoresponders', {
  category: 'automation',
  description: 'List the server\'s auto-responders',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const items = listAutoresponders(guild.id);
    if (items.length === 0) return 'no auto-responders set up';
    return `auto-responders:\n${items.map(i => `#${i.id} [${i.match}] "${i.trigger}" → "${i.response.substring(0, 50)}"`).join('\n')}`;
  },
});

// ── give_temp_role ──────────────────────────────────────────────────────

registerTool('give_temp_role', {
  category: 'automation',
  description: 'Give a member a role temporarily — it auto-removes after the duration. Examples: "30m", "2h", "1d".',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to give the role' },
      role: { type: 'string', description: 'Role name' },
      duration: { type: 'string', description: 'How long (e.g. "1h", "30m", "2d")' },
    },
    required: ['user', 'role', 'duration'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;
    const ms = durationToMs(params.duration);
    if (!ms) return `i couldn't read the duration "${params.duration}" — try "1h" or "30m"`;

    await target.roles.add(role, `Temp role by ${member.displayName}`).catch(() => {});
    scheduleRemoval(guild.id, target.id, role.id, Date.now() + ms);
    return `gave @${role.name} to ${target.displayName} for ${params.duration} — i'll take it back after`;
  },
});

// ── invite tracking ─────────────────────────────────────────────────────

registerTool('who_invited', {
  category: 'automation',
  description: 'Find out who invited a member to the server',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: 'The member to look up' } },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    const rec = whoInvited(guild.id, target.id);
    if (!rec) return `i don't have a record of who invited ${target.displayName} (they may have joined before i was tracking)`;
    const inviter = guild.members.cache.get(rec.inviterId);
    return `${target.displayName} was invited by ${inviter ? inviter.displayName : 'someone who left'} (invite ${rec.code})`;
  },
});

registerTool('invite_leaderboard', {
  category: 'automation',
  description: 'Show who has invited the most members',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number', description: 'How many to show (default 10)' } },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild }) {
    const lb = inviteCounts(guild.id, Math.min(25, params.limit || 10));
    if (lb.length === 0) return 'no invite data yet';
    const lines = lb.map(e => {
      const m = guild.members.cache.get(e.id);
      return `${e.position}. ${m ? m.displayName : 'someone who left'} — ${e.count} invite${e.count === 1 ? '' : 's'}`;
    });
    return `invite leaderboard:\n${lines.join('\n')}`;
  },
});

// ── native Discord AutoMod ──────────────────────────────────────────────

registerTool('create_automod_keyword', {
  category: 'automation',
  description: 'Create a NATIVE Discord AutoMod rule that blocks messages containing certain words/phrases. Runs at Discord\'s level — instant, no bot needed. Pass words comma-separated.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the rule' },
      words: { type: 'string', description: 'Comma-separated words/phrases to block (supports * wildcards)' },
    },
    required: ['name', 'words'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const keywords = params.words.split(',').map(w => w.trim()).filter(Boolean).slice(0, 1000);
    if (keywords.length === 0) return 'no words given to block';
    try {
      await guild.autoModerationRules.create({
        name: params.name,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: keywords },
        actions: [{ type: AutoModerationActionType.BlockMessage }],
        enabled: true,
      });
      return `created native AutoMod rule "${params.name}" blocking ${keywords.length} word(s). Discord enforces it automatically now`;
    } catch (e) {
      return `couldn't create the AutoMod rule: ${e.message}`;
    }
  },
});

registerTool('create_automod_mention_spam', {
  category: 'automation',
  description: 'Create a native Discord AutoMod rule that blocks messages with too many mentions (anti-mention-spam)',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max mentions allowed per message (e.g. 5)' },
    },
    required: ['limit'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    try {
      await guild.autoModerationRules.create({
        name: `Mention spam (${params.limit}+)`,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.MentionSpam,
        triggerMetadata: { mentionTotalLimit: Math.max(1, Math.min(50, params.limit)) },
        actions: [{ type: AutoModerationActionType.BlockMessage }],
        enabled: true,
      });
      return `created a native AutoMod rule blocking messages with more than ${params.limit} mentions`;
    } catch (e) {
      return `couldn't create the rule: ${e.message}`;
    }
  },
});

registerTool('list_automod', {
  category: 'automation',
  description: 'List the native Discord AutoMod rules on this server',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.MOD,
  async execute(_params, { guild }) {
    try {
      const rules = await guild.autoModerationRules.fetch();
      if (rules.size === 0) return 'no native AutoMod rules';
      return `native AutoMod rules:\n${rules.map(r => `• ${r.name} (${r.enabled ? 'on' : 'off'})`).join('\n')}`;
    } catch (e) {
      return `couldn't fetch AutoMod rules: ${e.message}`;
    }
  },
});

// ── setup_antiraid ──────────────────────────────────────────────────────

registerTool('setup_antiraid', {
  category: 'automation',
  description: 'Set up anti-raid protection: if a burst of accounts join in a short window, Doll locks the server down + alerts you. Optionally gate suspiciously new accounts. Use for "set up anti-raid", "raid protection", "join gate".',
  parameters: {
    type: 'object',
    properties: {
      join_threshold: { type: 'number', description: 'How many joins trigger a raid alert (default 8)' },
      window_seconds: { type: 'number', description: 'Within how many seconds (default 10)' },
      action: { type: 'string', enum: ['lockdown', 'alert'], description: 'lockdown (lock + raise verification) or just alert (default lockdown)' },
      min_account_age_days: { type: 'number', description: 'Flag/act on accounts younger than this many days (0 = off)' },
      age_action: { type: 'string', enum: ['alert', 'kick', 'ban'], description: 'What to do with too-new accounts (default alert)' },
    },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const cfg = getConfig(guild.id).antiRaid || {};
    const next = {
      enabled: true,
      joinThreshold: params.join_threshold ?? cfg.joinThreshold ?? 8,
      windowSec: params.window_seconds ?? cfg.windowSec ?? 10,
      action: params.action || cfg.action || 'lockdown',
      minAccountAgeDays: params.min_account_age_days ?? cfg.minAccountAgeDays ?? 0,
      ageAction: params.age_action || cfg.ageAction || 'alert',
    };
    updateConfig(guild.id, { antiRaid: next });
    const age = next.minAccountAgeDays > 0 ? ` accounts under ${next.minAccountAgeDays}d get ${next.ageAction}.` : '';
    return `anti-raid is on 🛡️ — if ${next.joinThreshold}+ accounts join within ${next.windowSec}s i'll ${next.action === 'lockdown' ? 'lock the server + raise verification' : 'alert you'}.${age}`;
  },
});

// ── anti-scam toggle ────────────────────────────────────────────────────

registerTool('set_antiscam', {
  category: 'automation',
  description: 'Turn anti-scam link scanning on or off. Doll deletes known scam/phishing links (fake Nitro, gift scams) automatically. Optionally set what happens to the poster: delete, timeout, or kick.',
  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'true to enable scam scanning' },
      action: { type: 'string', enum: ['delete', 'timeout', 'kick'], description: 'What to do to the poster (default: delete only)' },
    },
    required: ['enabled'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const cfg = getConfig(guild.id);
    const antiScam = { enabled: params.enabled, action: params.action || cfg.antiScam?.action || 'delete' };
    updateConfig(guild.id, { antiScam });
    return params.enabled
      ? `anti-scam on — i'll remove scam/phishing links (action on poster: ${antiScam.action})`
      : 'anti-scam off';
  },
});
