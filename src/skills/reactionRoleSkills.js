// Conversational reaction-role tools. Lets Doll build a full panel in one shot:
// create the embed, post it, react with each emoji, and link each role —
// or amend an existing panel. Roles referenced by name; can create missing ones.

import { EmbedBuilder } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel, resolveRole } from '../features/resolvers.js';
import { linkRole, unlinkRole } from '../features/reactionRoles.js';
import { getAccent } from '../config.js';
import { resolveGifUrl, fetchGifAttachment, resolveImageInput } from '../features/media.js';
import { recordUndo } from '../features/undoStack.js';
import { recordBotMessage } from '../features/botMessages.js';

// Parse an emoji string for reacting. Custom: <:name:id> / <a:name:id>, unicode: 🎀
function parseEmoji(input) {
  const custom = String(input).match(/<(a?):(\w+):(\d+)>/);
  if (custom) return { reactable: custom[3], isCustom: true, id: custom[3], name: custom[2], animated: !!custom[1] };
  return { reactable: input, isCustom: false, id: null, name: input };
}

// Find a posted message by ID across the guild's text channels.
async function findMessage(guild, messageId) {
  const channels = guild.channels.cache.filter(c => c.isTextBased?.());
  for (const channel of channels.values()) {
    try {
      const msg = await channel.messages.fetch(messageId);
      if (msg) return msg;
    } catch { /* not here */ }
  }
  return null;
}

// ── create_reaction_role_panel ──────────────────────────────────────────
// The big one. Builds + posts + reacts + links in a single call.

