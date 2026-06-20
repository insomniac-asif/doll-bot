import { handleVerifyButton } from '../features/verification.js';
import { handleTicketButton } from '../features/tickets.js';
import { handleApprovalButton } from '../features/approvals.js';
import { handleConfirmationButton } from '../features/confirmations.js';
import { handleApplicationButton } from '../features/applications.js';
import { handleRoleMenuSelect } from '../features/roleMenus.js';
import { isEnabled } from '../features/featureToggle.js';

// Slash command → module. Commands not listed are always available.
const COMMAND_MODULE = {
  // music
  play: 'music', skip: 'music', stop: 'music', pause: 'music', resume: 'music', queue: 'music', np: 'music', volume: 'music',
  // leveling
  rank: 'leveling', level: 'leveling', leaderboard: 'leveling',
  // economy
  balance: 'economy', daily: 'economy', pay: 'economy', richest: 'economy', 'give-coins': 'economy', shop: 'economy', inventory: 'economy',
  // games / fun
  hunt: 'games', zoo: 'games', sell: 'games', battle: 'games',
  '8ball': 'fun', coinflip: 'fun', roll: 'fun', ship: 'fun', roast: 'fun', compliment: 'fun',
  // kawaii (anime reactions)
  hug: 'kawaii', pat: 'kawaii', cuddle: 'kawaii', kiss: 'kawaii', poke: 'kawaii', tickle: 'kawaii', highfive: 'kawaii',
  handhold: 'kawaii', feed: 'kawaii', bonk: 'kawaii', slap: 'kawaii', bite: 'kawaii', wave: 'kawaii', peck: 'kawaii',
  blush: 'kawaii', cry: 'kawaii', happy: 'kawaii', dance: 'kawaii', pout: 'kawaii', smug: 'kawaii',
  neko: 'kawaii', waifu: 'kawaii', kitsune: 'kawaii',
  // misc
  giveaway: 'giveaways', confess: 'confessions', birthday: 'birthdays',
  vctime: 'voiceTracking', vcleaderboard: 'voiceTracking', social: 'social', afk: 'afk',
};

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // Dropdown (select-menu) role pickers
    if (interaction.isStringSelectMenu?.()) {
      try {
        if (await handleRoleMenuSelect(interaction)) return;
      } catch (e) {
        console.error('[Interaction] Select error:', e.message);
      }
      return;
    }

    // Button interactions (confirmations, approvals, applications, verification, tickets)
    if (interaction.isButton()) {
      try {
        if (await handleConfirmationButton(interaction)) return;
        if (await handleApprovalButton(interaction)) return;
        if (await handleApplicationButton(interaction)) return;
        if (await handleVerifyButton(interaction)) return;
        if (await handleTicketButton(interaction)) return;
      } catch (e) {
        console.error('[Interaction] Button error:', e.message);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      return;
    }

    // Feature gate — block commands whose module is turned off for this guild
    const moduleKey = COMMAND_MODULE[interaction.commandName];
    if (moduleKey && interaction.guild && !isEnabled(interaction.guild.id, moduleKey)) {
      await interaction.reply({ content: `that feature is turned off on this server.`, ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (e) {
      console.error(`[Command] Error in /${interaction.commandName}:`, e);
      const msg = { content: 'Something went wrong executing that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  },
};
