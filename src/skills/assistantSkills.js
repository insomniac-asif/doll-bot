// AI assistant tools — catch-up summaries and announcement drafting.

import { EmbedBuilder } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel } from '../features/resolvers.js';
import { complete } from '../features/llm.js';
import { isEnabled } from '../features/featureToggle.js';
import { getAccent } from '../config.js';
import { recordBotMessage } from '../features/botMessages.js';

// ── catch_up ────────────────────────────────────────────────────────────
// Summarize what happened in a channel since the asker last spoke (or recent).

registerTool('catch_up', {
  category: 'assistant',
  description: 'Summarize what a user missed in a channel — catches them up on recent conversation. Use when someone asks "what did I miss" or "catch me up on #channel".',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to summarize (defaults to current channel)' },
      limit: { type: 'number', description: 'How many recent messages to scan (default 80, max 150)' },
    },
  },
  permLevel: PermLevel.READ,
  async execute(params, { guild, channel, member }) {
    if (!isEnabled(guild.id, 'catchup')) return 'catch-up summaries are turned off for this server';

    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;

    const limit = Math.min(150, Math.max(20, params.limit || 80));
    let fetched;
    try {
      fetched = await ch.messages.fetch({ limit });
    } catch {
      return `i can't read #${ch.name}`;
    }

    // Oldest → newest
    const ordered = [...fetched.values()].reverse();

    // Find where the asker last spoke; summarize everything after that.
    let startIdx = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].author.id === member.id) { startIdx = i + 1; break; }
    }
    let slice = ordered.slice(startIdx);
    if (slice.length < 5) slice = ordered.slice(-40); // they just got here / barely missed anything

    const transcript = slice
      .filter(m => m.content && !m.author.bot)
      .map(m => `${m.member?.displayName || m.author.username}: ${m.content.substring(0, 300)}`)
      .join('\n')
      .substring(0, 6000);

    if (!transcript.trim()) return `nothing much to catch up on in #${ch.name} — it's been quiet`;

    const summary = await complete(
      `You are Doll. Summarize this Discord conversation concisely for someone who was away. 3-6 short bullet points, plain language, name who said what when it matters. Skip greetings and noise. No preamble — just the bullets.`,
      `Conversation in #${ch.name}:\n\n${transcript}`,
      { maxTokens: 400, temperature: 0.4 },
    );

    return summary
      ? `here's what you missed in #${ch.name}:\n${summary}`
      : `couldn't summarize #${ch.name} right now`;
  },
});

// ── draft_rules ─────────────────────────────────────────────────────────

registerTool('draft_rules', {
  category: 'assistant',
  description: 'Draft a sample set of server rules and post them (or just show them for review). Use when the owner needs rules, asks for a sample rule sheet, or sets up a rules channel. Offer this proactively when a rules channel exists but is empty.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to post the rules in (optional — omit to just show a draft)' },
      vibe: { type: 'string', description: 'Tone/theme (e.g. "cute and friendly", "strict gaming", "chill")' },
      count: { type: 'number', description: 'How many rules (default 8)' },
    },
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, channel }) {
    const n = Math.min(15, Math.max(3, params.count || 8));
    const vibe = params.vibe || 'warm, friendly, and clear';
    const body = await complete(
      `You write Discord server rules. Tone: ${vibe}. Write exactly ${n} concise, numbered rules that cover the essentials (be respectful, no spam, no NSFW, no self-promo/ads, keep it on-topic, follow Discord ToS, listen to staff, no doxxing/harassment). Return ONLY the numbered list, one rule per line, no preamble. You may use light emoji.`,
      `Server: ${guild.name}`,
      { maxTokens: 500, temperature: 0.6 },
    );
    if (!body) return 'couldn\'t draft rules right now — try again in a sec';

    // Just a draft for review
    if (!params.channel) {
      return `here's a draft — say "post it in #rules" or tell me what to tweak:\n\n**${guild.name} — Rules**\n${body}`;
    }

    const ch = resolveChannel(guild, params.channel);
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;
    const embed = new EmbedBuilder().setTitle(`✿ ${guild.name} — Rules`).setDescription(body.substring(0, 4000)).setColor(getAccent(guild.id));
    const msg = await ch.send({ embeds: [embed] });
    recordBotMessage(guild, { channelId: ch.id, messageId: msg.id, kind: 'rules', title: 'Rules' });
    return `posted the rules in #${ch.name} — say "add a rule about X" or "change rule 3" and i'll edit them`;
  },
});

// ── draft_announcement ──────────────────────────────────────────────────
// Generate a polished announcement embed and post it (admin-gated).

registerTool('draft_announcement', {
  category: 'assistant',
  description: 'Write and post a polished announcement embed from a plain description. Use when an admin asks Doll to "announce" or "write an announcement" about something.',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'What the announcement is about (plain description of the details)' },
      channel: { type: 'string', description: 'Channel to post in (defaults to current channel)' },
      title: { type: 'string', description: 'Optional title; Doll writes one if omitted' },
      ping: { type: 'string', description: 'Optional: "everyone", "here", or a role name to ping' },
      tone: { type: 'string', description: 'Optional tone hint (e.g. "hype", "formal", "cozy")' },
    },
    required: ['topic'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild, channel }) {
    if (!isEnabled(guild.id, 'announcements')) return 'AI announcements are turned off for this server';

    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;

    const tone = params.tone || 'warm and clear';
    const generated = await complete(
      `You are Doll, writing a Discord server announcement. Tone: ${tone}. Return the announcement body only — no title, no "here's your announcement" preamble, no quotes. 1-3 short paragraphs. You may use light emoji and Discord markdown. Keep it genuine, not corporate.`,
      `Write an announcement about: ${params.topic}`,
      { maxTokens: 400, temperature: 0.7 },
    );
    if (!generated) return `couldn't draft that announcement right now`;

    // Title
    let title = params.title;
    if (!title) {
      title = await complete(
        `Write a short punchy announcement title (under 8 words). Return ONLY the title, no quotes, no preamble.`,
        params.topic,
        { maxTokens: 30, temperature: 0.6 },
      );
      title = (title || 'Announcement').replace(/^["']|["']$/g, '').trim().substring(0, 100);
    }

    const embed = new EmbedBuilder()
      .setTitle(`📢 ${title}`)
      .setDescription(generated.trim().substring(0, 4000))
      .setColor(getAccent(guild.id))
      .setTimestamp();

    // Resolve ping
    let content = '';
    if (params.ping) {
      const p = params.ping.toLowerCase();
      if (p === 'everyone') content = '@everyone';
      else if (p === 'here') content = '@here';
      else {
        const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(p) && r.id !== guild.id);
        if (role) content = `<@&${role.id}>`;
      }
    }

    let msg;
    try {
      msg = await ch.send({
        content: content || undefined,
        embeds: [embed],
        allowedMentions: { parse: ['everyone', 'roles'] },
      });
    } catch (e) {
      return `couldn't post in #${ch.name}: ${e.message}`;
    }
    recordBotMessage(guild, { channelId: ch.id, messageId: msg.id, kind: 'announcement', title });
    return `posted the announcement "${title}" in #${ch.name}${content ? ` (pinged ${params.ping})` : ''}`;
  },
});