registerTool('create_reaction_role_panel', {
  category: 'role',
  description: 'Create a complete reaction-role panel: posts an embed and wires up emoji→role pairs so members can self-assign roles by reacting. Pass pairs as a list of {emoji, role}. Roles are matched by name; set create_missing=true to auto-create any roles that don\'t exist yet.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to post the panel in' },
      title: { type: 'string', description: 'Embed title' },
      description: { type: 'string', description: 'Embed body text (use \\n for line breaks). List the emoji→role choices here for users to read.' },
      color: { type: 'string', description: 'Hex color like "#ffb3d9" (defaults to the server accent color)' },
      image: { type: 'string', description: 'GIF for the embed — pass EITHER a real URL the user gave, OR a short search term (e.g. "pastel sparkles", "cute bunny") and i\'ll find a real gif automatically. Prefer a search term over making the user pick.' },
      pairs: {
        type: 'array',
        description: 'Emoji→role mappings. Each item: {emoji, role}',
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string', description: 'Unicode emoji (🎀) or custom emoji (<:name:id>)' },
            role: { type: 'string', description: 'Role name to grant' },
          },
          required: ['emoji', 'role'],
        },
      },
      create_missing: { type: 'boolean', description: 'Create roles that don\'t exist yet (default true)' },
      create_channel: { type: 'boolean', description: 'If the channel doesn\'t exist, create it (default true)' },
    },
    required: ['channel', 'title', 'pairs'],
  },
  permLevel: PermLevel.ADMIN,
  confirm: true,
  preview(params, { guild }) {
    const lines = [`i'll set up a reaction-role panel:`];
    const ch = resolveChannel(guild, params.channel);
    lines.push(`• channel: ${ch ? `#${ch.name}` : `#${params.channel} (i'll create it — doesn't exist yet)`}`);
    lines.push(`• title: "${params.title}"`);
    if (params.image) lines.push(`• gif/image: yes`);
    const pairLines = (params.pairs || []).map(p => {
      const role = resolveRole(guild, p.role);
      return `   ${p.emoji} → @${p.role}${role ? '' : ' (new role, i\'ll create it)'}`;
    });
    lines.push(`• roles people can pick:\n${pairLines.join('\n')}`);
    lines.push(`\nlook good? confirm and i'll build it.`);
    return lines.join('\n');
  },
  async execute(params, { guild }) {
    const createMissing = params.create_missing !== false;
    const createChannel = params.create_channel !== false;
    if (!Array.isArray(params.pairs) || params.pairs.length === 0) return `no emoji→role pairs given`;

    // ── Resolve or create the channel ──
    let ch = resolveChannel(guild, params.channel);
    let createdChannelId = null;
    if (!ch) {
      if (!createChannel) return `couldn't find channel "${params.channel}"`;
      try {
        const { ChannelType } = await import('discord.js');
        ch = await guild.channels.create({ name: String(params.channel).replace(/^#/, ''), type: ChannelType.GuildText, reason: 'Reaction-role panel via AI' });
        createdChannelId = ch.id;
      } catch (e) {
        return `couldn't create the channel "${params.channel}": ${e.message}`;
      }
    }
    if (!ch.isTextBased?.()) return `#${ch.name} isn't a text channel`;

    // ── Resolve (or create) every role first, so we fail before posting ──
    const resolved = [];
    const created = [];
    const createdRoleIds = [];
    for (const pair of params.pairs) {
      let role = resolveRole(guild, pair.role);
      if (!role) {
        if (createMissing) {
          try {
            role = await guild.roles.create({ name: pair.role, reason: 'Reaction-role panel via AI' });
            created.push(role.name);
            createdRoleIds.push(role.id);
          } catch (e) {
            return `couldn't create role "${pair.role}": ${e.message}`;
          }
        } else {
          return `role "${pair.role}" doesn't exist. say to create it and i'll make the missing roles, or use existing role names`;
        }
      }
      resolved.push({ emoji: pair.emoji, role });
    }

    // ── Build + post the embed ──
    const embed = new EmbedBuilder()
      .setTitle(params.title)
      .setColor(params.color ? parseInt(params.color.replace('#', ''), 16) : getAccent(guild.id));
    if (params.description) embed.setDescription(params.description.replace(/\\n/g, '\n'));

    // Make the gif show INSIDE the embed. Tenor blocks Discord from hotlinking
    // its media in embeds, so we DOWNLOAD the gif and attach it (Discord then
    // hosts it → always renders). Falls back to hotlinking, then to a link.
    const files = [];
    let imageSet = false;
    let imageFailed = false;
    if (params.image) {
      // image can be a URL, a number (from last search), or a search term like "sparkles"
      const imageUrl = await resolveImageInput(params.image, guild.id).catch(() => null);
      const a = imageUrl ? await fetchGifAttachment(imageUrl, 'panel').catch(() => null) : null;
      if (a?.attachment) {
        embed.setImage(`attachment://${a.name}`);
        files.push(a.attachment);
        imageSet = true;
      } else if (a?.directUrl) {
        embed.setImage(a.directUrl);
        imageSet = true;
      } else {
        // URL was unreachable/fake — do NOT post a dead link
        imageFailed = true;
      }
    }

    let msg;
    try {
      msg = await ch.send({ embeds: [embed], files });
    } catch (e) {
      return `couldn't post the panel in #${ch.name}: ${e.message}`;
    }

    // ── React + link each pair ──
    const linked = [];
    const failed = [];
    for (const { emoji, role } of resolved) {
      const parsed = parseEmoji(emoji);
      try {
        await msg.react(parsed.isCustom ? parsed.id : parsed.reactable);
        const emojiObj = parsed.isCustom ? { id: parsed.id } : { name: parsed.name };
        linkRole(guild.id, msg.id, ch.id, emojiObj, role.id);
        linked.push(`${emoji} → @${role.name}`);
      } catch (e) {
        failed.push(`${emoji} (${e.message})`);
      }
    }

    // Record undo: remove the panel msg + any roles/channel it created
    recordUndo(guild, `made the "${params.title}" panel in #${ch.name}`, 'delete_panel', {
      channelId: ch.id, messageId: msg.id, createdRoleIds, createdChannelId,
    });
    // Track so Doll can edit it later ("add a gif to that panel")
    recordBotMessage(guild, { channelId: ch.id, messageId: msg.id, kind: 'reaction-role panel', title: params.title });

    // ── Report ──
    const lines = [`posted reaction-role panel "${params.title}" in #${ch.name}`];
    if (created.length) lines.push(`created roles: ${created.map(r => `@${r}`).join(', ')}`);
    lines.push(`wired up: ${linked.join(', ')}`);
    if (failed.length) lines.push(`couldn't react with: ${failed.join(', ')} — custom emojis must be from a server i'm in`);
    if (imageFailed) lines.push(`note: the gif URL didn't work (it may have been made up or unreachable) — use the search_gif tool for a real one, then i can add it`);
    lines.push(`panel message id: ${msg.id}`);
    return lines.join('\n');
  },
});

// ── add_reaction_role ───────────────────────────────────────────────────
// Add one emoji→role pair to an existing panel.

registerTool('add_reaction_role', {
  category: 'role',
  description: 'Add an emoji→role mapping to an existing reaction-role panel (by its message ID)',
  parameters: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Message ID of the existing panel' },
      emoji: { type: 'string', description: 'Emoji to add' },
      role: { type: 'string', description: 'Role name to grant' },
    },
    required: ['message_id', 'emoji', 'role'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const msg = await findMessage(guild, params.message_id);
    if (!msg) return `couldn't find a panel with message id ${params.message_id}`;
    const role = resolveRole(guild, params.role);
    if (!role) return `couldn't find role "${params.role}"`;

    const parsed = parseEmoji(params.emoji);
    try {
      await msg.react(parsed.isCustom ? parsed.id : parsed.reactable);
    } catch (e) {
      return `couldn't react with ${params.emoji}: ${e.message}`;
    }
    const emojiObj = parsed.isCustom ? { id: parsed.id } : { name: parsed.name };
    linkRole(guild.id, msg.id, msg.channel.id, emojiObj, role.id);
    return `added ${params.emoji} → @${role.name} to that panel`;
  },
});

// ── remove_reaction_role ────────────────────────────────────────────────

registerTool('remove_reaction_role', {
  category: 'role',
  description: 'Remove an emoji→role mapping from a reaction-role panel',
  parameters: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Message ID of the panel' },
      emoji: { type: 'string', description: 'Emoji to unlink' },
    },
    required: ['message_id', 'emoji'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const parsed = parseEmoji(params.emoji);
    const emojiObj = parsed.isCustom ? { id: parsed.id } : { name: parsed.name };
    unlinkRole(guild.id, params.message_id, emojiObj);

    // Best-effort: remove Doll's own reaction from the panel
    const msg = await findMessage(guild, params.message_id);
    if (msg) {
      try {
        const react = msg.reactions.cache.find(r => r.emoji.id === parsed.id || r.emoji.name === parsed.name);
        if (react) await react.users.remove(guild.members.me.id);
      } catch { /* ignore */ }
    }
    return `unlinked ${params.emoji} from that panel`;
  },
});
