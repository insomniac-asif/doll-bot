// Feature-toggle tools — let owners flip AI features on/off by talking to Doll.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveFeature, setFeature, getAllFeatures, FEATURES } from '../features/featureToggle.js';
import { getConfig, updateConfig } from '../config.js';
import { getUsageStats } from '../features/aiProvider.js';
import { runDiagnostics, runLiveTest } from '../features/diagnostics.js';
import { peekUndo, popEntry, executeUndo, undoCount } from '../features/undoStack.js';
import { setManualStatus, clearManualStatus, isManualSet } from '../features/presence.js';
import { ActivityType } from 'discord.js';
import { buildDevReport } from '../features/devMonitor.js';

// ── dev_overview (developer only) ───────────────────────────────────────

registerTool('dev_overview', {
  category: 'config',
  description: 'DEVELOPER ONLY: a cross-server health report for the bot operator — which servers need attention (missing permissions, config gaps, recent failures/raids). Use when the developer asks "any issues in the servers", "anything to worry about", "how are the servers doing".',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.OWNER,
  async execute(_params, { client, member }) {
    if (member.id !== process.env.OWNER_ID) return 'this is a developer-only overview.';
    return buildDevReport(client);
  },
});

// ── set_status ──────────────────────────────────────────────────────────

registerTool('set_status', {
  category: 'config',
  description: 'Set Doll\'s Discord status/presence (the line under her name). Pins it until cleared. Note: this is global across all servers she\'s in.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The status text' },
      type: { type: 'string', enum: ['custom', 'playing', 'watching', 'listening'], description: 'Status type (default custom)' },
    },
    required: ['text'],
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { client }) {
    const map = { custom: ActivityType.Custom, playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening };
    setManualStatus(client, params.text, map[params.type] || ActivityType.Custom);
    return `set my status to "${params.text}" 🎀 (say "resume rotating status" to go back to the cute rotation)`;
  },
});

registerTool('clear_status', {
  category: 'config',
  description: 'Resume Doll\'s rotating cute presences (undo a pinned set_status)',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.OWNER,
  async execute(_params, { client }) {
    clearManualStatus(client);
    return isManualSet() ? 'still pinned' : 'back to rotating cute statuses ✿';
  },
});

// ── undo_last ───────────────────────────────────────────────────────────

registerTool('undo_last', {
  category: 'config',
  description: 'Undo Doll\'s most recent reversible action — e.g. delete a role/channel she just made, take back a role she gave, unban someone, restore a nickname, remove a panel, lift a lock. Use when the user says "undo", "undo that", "nevermind", or "revert".',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.ADMIN,
  async execute(_params, { guild }) {
    const entry = peekUndo(guild.id);
    if (!entry) return 'nothing to undo right now';
    let result;
    try { result = await executeUndo(guild, entry); }
    catch (e) { return `couldn't undo "${entry.label}": ${e.message}`; }
    popEntry(guild.id);
    const left = undoCount(guild.id);
    return `undid: ${entry.label} → ${result}${left ? ` (say "undo" again to keep reverting, ${left} left)` : ''}`;
  },
});

// ── undo_history ────────────────────────────────────────────────────────

registerTool('undo_history', {
  category: 'config',
  description: 'Show the recent actions Doll can undo',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.MOD,
  async execute(_params, { guild }) {
    const { getStore } = await import('../store.js');
    const stack = getStore('undo', guild.id, { stack: [] }).stack;
    if (stack.length === 0) return 'no recent actions to undo';
    const recent = stack.slice(-8).reverse().map((e, i) => `${i === 0 ? '↩️ next undo →' : `  ${i + 1}.`} ${e.label}`);
    return `recent undoable actions:\n${recent.join('\n')}`;
  },
});

// ── run_diagnostics ─────────────────────────────────────────────────────

registerTool('run_diagnostics', {
  category: 'config',
  description: 'Run a full self-check — verify permissions, AI brain, gif/translate/music services, config, and all tools are working. Use when asked to "test everything", "run diagnostics", "are you working", "self test", or "health check".',
  parameters: {
    type: 'object',
    properties: { live: { type: 'boolean', description: 'Also run a LIVE test that creates a throwaway channel+role+gif panel and deletes them (proves the full create path). Default false.' } },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, client }) {
    const report = await runDiagnostics(guild, client);
    if (params.live) {
      const live = await runLiveTest(guild);
      return `${report}\n\n${live}`;
    }
    return `${report}\n\n(say "run a live test" and i'll actually create + delete a test channel/role/gif to prove the whole path)`;
  },
});

// ── run_live_test ───────────────────────────────────────────────────────

