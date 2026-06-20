import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createGiveaway, endGiveaway, rerollGiveaway } from '../features/giveaways.js';
import { parseDuration } from '../features/reminders.js';

const start = {
  data: new SlashCommandBuilder().setName('giveaway').setDescription('Manage giveaways')
    .addSubcommand(s => s.setName('start').setDescription('Start a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('What to give away').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('e.g. 1h, 30m, 1d').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(20)))
    .addSubcommand(s => s.setName('end').setDescription('End a giveaway now')
      .addStringOption(o => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
    .addSubcommand(s => s.setName('reroll').setDescription('Reroll a giveaway winner')
      .addStringOption(o => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prize');
      const duration = interaction.options.getString('duration');
      const winners = interaction.options.getInteger('winners') || 1;
      const ms = parseDuration(duration);
      if (!ms || ms < 10000) return interaction.reply({ content: 'Invalid duration. Use `30m`, `1h`, `1d`.', ephemeral: true });
      await createGiveaway(interaction.channel, { prize, winners, durationMs: ms, hostId: interaction.user.id });
      return interaction.reply({ content: 'Giveaway started! 🎉', ephemeral: true });
    }

    if (sub === 'end') {
      const id = interaction.options.getString('message_id');
      const winnerIds = await endGiveaway(interaction.client, interaction.guild.id, id);
      if (winnerIds === null) return interaction.reply({ content: 'Could not find that giveaway.', ephemeral: true });
      return interaction.reply({ content: 'Giveaway ended.', ephemeral: true });
    }

    if (sub === 'reroll') {
      const id = interaction.options.getString('message_id');
      const winnerIds = await rerollGiveaway(interaction.client, interaction.guild.id, id);
      if (winnerIds === null) return interaction.reply({ content: 'Could not find that giveaway.', ephemeral: true });
      if (!winnerIds.length) return interaction.reply({ content: 'No entries to reroll.', ephemeral: true });
      return interaction.reply({ content: 'Rerolled!', ephemeral: true });
    }
  },
};

export default start;
