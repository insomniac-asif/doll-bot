import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logAction, modActionEmbed } from '../features/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk delete messages')
    .addIntegerOption(o =>
      o.setName('count').setDescription('Number of messages to delete (1-100)').setRequired(true)
        .setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const count = interaction.options.getInteger('count');

    const deleted = await interaction.channel.bulkDelete(count, true);

    await logAction(interaction.guild, modActionEmbed({
      action: 'clear',
      target: `#${interaction.channel.name}`,
      moderator: interaction.user.tag,
      reason: `Bulk deleted ${deleted.size} message(s)`,
    }));

    await interaction.reply({ content: `Deleted ${deleted.size} message(s).`, ephemeral: true });
  },
};
