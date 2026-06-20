// Scheduling tools — scheduled/recurring messages + native Discord events + timezone.

import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveChannel } from '../features/resolvers.js';
import { getConfig, updateConfig } from '../config.js';
import {
  parseSchedule, describeSchedule, addScheduled, listScheduled, removeScheduled,
} from '../features/scheduling.js';

// ── schedule_message ────────────────────────────────────────────────────

registerTool('schedule_message', {
  category: 'schedule',
  description: 'Schedule a message to post later or on a repeating schedule. Timing examples: "in 2 hours", "tomorrow at 9am", "every day at 9am", "every monday at 8pm", "every hour", "every 30m".',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel to post in (defaults to current)' },
      content: { type: 'string', description: 'The message text to post' },
      when: { type: 'string', description: 'When/how often to post (e.g. "every day at 9am")' },
    },
    required: ['content', 'when'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild, channel, member }) {
    const ch = params.channel ? resolveChannel(guild, params.channel) : channel;
    if (!ch?.isTextBased?.()) return `couldn't find a text channel "${params.channel}"`;

    const tzOffset = getConfig(guild.id).tzOffset || 0;
    const parsed = parseSchedule(params.when, tzOffset);
    if (parsed.error) return parsed.error;

    const item = addScheduled(guild.id, {
      channelId: ch.id, content: params.content, schedule: parsed.schedule, createdBy: member.id,
    });
    return `scheduled message #${item.id} in #${ch.name} — ${describeSchedule(parsed.schedule, tzOffset)}. first post <t:${Math.floor(parsed.schedule.nextRun / 1000)}:R>`;
  },
});

// ── list_scheduled ──────────────────────────────────────────────────────

registerTool('list_scheduled', {
  category: 'schedule',
  description: 'List scheduled and recurring messages for this server',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.MOD,
  async execute(_params, { guild }) {
    const items = listScheduled(guild.id);
    if (items.length === 0) return 'no scheduled messages';
    const tzOffset = getConfig(guild.id).tzOffset || 0;
    const lines = items.map(i => {
      const ch = guild.channels.cache.get(i.channelId);
      return `#${i.id} → ${ch ? `#${ch.name}` : 'unknown'}: "${i.content.substring(0, 50)}" — ${describeSchedule(i, tzOffset)}`;
    });
    return `scheduled messages:\n${lines.join('\n')}`;
  },
});

// ── cancel_scheduled ────────────────────────────────────────────────────

registerTool('cancel_scheduled', {
  category: 'schedule',
  description: 'Cancel a scheduled/recurring message by its number',
  parameters: {
    type: 'object',
    properties: { id: { type: 'number', description: 'Scheduled message number (from list_scheduled)' } },
    required: ['id'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const removed = removeScheduled(guild.id, params.id);
    return removed > 0 ? `cancelled scheduled message #${params.id}` : `couldn't find scheduled message #${params.id}`;
  },
});

// ── set_timezone ────────────────────────────────────────────────────────

const TZ_ALIASES = { utc: 0, gmt: 0, est: -5, edt: -4, cst: -6, cdt: -5, mst: -7, mdt: -6, pst: -8, pdt: -7, bst: 1, cet: 1, ist: 5.5, aest: 10 };

registerTool('set_timezone', {
  category: 'schedule',
  description: 'Set the server\'s timezone so scheduled messages fire at the right local time. Accepts a UTC offset number (e.g. -5) or an abbreviation (EST, PST, GMT, CET, etc.).',
  parameters: {
    type: 'object',
    properties: { zone: { type: 'string', description: 'UTC offset (e.g. "-5") or abbreviation (e.g. "EST")' } },
    required: ['zone'],
  },
  permLevel: PermLevel.ADMIN,
  async execute(params, { guild }) {
    const z = params.zone.toLowerCase().trim();
    let offset = TZ_ALIASES[z];
    if (offset === undefined) {
      const num = parseFloat(z.replace('utc', '').replace('gmt', '').replace('+', ''));
      if (!Number.isNaN(num) && num >= -12 && num <= 14) offset = num;
    }
    if (offset === undefined) return `i don't recognize "${params.zone}". use a UTC offset like -5 or an abbreviation like EST`;
    updateConfig(guild.id, { tzOffset: offset });
    return `set this server's timezone to UTC${offset >= 0 ? '+' : ''}${offset}. scheduled times now use that`;
  },
});

// ── create_event ────────────────────────────────────────────────────────

registerTool('create_event', {
  category: 'schedule',
  description: 'Create a native Discord scheduled event. Members can mark interested and get reminders. Use for community events, game nights, streams, etc.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Event name' },
      when: { type: 'string', description: 'When it starts (e.g. "tomorrow at 8pm", "in 3 days at 7pm")' },
      description: { type: 'string', description: 'Event description' },
      channel: { type: 'string', description: 'Voice/stage channel to host it in (optional — omit for an external event)' },
      location: { type: 'string', description: 'External location/URL if not in a voice channel' },
    },
    required: ['name', 'when'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const tzOffset = getConfig(guild.id).tzOffset || 0;
    const parsed = parseSchedule(params.when, tzOffset);
    if (parsed.error) return parsed.error;
    const start = parsed.schedule.nextRun;
    if (start <= Date.now() + 60000) return 'pick a start time at least a minute in the future';

    const opts = {
      name: params.name,
      scheduledStartTime: new Date(start),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      description: params.description || undefined,
    };

    const vc = params.channel ? resolveChannel(guild, params.channel) : null;
    if (vc && (vc.type === 2 || vc.type === 13)) {
      opts.entityType = GuildScheduledEventEntityType.Voice;
      opts.channel = vc.id;
    } else {
      opts.entityType = GuildScheduledEventEntityType.External;
      opts.scheduledEndTime = new Date(start + 2 * 3600000); // external events need an end
      opts.entityMetadata = { location: params.location || 'See announcement' };
    }

    try {
      const event = await guild.scheduledEvents.create(opts);
      return `created event **${event.name}** starting <t:${Math.floor(start / 1000)}:F>. members can hit "Interested" to get reminded`;
    } catch (e) {
      return `couldn't create the event: ${e.message}`;
    }
  },
});

// ── list_events ─────────────────────────────────────────────────────────

registerTool('list_events', {
  category: 'schedule',
  description: 'List upcoming scheduled Discord events',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.READ,
  async execute(_params, { guild }) {
    const events = await guild.scheduledEvents.fetch();
    if (events.size === 0) return 'no upcoming events';
    const lines = events.map(e => `**${e.name}** — <t:${Math.floor(e.scheduledStartTimestamp / 1000)}:F> (${e.userCount ?? 0} interested)`);
    return `upcoming events:\n${lines.join('\n')}`;
  },
});

// ── cancel_event ────────────────────────────────────────────────────────

registerTool('cancel_event', {
  category: 'schedule',
  description: 'Cancel a scheduled Discord event by name',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Event name to cancel' } },
    required: ['name'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const events = await guild.scheduledEvents.fetch();
    const ev = events.find(e => e.name.toLowerCase().includes(params.name.toLowerCase()));
    if (!ev) return `couldn't find an event matching "${params.name}"`;
    await ev.delete();
    return `cancelled event "${ev.name}"`;
  },
});
