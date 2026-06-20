// Misc tools — logging toggles, auto-translate, RSS feeds, dropdown role menus.

import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel, resolveRole } from '../features/resolvers.js';
import { getConfig, updateConfig, getAccent } from '../config.js';
import { addFeed, removeFeed, listFeeds } from '../features/rss.js';
import { saveRoleMenu } from '../features/roleMenus.js';
import { LANG_NAMES } from '../features/translate.js';
import { styleText, FONT_NAMES, DECOR_NAMES } from '../features/fonts.js';
import { searchGif, fetchGifAttachment, resolveImageInput, setLastGifSearch } from '../features/media.js';
import { EmbedBuilder as EB } from 'discord.js';
import { findBotMessage, fetchTrackedMessage, recordBotMessage } from '../features/botMessages.js';

// ── edit_embed ──────────────────────────────────────────────────────────

registerTool('edit_embed', {
  category: 'utility',
  description: 'Edit an embed Doll previously posted (a reaction-role panel, announcement, etc.) — add or change its gif/image, title, description, or color. If no message id is given, edits the MOST RECENT embed Doll posted (optionally narrow by channel or a title hint). Use for "add a gif to that panel", "change the title of the announcement", etc. To add a gif, pass a real URL or search_gif first.',
  parameters: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Message ID (optional — defaults to the most recent embed Doll posted)' },
      channel: { type: 'string', description: 'Narrow to a channel (optional)' },
      which: { type: 'string', description: 'A title/kind hint to pick the right one if there are several (e.g. "colors", "panel")' },
      image: { type: 'string', description: 'Gif/image URL to set, or "remove" to take the image off' },
      title: { type: 'string', description: 'New title' },
      description: { type: 'string', description: 'New description' },
      color: { type: 'string', description: 'New hex color' },
    },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const chId = params.channel ? resolveChannel(guild, params.channel)?.id : null;
    const entry = findBotMessage(guild.id, { messageId: params.message_id, channelId: chId, hint: params.which });
    if (!entry) return `i can't find an embed i posted to edit — give me the message id, or tell me which channel/panel`;
    const msg = await fetchTrackedMessage(guild, entry);
    if (!msg) return `couldn't fetch that message (it may have been deleted)`;
    if (msg.author.id !== guild.members.me.id) return `i can only edit messages i posted myself`;
    if (!msg.embeds?.length) return `that message doesn't have an embed to edit`;

    const embed = EB.from(msg.embeds[0]);
    const changed = [];
    if (params.title) { embed.setTitle(params.title); changed.push('title'); }
    if (params.description) { embed.setDescription(params.description.replace(/\\n/g, '\n')); changed.push('description'); }
    if (params.color) { embed.setColor(parseInt(params.color.replace('#', ''), 16)); changed.push('color'); }

    let files; let imageNote = '';
    if (params.image) {
      if (/^(remove|none|delete|off)$/i.test(params.image)) {
        embed.setImage(null); changed.push('removed image');
      } else {
        // image can be a URL, a number (last search), or a search term
        const imageUrl = await resolveImageInput(params.image, guild.id).catch(() => null);
        const a = imageUrl ? await fetchGifAttachment(imageUrl, 'embed').catch(() => null) : null;
        if (a?.attachment) { embed.setImage(`attachment://${a.name}`); files = [a.attachment]; changed.push('gif'); }
        else if (a?.directUrl) { embed.setImage(a.directUrl); changed.push('gif'); }
        else imageNote = ' (but i couldn\'t find a gif for that — try a different search term or a link)';
      }
    }
    if (changed.length === 0 && !imageNote) return `tell me what to change — a new gif, title, description, or color`;

    const payload = { embeds: [embed] };
    if (files) { payload.files = files; payload.attachments = []; } // replace old attachment
    try {
      await msg.edit(payload);
    } catch (e) {
      return `couldn't edit it: ${e.message}`;
    }
    return `updated the embed (${changed.join(', ') || 'no changes'})${imageNote}`;
  },
});

// ── delete_message ──────────────────────────────────────────────────────

