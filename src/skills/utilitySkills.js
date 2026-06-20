// Utility tools — pin/unpin, emoji management, translate.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel } from '../features/resolvers.js';

// ── pin_message ─────────────────────────────────────────────────────────

registerTool('pin_message', {
  category: 'utility',
  description: 'Pin a message by its ID in a channel',
  parameters: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Message ID to pin' },
      channel: { type: 'string', description: 'Channel (defaults to current)' },
    },
    required: ['message_id'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;

    try {
      const msg = await ch.messages.fetch(params.message_id);
      await msg.pin();
      return `pinned message by ${msg.author?.username || 'unknown'} in #${ch.name}`;
    } catch {
      return `couldn't find or pin that message`;
    }
  },
});

// ── unpin_message ───────────────────────────────────────────────────────

registerTool('unpin_message', {
  category: 'utility',
  description: 'Unpin a message by its ID',
  parameters: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Message ID to unpin' },
      channel: { type: 'string', description: 'Channel (defaults to current)' },
    },
    required: ['message_id'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch) return `couldn't find channel "${params.channel}"`;

    try {
      const msg = await ch.messages.fetch(params.message_id);
      await msg.unpin();
      return `unpinned message in #${ch.name}`;
    } catch {
      return `couldn't find or unpin that message`;
    }
  },
});

// ── add_emoji ───────────────────────────────────────────────────────────

registerTool('add_emoji', {
  category: 'utility',
  description: 'Add a custom emoji to the server from a URL',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Emoji name (no spaces or special chars)' },
      url: { type: 'string', description: 'Image URL for the emoji' },
    },
    required: ['name', 'url'],
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { guild }) {
    const safeName = params.name.replace(/[^a-zA-Z0-9_]/g, '_');
    try {
      const emoji = await guild.emojis.create({ attachment: params.url, name: safeName });
      return `added emoji :${emoji.name}: to the server`;
    } catch (e) {
      return `couldn't add emoji: ${e.message}`;
    }
  },
});

// ── remove_emoji ────────────────────────────────────────────────────────

registerTool('remove_emoji', {
  category: 'utility',
  description: 'Remove a custom emoji from the server',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Emoji name to remove' } },
    required: ['name'],
  },
  permLevel: PermLevel.OWNER,
  async execute(params, { guild }) {
    const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === params.name.toLowerCase());
    if (!emoji) return `couldn't find emoji "${params.name}"`;
    const emojiName = emoji.name;
    await emoji.delete('Removed via AI');
    return `removed emoji :${emojiName}:`;
  },
});

// ── list_emojis ─────────────────────────────────────────────────────────

registerTool('list_emojis', {
  category: 'utility',
  description: 'List all custom emojis in the server',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const emojis = guild.emojis.cache;
    if (emojis.size === 0) return 'this server has no custom emojis';

    const statics = emojis.filter(e => !e.animated);
    const animated = emojis.filter(e => e.animated);

    const lines = [`${emojis.size} custom emojis (${statics.size} static, ${animated.size} animated):`];

    if (statics.size > 0) {
      lines.push(`static: ${statics.map(e => `:${e.name}:`).join(' ')}`);
    }
    if (animated.size > 0) {
      lines.push(`animated: ${animated.map(e => `:${e.name}:`).join(' ')}`);
    }

    return lines.join('\n');
  },
});

// ── translate ───────────────────────────────────────────────────────────

registerTool('translate', {
  category: 'utility',
  description: 'Translate text to another language using AI',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to translate' },
      to: { type: 'string', description: 'Target language (e.g. "spanish", "japanese", "french"). Default: english' },
    },
    required: ['text'],
  },
  permLevel: PermLevel.READ,
  async execute(params) {
    const target = params.to || 'english';
    // Use Mistral for a quick translation
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: [
            { role: 'system', content: `You are a translator. Translate the following text to ${target}. Return ONLY the translation, nothing else.` },
            { role: 'user', content: params.text },
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });
      const data = await res.json();
      const translation = data.choices?.[0]?.message?.content || 'translation failed';
      return `(${target}) ${translation}`;
    } catch {
      return 'translation failed — API error';
    }
  },
});
