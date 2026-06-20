// Visual tools — AI image generation (free) for posts, server icon, emojis.

import { AttachmentBuilder } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel } from '../features/resolvers.js';
import { generateImageBuffer } from '../features/visual.js';

registerTool('generate_image', {
  category: 'utility',
  description: 'Generate an AI image from a text description (free, no cost). Can post it in a channel, set it as the server icon, or turn it into a custom emoji. Use for "make a banner", "generate a cute icon", "create an emoji of a pink bunny", etc.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'What to generate (be descriptive)' },
      purpose: { type: 'string', enum: ['post', 'server_icon', 'emoji'], description: 'post (default), server_icon, or emoji' },
      emoji_name: { type: 'string', description: 'Name for the emoji (if purpose=emoji)' },
      channel: { type: 'string', description: 'Channel to post in (if purpose=post)' },
    },
    required: ['prompt'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, channel }) {
    const purpose = params.purpose || 'post';
    const size = purpose === 'emoji' ? { w: 256, h: 256 } : { w: 1024, h: 1024 };
    const buf = await generateImageBuffer(params.prompt, size);
    if (!buf) return `couldn't generate that image right now — try again in a sec`;

    if (purpose === 'server_icon') {
      try { await guild.setIcon(buf, 'AI-generated via Doll'); return `set the server icon to a fresh AI image of "${params.prompt}" 🎀`; }
      catch (e) { return `couldn't set the icon: ${e.message}`; }
    }
    if (purpose === 'emoji') {
      const name = (params.emoji_name || params.prompt).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30) || 'doll_emoji';
      try { const e = await guild.emojis.create({ attachment: buf, name }); return `made a new emoji :${e.name}: from "${params.prompt}"`; }
      catch (e) { return `couldn't make the emoji: ${e.message} (it might be too big — emojis must be under 256kb)`; }
    }
    // post
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    const file = new AttachmentBuilder(buf, { name: 'doll-art.png' });
    try { await ch.send({ content: `🎨 "${params.prompt}"`, files: [file] }); return `posted a fresh AI image of "${params.prompt}" in #${ch.name}`; }
    catch (e) { return `couldn't post it: ${e.message}`; }
  },
});