registerTool('delete_message', {
  category: 'utility',
  description: 'Delete a message — one Doll posted (a panel/embed) or any message by id. Useful for "delete that panel and post a new one".',
  parameters: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Message ID (optional — defaults to the most recent embed Doll posted)' },
      channel: { type: 'string', description: 'Channel the message is in (optional)' },
      which: { type: 'string', description: 'Title/kind hint to pick the right one' },
    },
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel }) {
    let msg = null;
    if (params.message_id && params.channel) {
      const ch = resolveChannel(guild, params.channel) || channel;
      msg = await ch?.messages?.fetch(params.message_id).catch(() => null);
    }
    if (!msg) {
      const chId = params.channel ? resolveChannel(guild, params.channel)?.id : null;
      const entry = findBotMessage(guild.id, { messageId: params.message_id, channelId: chId, hint: params.which });
      if (entry) msg = await fetchTrackedMessage(guild, entry);
    }
    if (!msg) return `couldn't find that message to delete — give me the id and channel`;
    const desc = msg.embeds?.[0]?.title || 'that message';
    try { await msg.delete(); } catch (e) { return `couldn't delete it: ${e.message}`; }
    return `deleted "${desc}"`;
  },
});

// ── search_gif ──────────────────────────────────────────────────────────

registerTool('search_gif', {
  category: 'utility',
  description: 'Search for a REAL gif by keyword and get actual usable URLs. ALWAYS use this to get a gif URL — never make up or guess a tenor/giphy link. Use the returned URL directly in embeds/panels.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What kind of gif (e.g. "pastel sparkles", "cute bunny")' } },
    required: ['query'],
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, channel }) {
    const urls = await searchGif(params.query, 5);
    if (urls.length === 0) return `couldn't find any gifs for "${params.query}" — try a different term or ask for a link`;
    if (guild) setLastGifSearch(guild.id, urls);
    // post the actual gifs so the user can SEE them and pick a number
    try {
      await channel.send(`here are some **${params.query}** options — tell me a number (or "use 2"):\n${urls.map((u, i) => `**${i + 1}.** ${u}`).join('\n')}`);
    } catch { /* no perms */ }
    return `showed ${urls.length} real "${params.query}" gif options (numbered 1-${urls.length}). when the user picks a number, pass that number to the image param of create_reaction_role_panel or edit_embed`;
  },
});

// ── style_text ──────────────────────────────────────────────────────────

registerTool('style_text', {
  category: 'utility',
  description: 'Convert text into a fancy unicode font and/or wrap it in cute decorations — for channel/category/role names, titles, or just to show samples. Fonts: script (𝓬𝓾𝓽𝓮), bold, mono, fullwidth, bubble, smallcaps. Decorations: sparkle, hearts, bows, flower, stars, full, paw.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to style' },
      font: { type: 'string', description: 'Font style: script, bold, mono, fullwidth, bubble, smallcaps (optional)' },
      decorate: { type: 'string', description: 'Decoration wrapper: sparkle, hearts, bows, flower, stars, full, paw (optional)' },
    },
    required: ['text'],
  },
  permLevel: PermLevel.READ,
  async execute(params) {
    const out = styleText(params.text, params.font, params.decorate);
    if (out === params.text && (params.font || params.decorate)) {
      return `i can use fonts: ${FONT_NAMES.join(', ')} — and decorations: ${DECOR_NAMES.join(', ')}`;
    }
    return out;
  },
});

// ── set_logging ─────────────────────────────────────────────────────────

registerTool('set_logging', {
  category: 'config',
  description: 'Turn a logging category on or off. Categories: voice, nicknames, roles, channels. (Requires a log channel set via /setup.)',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ['voice', 'nicknames', 'roles', 'channels'], description: 'Which logging category' },
      enabled: { type: 'boolean', description: 'true to enable' },
    },
    required: ['category', 'enabled'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const cfg = getConfig(guild.id);
    const logging = { ...cfg.logging, [params.category]: params.enabled };
    updateConfig(guild.id, { logging });
    const warn = cfg.logChannel ? '' : ' (heads up — no log channel is set yet, use /setup)';
    return `${params.enabled ? 'enabled' : 'disabled'} ${params.category} logging${warn}`;
  },
});

// ── set_autotranslate ───────────────────────────────────────────────────

registerTool('set_autotranslate', {
  category: 'config',
  description: 'Turn auto-translation on or off for a channel. When on, Doll translates messages not already in the target language. Free.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to auto-translate' },
      language: { type: 'string', description: 'Target language (e.g. "english", "spanish", "ja") — required when enabling' },
      enabled: { type: 'boolean', description: 'true to enable, false to disable' },
    },
    required: ['channel', 'enabled'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const cfg = getConfig(guild.id);
    const map = { ...(cfg.autotranslate || {}) };

    if (!params.enabled) {
      delete map[ch.id];
      updateConfig(guild.id, { autotranslate: map });
      return `turned off auto-translate in #${ch.name}`;
    }

    const code = resolveLang(params.language);
    if (!code) return `which language? try "english", "spanish", "japanese", etc.`;
    map[ch.id] = code;
    updateConfig(guild.id, { autotranslate: map });
    return `auto-translating #${ch.name} to ${LANG_NAMES[code] || code} now`;
  },
});

