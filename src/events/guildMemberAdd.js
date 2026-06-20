import { handleWelcome, assignAutoRole } from '../features/welcome.js';
import { logAction, memberEmbed } from '../features/logging.js';
import { evaluateJoin } from '../features/rulesEngine.js';
import { trackJoin } from '../features/inviteTracking.js';
import { handleJoinRaid } from '../features/antiRaid.js';

export default {
  name: 'guildMemberAdd',
  async execute(member) {
    // Anti-raid checks first (burst detection + account-age gate)
    await handleJoinRaid(member).catch(e => console.error('[AntiRaid]', e.message));
    // Track which invite was used BEFORE other handlers (uses the cached counts)
    await trackJoin(member).catch(() => {});
    await handleWelcome(member);
    await assignAutoRole(member);
    await logAction(member.guild, memberEmbed({ type: 'join', member }));
    await evaluateJoin(member).catch(e => console.error('[Rules] join eval error:', e.message));
  },
};
