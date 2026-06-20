import { handleLeave } from '../features/welcome.js';
import { logAction, memberEmbed } from '../features/logging.js';

export default {
  name: 'guildMemberRemove',
  async execute(member) {
    await handleLeave(member);
    await logAction(member.guild, memberEmbed({ type: 'leave', member }));
  },
};