registerTool('run_live_test', {
  category: 'config',
  description: 'Run a LIVE end-to-end test: actually create a throwaway channel + role + gif embed, then delete them — proves the full create/gif/permission path works.',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.ADMIN,
  async execute(_params, { guild }) {
    return runLiveTest(guild);
  },
});

// ── ai_usage ────────────────────────────────────────────────────────────

registerTool('ai_usage', {
  category: 'config',
  description: 'Show which AI provider Doll has been using (Mistral = free, DeepSeek = paid fallback). Lets the owner verify costs.',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.ADMIN,
  async execute() {
    const s = getUsageStats();
    const fmt = n => n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`;
    return [
      `**AI usage** (last ${s.uptimeMin} min · primary: ${s.primary} · model: ${s.mistralModel})`,
      `🟢 Mistral: ${s.mistral} calls · ${(s.mistralIn / 1000).toFixed(1)}k in / ${(s.mistralOut / 1000).toFixed(1)}k out tokens`,
      `💸 DeepSeek: ${s.deepseek} calls (${s.deepseekShare}%) · ${(s.deepseekIn / 1000).toFixed(1)}k in / ${(s.deepseekOut / 1000).toFixed(1)}k out`,
      `↩️ fallbacks: ${s.fallbacks}${s.mistralFail ? ` (Mistral errored ${s.mistralFail}×)` : ''}`,
      `💰 spent so far: ${fmt(s.totalCost)} (Mistral ${fmt(s.mistralCost)} + DeepSeek ${fmt(s.deepseekCost)})`,
      `📊 ~${fmt(s.costPerCall)}/call → est. ${fmt(s.projMonthly10k)}/mo at 10k commands`,
      s.deepseek === 0 ? `running entirely on Mistral 🎀` : `DeepSeek only kicks in when Mistral errors/rate-limits.`,
    ].join('\n');
  },
});

// ── set_personality ─────────────────────────────────────────────────────

const PERSONALITIES = {
  default: 'default', cutesy: 'cutesy', cute: 'cutesy', sanrio: 'cutesy', soft: 'cutesy',
  professional: 'professional', formal: 'professional', casual: 'casual', chill: 'casual',
  fun: 'fun', playful: 'fun', strict: 'strict', firm: 'strict',
};

registerTool('set_personality', {
  category: 'config',
  description: 'Change Doll\'s personality/tone for this server. Options: default (dry-witted), cutesy (soft/sanrio/pastel), professional, casual, fun, strict.',
  parameters: {
    type: 'object',
    properties: { style: { type: 'string', description: 'cutesy, default, professional, casual, fun, or strict' } },
    required: ['style'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const key = PERSONALITIES[params.style?.toLowerCase()?.trim()];
    if (!key) return `i can be: default, cutesy (soft/sanrio), professional, casual, fun, or strict. which one?`;
    updateConfig(guild.id, { personality: key });
    return key === 'cutesy'
      ? `switching to my soft cutesy side 🎀 i'll keep things gentle and pastel from here`
      : `okay, i'll be more ${key} now`;
  },
});

// ── toggle_feature ──────────────────────────────────────────────────────

registerTool('toggle_feature', {
  category: 'config',
  description: 'Turn one of Doll\'s AI features on or off for this server. Features: catch-up summaries, AI announcements, auto-FAQ, automation rules, server health digest, smart moderation.',
  parameters: {
    type: 'object',
    properties: {
      feature: { type: 'string', description: 'Which feature (e.g. "auto-faq", "catch-up", "health digest", "automation rules", "smart moderation", "announcements")' },
      enabled: { type: 'boolean', description: 'true to turn on, false to turn off' },
    },
    required: ['feature', 'enabled'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const key = resolveFeature(params.feature);
    if (!key) {
      const names = Object.values(FEATURES).map(f => f.label).join(', ');
      return `i don't recognize the feature "${params.feature}". i can toggle: ${names}`;
    }
    setFeature(guild.id, key, params.enabled);
    return `${params.enabled ? 'turned on' : 'turned off'} ${FEATURES[key].label}`;
  },
});

// ── list_features ───────────────────────────────────────────────────────

registerTool('list_features', {
  category: 'config',
  description: 'Show which of Doll\'s features are currently on or off for this server (everything is toggleable)',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const features = getAllFeatures(guild.id);
    const on = features.filter(f => f.enabled).map(f => f.label);
    const off = features.filter(f => !f.enabled).map(f => f.label);
    const parts = [`**Features for ${guild.name}** — say "turn off <feature>" or "turn on <feature>" to change any.`];
    parts.push(`\n🟢 **On (${on.length}):** ${on.join(', ') || 'none'}`);
    parts.push(`⚪ **Off (${off.length}):** ${off.join(', ') || 'none'}`);
    return parts.join('\n');
  },
});
