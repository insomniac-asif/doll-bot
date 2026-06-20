// Voice management tools — disconnect, move members between VCs.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { resolveMemberFetch, resolveChannel } from '../features/resolvers.js';

// ── disconnect_from_vc ──────────────────────────────────────────────────

registerTool('disconnect_from_vc', {
  category: 'voice',
  description: 'Disconnect a member from their voice channel',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to disconnect' },
      reason: { type: 'string', description: 'Reason' },
    },
    required: ['user'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    if (!target.voice.channel) return `${target.displayName} isn't in a voice channel`;

    const vcName = target.voice.channel.name;
    await target.voice.disconnect(params.reason || 'Disconnected via AI');
    return `disconnected ${target.displayName} from #${vcName}`;
  },
});

// ── move_to_vc ──────────────────────────────────────────────────────────

registerTool('move_to_vc', {
  category: 'voice',
  description: 'Move a member to a different voice channel',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Member to move' },
      channel: { type: 'string', description: 'Voice channel to move them to' },
    },
    required: ['user', 'channel'],
  },
  permLevel: PermLevel.MOD,
  async execute(params, { guild }) {
    const target = await resolveMemberFetch(guild, params.user);
    if (!target) return `couldn't find member "${params.user}"`;
    if (!target.voice.channel) return `${target.displayName} isn't in a voice channel`;

    const vc = resolveChannel(guild, params.channel);
    if (!vc) return `couldn't find voice channel "${params.channel}"`;

    await target.voice.setChannel(vc, params.reason || 'Moved via AI');
    return `moved ${target.displayName} to #${vc.name}`;
  },
});
