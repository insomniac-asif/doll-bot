// Automation-rule tools — create from English, list, delete, enable/disable.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { isEnabled } from '../features/featureToggle.js';
import { compileRule, listRules, removeRule, setRuleEnabled, describeRule } from '../features/rulesEngine.js';

// ── create_rule ─────────────────────────────────────────────────────────

registerTool('create_rule', {
  category: 'config',
  description: 'Create an automation/automod rule from a plain-English description. Examples: "auto-mute anyone who posts 5+ links in 10 seconds", "delete messages with these slurs: x, y", "when someone reaches level 10 give them Regular and post a welcome in #staff", "DM new members the rules when they join".',
  parameters: {
    type: 'object',
    properties: { description: { type: 'string', description: 'Plain-English description of the rule' } },
    required: ['description'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    if (!isEnabled(guild.id, 'rulesEngine')) return 'the automation rules engine is turned off for this server (turn it on first)';
    const result = await compileRule(guild.id, params.description);
    if (result.error) return result.error;
    const r = result.rule;
    return `created rule #${r.id}: ${r.description}\ntrigger: ${r.trigger}, actions: ${r.actions.map(a => a.type).join(', ')}. it's active now`;
  },
});

// ── list_rules ──────────────────────────────────────────────────────────

registerTool('list_rules', {
  category: 'config',
  description: 'List the server\'s automation rules',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const rules = listRules(guild.id);
    if (rules.length === 0) return 'no automation rules set up yet';
    return `automation rules:\n${rules.map(describeRule).join('\n')}`;
  },
});

// ── delete_rule ─────────────────────────────────────────────────────────

registerTool('delete_rule', {
  category: 'config',
  description: 'Delete an automation rule by its number',
  parameters: {
    type: 'object',
    properties: { id: { type: 'number', description: 'Rule number (from list_rules)' } },
    required: ['id'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const removed = removeRule(guild.id, params.id);
    return removed > 0 ? `deleted rule #${params.id}` : `couldn't find rule #${params.id}`;
  },
});

// ── set_rule ────────────────────────────────────────────────────────────

registerTool('set_rule', {
  category: 'config',
  description: 'Enable or disable an automation rule by its number',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'Rule number' },
      enabled: { type: 'boolean', description: 'true to enable, false to disable' },
    },
    required: ['id', 'enabled'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ok = setRuleEnabled(guild.id, params.id, params.enabled);
    if (!ok) return `couldn't find rule #${params.id}`;
    return `${params.enabled ? 'enabled' : 'disabled'} rule #${params.id}`;
  },
});
