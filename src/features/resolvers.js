// Name-to-Discord-object resolution helpers for AI tool execution.
// When the AI says "the vip role" or "general chat", these find the actual objects.
// All resolvers are fuzzy: ID > mention > exact name > partial match.

/**
 * Resolve a channel by name, ID, mention, or partial match.
 * @returns {import('discord.js').GuildChannel|null}
 */
export function resolveChannel(guild, query) {
  if (!query || !guild) return null;
  query = String(query).replace(/^#/, '').trim();

  // By ID
  const byId = guild.channels.cache.get(query);
  if (byId) return byId;

  // By mention <#id>
  const mentionMatch = query.match(/^<#(\d+)>$/);
  if (mentionMatch) return guild.channels.cache.get(mentionMatch[1]) || null;

  const lower = query.toLowerCase().replace(/[^a-z0-9-_ ]/g, '');

  // Exact name
  const exact = guild.channels.cache.find(c => c.name.toLowerCase() === lower);
  if (exact) return exact;

  // Exact with dashes (Discord converts spaces to dashes)
  const dashed = lower.replace(/\s+/g, '-');
  const exactDash = guild.channels.cache.find(c => c.name.toLowerCase() === dashed);
  if (exactDash) return exactDash;

  // Partial match
  return guild.channels.cache.find(c =>
    c.name.toLowerCase().includes(lower) || c.name.toLowerCase().includes(dashed)
  ) || null;
}

/**
 * Resolve a role by name, ID, mention, or partial match.
 * @returns {import('discord.js').Role|null}
 */
export function resolveRole(guild, query) {
  if (!query || !guild) return null;
  query = String(query).replace(/^@/, '').trim();

  const byId = guild.roles.cache.get(query);
  if (byId) return byId;

  const mentionMatch = query.match(/^<@&(\d+)>$/);
  if (mentionMatch) return guild.roles.cache.get(mentionMatch[1]) || null;

  const lower = query.toLowerCase();
  const exact = guild.roles.cache.find(r => r.name.toLowerCase() === lower && r.id !== guild.id);
  if (exact) return exact;

  return guild.roles.cache.find(r =>
    r.name.toLowerCase().includes(lower) && r.id !== guild.id
  ) || null;
}

/**
 * Resolve a member by name, ID, mention, display name, or partial match.
 * @returns {import('discord.js').GuildMember|null}
 */
export function resolveMember(guild, query) {
  if (!query || !guild) return null;
  query = String(query).replace(/^@/, '').trim();

  // By ID
  const byId = guild.members.cache.get(query);
  if (byId) return byId;

  // By mention <@id> or <@!id>
  const mentionMatch = query.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return guild.members.cache.get(mentionMatch[1]) || null;

  const lower = query.toLowerCase();

  // Exact display name, username, or tag
  const exact = guild.members.cache.find(m =>
    m.displayName.toLowerCase() === lower ||
    m.user.username.toLowerCase() === lower ||
    m.user.tag?.toLowerCase() === lower
  );
  if (exact) return exact;

  // Partial match
  return guild.members.cache.find(m =>
    m.displayName.toLowerCase().includes(lower) ||
    m.user.username.toLowerCase().includes(lower)
  ) || null;
}

/**
 * Resolve a member, falling back to fetching if not cached.
 */
export async function resolveMemberFetch(guild, query) {
  const cached = resolveMember(guild, query);
  if (cached) return cached;
  // Try fetching by ID if it looks like a snowflake
  if (/^\d{17,20}$/.test(query)) {
    try { return await guild.members.fetch(query); } catch { return null; }
  }
  // Try searching by query
  try {
    const results = await guild.members.fetch({ query, limit: 1 });
    return results.first() || null;
  } catch { return null; }
}

/**
 * Resolve permission flag names to Discord.js PermissionFlagsBits keys.
 * Accepts common short names like "view", "send", "manage_messages".
 */
const PERM_MAP = {
  view: 'ViewChannel',
  send: 'SendMessages',
  read: 'ViewChannel',
  embed: 'EmbedLinks',
  attach: 'AttachFiles',
  react: 'AddReactions',
  mention_everyone: 'MentionEveryone',
  manage_messages: 'ManageMessages',
  manage_channels: 'ManageChannels',
  manage_roles: 'ManageRoles',
  manage_webhooks: 'ManageWebhooks',
  manage_threads: 'ManageThreads',
  create_invite: 'CreateInstantInvite',
  voice_connect: 'Connect',
  voice_speak: 'Speak',
  voice_mute: 'MuteMembers',
  voice_deafen: 'DeafenMembers',
  voice_move: 'MoveMembers',
  use_vad: 'UseVAD',
  priority_speaker: 'PrioritySpeaker',
  stream: 'Stream',
  external_emojis: 'UseExternalEmojis',
  history: 'ReadMessageHistory',

  // Guild-level (role) permissions
  administrator: 'Administrator',
  admin: 'Administrator',
  kick: 'KickMembers',
  kick_members: 'KickMembers',
  ban: 'BanMembers',
  ban_members: 'BanMembers',
  timeout: 'ModerateMembers',
  moderate: 'ModerateMembers',
  moderate_members: 'ModerateMembers',
  manage_guild: 'ManageGuild',
  manage_server: 'ManageGuild',
  manage_nicknames: 'ManageNicknames',
  change_nickname: 'ChangeNickname',
  manage_emojis: 'ManageGuildExpressions',
  manage_expressions: 'ManageGuildExpressions',
  view_audit_log: 'ViewAuditLog',
  audit_log: 'ViewAuditLog',
  manage_events: 'ManageEvents',
  view_insights: 'ViewGuildInsights',
  deafen: 'DeafenMembers',
  request_to_speak: 'RequestToSpeak',
};

// Human-friendly labels for confirmation previews.
export const DANGEROUS_PERMS = new Set([
  'Administrator', 'BanMembers', 'KickMembers', 'ManageGuild', 'ManageRoles',
  'ManageChannels', 'ModerateMembers', 'ManageWebhooks', 'MentionEveryone',
]);

export function prettyPerm(flag) {
  return flag.replace(/([A-Z])/g, ' $1').trim();
}

export function resolvePermissions(permString) {
  if (!permString) return {};
  const result = {};
  for (const name of permString.split(',').map(s => s.trim().toLowerCase())) {
    const key = PERM_MAP[name] || name;
    result[key] = true;
  }
  return result;
}
