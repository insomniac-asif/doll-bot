// Support tools — suggestions, modmail setup, applications.

import { ChannelType } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel, resolveRole } from '../features/resolvers.js';
import { getConfig, updateConfig } from '../config.js';
import { postSuggestion, setSuggestionStatus } from '../features/suggestions.js';
import { createApplication, listApplications, deleteApplication, runApplication } from '../features/applications.js';
import { createTicket } from '../features/devSupport.js';

// ── contact_developer ───────────────────────────────────────────────────

registerTool('contact_developer', {
  category: 'support',
  description: 'Send a message, bug report, or feature request to the bot\'s developer. The developer can reply back through Doll. Use when the owner says "contact the developer", "report a bug", "request a feature", "tell whoever made you", or needs help Doll can\'t give herself.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'What to tell the developer' },
      subject: { type: 'string', description: 'Short subject (optional)' },
    },
    required: ['message'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, member, client }) {
    const t = await createTicket(client, guild, member, params.subject, params.message);
    return `sent that to my developer 🎀 (ticket #${t.id}) — they'll reply to you right here through me when they see it`;
  },
});

// ── Suggestions ─────────────────────────────────────────────────────────

registerTool('suggest', {
  category: 'support',
  description: 'Submit a suggestion to the server suggestion board for members to vote on',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string', description: 'The suggestion' } },
    required: ['text'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, member }) {
    const result = await postSuggestion(guild, member, params.text);
    return result.error || `posted your suggestion as #${result.id} — members can vote with 👍/👎`;
  },
});

registerTool('review_suggestion', {
  category: 'support',
  description: 'Approve, deny, or mark a suggestion as under consideration',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'Suggestion number' },
      status: { type: 'string', enum: ['approved', 'denied', 'considered'], description: 'New status' },
      reason: { type: 'string', description: 'Optional reason shown to the author' },
    },
    required: ['id', 'status'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, member }) {
    const result = await setSuggestionStatus(guild, params.id, params.status, params.reason, member.displayName);
    return result.error || `marked suggestion #${result.id} as ${result.status}`;
  },
});

registerTool('set_suggestion_channel', {
  category: 'support',
  description: 'Set the channel where suggestions are posted',
  parameters: {
    type: 'object',
    properties: { channel: { type: 'string', description: 'Channel for suggestions' } },
    required: ['channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    updateConfig(guild.id, { suggestions: { channel: ch.id } });
    return `suggestions will now post in #${ch.name}`;
  },
});

// ── ModMail setup ───────────────────────────────────────────────────────

registerTool('setup_modmail', {
  category: 'support',
  description: 'Set up ModMail so members can DM Doll to reach staff privately. Provide a category for the ticket channels and the staff role.',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Category name where modmail channels are created' },
      staff_role: { type: 'string', description: 'Role that can see and reply to modmail' },
    },
    required: ['category', 'staff_role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const cat = resolveChannel(guild, params.category);
    if (!cat || cat.type !== ChannelType.GuildCategory) return `couldn't find a category called "${params.category}" — make one first`;
    const role = resolveRole(guild, params.staff_role);
    if (!role) return `couldn't find role "${params.staff_role}"`;
    updateConfig(guild.id, { modmail: { enabled: true, category: cat.id, staffRole: role.id, logChannel: null } });
    return `modmail is on — members who DM me will reach @${role.name} via private channels under "${cat.name}". reply in those channels to talk back; type "close" to end one`;
  },
});

registerTool('toggle_modmail', {
  category: 'support',
  description: 'Turn ModMail on or off',
  parameters: {
    type: 'object',
    properties: { enabled: { type: 'boolean', description: 'true to enable' } },
    required: ['enabled'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const cfg = getConfig(guild.id);
    if (params.enabled && !cfg.modmail?.category) return 'set up modmail first (i need a category and staff role)';
    updateConfig(guild.id, { modmail: { ...cfg.modmail, enabled: params.enabled } });
    return params.enabled ? 'modmail on' : 'modmail off';
  },
});

// ── Applications ────────────────────────────────────────────────────────

registerTool('create_application', {
  category: 'support',
  description: 'Create an application/form members can fill out (e.g. staff application). Provide the questions and the channel where submissions go for review.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Application name (e.g. "staff", "whitelist")' },
      questions: { type: 'array', items: { type: 'string' }, description: 'The questions to ask, in order' },
      review_channel: { type: 'string', description: 'Channel where submissions are posted for staff to review' },
      accept_role: { type: 'string', description: 'Optional role to grant when accepted' },
    },
    required: ['name', 'questions', 'review_channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    if (!Array.isArray(params.questions) || params.questions.length === 0) return 'give me at least one question';
    const ch = resolveChannel(guild, params.review_channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.review_channel}"`;
    const role = params.accept_role ? resolveRole(guild, params.accept_role) : null;
    createApplication(guild.id, params.name, params.questions.slice(0, 20), ch.id, role?.id || null);
    return `created the "${params.name}" application with ${params.questions.length} questions — submissions go to #${ch.name}${role ? `, accepted applicants get @${role.name}` : ''}. members can say "apply for ${params.name}"`;
  },
});

registerTool('apply', {
  category: 'support',
  description: 'Start filling out an application — Doll will DM the questions. Use when a member wants to apply for staff, whitelist, etc.',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Which application to fill out' } },
    required: ['name'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, member, client }) {
    const result = await runApplication(member, params.name, client);
    return result.error || `check your DMs — i've sent you the first question for the "${params.name}" application 📝`;
  },
});

registerTool('list_applications', {
  category: 'support',
  description: 'List the application forms set up on this server',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const apps = listApplications(guild.id);
    if (apps.length === 0) return 'no applications set up';
    return `applications:\n${apps.map(a => `• ${a.name} (${a.questions.length} questions)`).join('\n')}`;
  },
});

registerTool('delete_application', {
  category: 'support',
  description: 'Delete an application form',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Application name to delete' } },
    required: ['name'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    return deleteApplication(guild.id, params.name) ? `deleted the "${params.name}" application` : `no application called "${params.name}"`;
  },
});