function resolveLang(input) {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  if (LANG_NAMES[q]) return q; // already a code
  for (const [code, name] of Object.entries(LANG_NAMES)) {
    if (name.toLowerCase() === q || q.startsWith(name.toLowerCase())) return code;
  }
  if (/^[a-z]{2}$/.test(q)) return q; // assume a valid 2-letter code
  return null;
}

// ── RSS feeds ───────────────────────────────────────────────────────────

registerTool('add_feed', {
  category: 'feeds',
  description: 'Watch an RSS/Atom feed and post new items to a channel. Works for blogs, news sites, YouTube channels, subreddits (add .rss), podcasts — anything with a feed URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The feed URL' },
      channel: { type: 'string', description: 'Channel to post new items in' },
      name: { type: 'string', description: 'Optional label for the feed' },
    },
    required: ['url', 'channel'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const result = await addFeed(guild.id, params.url, ch.id, params.name);
    if (result.error) return result.error;
    return `now watching **${result.name}** — new posts will go to #${ch.name}`;
  },
});

registerTool('remove_feed', {
  category: 'feeds',
  description: 'Stop watching an RSS feed by its number or name',
  parameters: {
    type: 'object',
    properties: { which: { type: 'string', description: 'Feed number or name' } },
    required: ['which'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const n = removeFeed(guild.id, params.which);
    return n > 0 ? `stopped watching that feed` : `couldn't find that feed`;
  },
});

registerTool('list_feeds', {
  category: 'feeds',
  description: 'List the RSS feeds this server is watching',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const feeds = listFeeds(guild.id);
    if (feeds.length === 0) return 'not watching any feeds';
    return `watched feeds:\n${feeds.map(f => {
      const ch = guild.channels.cache.get(f.channelId);
      return `#${f.id} ${f.name} → ${ch ? `#${ch.name}` : 'unknown'}`;
    }).join('\n')}`;
  },
});

// ── create_role_menu (dropdown) ─────────────────────────────────────────

registerTool('create_role_menu', {
  category: 'role',
  description: 'Post a dropdown menu members can use to self-assign roles. Provide options as a list of {label, role, emoji?, description?}. Members pick from the dropdown to toggle those roles.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to post the menu in' },
      title: { type: 'string', description: 'Embed title' },
      description: { type: 'string', description: 'Embed description / instructions' },
      placeholder: { type: 'string', description: 'Dropdown placeholder text' },
      multi: { type: 'boolean', description: 'Allow picking multiple roles at once (default true)' },
      options: {
        type: 'array',
        description: 'The role choices',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Option label' },
            role: { type: 'string', description: 'Role name' },
            emoji: { type: 'string', description: 'Optional emoji' },
            description: { type: 'string', description: 'Optional short description' },
          },
          required: ['label', 'role'],
        },
      },
    },
    required: ['channel', 'title', 'options'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    if (!Array.isArray(params.options) || params.options.length === 0) return 'give me at least one role option';

    const resolved = [];
    for (const opt of params.options) {
      const role = resolveRole(guild, opt.role);
      if (!role) return `couldn't find role "${opt.role}" — create it first or use an existing role`;
      resolved.push({ ...opt, roleId: role.id, roleName: role.name });
    }

    const menuId = saveRoleMenu(guild.id, resolved.map(r => r.roleId));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`doll_rolemenu:${menuId}`)
      .setPlaceholder(params.placeholder || 'Pick your roles…')
      .setMinValues(0)
      .setMaxValues(params.multi === false ? 1 : resolved.length);

    for (const r of resolved) {
      const opt = { label: r.label.substring(0, 100), value: r.roleId };
      if (r.description) opt.description = r.description.substring(0, 100);
      if (r.emoji) opt.emoji = r.emoji;
      select.addOptions(opt);
    }

    const embed = new EmbedBuilder()
      .setTitle(params.title)
      .setColor(getAccent(guild.id));
    if (params.description) embed.setDescription(params.description);

    const menuMsg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    recordBotMessage(guild, { channelId: ch.id, messageId: menuMsg.id, kind: 'role menu', title: params.title });
    return `posted the role menu "${params.title}" in #${ch.name} with ${resolved.length} roles`;
  },
});
