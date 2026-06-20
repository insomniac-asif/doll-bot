// Server-health digest tool — on-demand health read for owners/admins.

import { registerTool, PermLevel } from '../features/toolRegistry.js';
import { generateDigest } from '../features/digest.js';

registerTool('server_digest', {
  category: 'info',
  description: 'Generate a server health report — activity trends, busiest channels, members going quiet (churn risk), and a suggestion. Use when an owner/admin asks "how\'s my server doing" or "server health".',
  parameters: { type: 'object', properties: {} },
  permLevel: PermLevel.MOD,
  async execute(_params, { guild, channel }) {
    try {
      const embed = await generateDigest(guild);
      await channel.send({ embeds: [embed] });
      return 'posted the server health report above';
    } catch (e) {
      return `couldn't generate the digest: ${e.message}`;
    }
  },
});
