import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logAction, modActionEmbed } from '../features/logging.js';

const DURATIONS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export default {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a member')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(o =>
      o.setName('duration').setDescription('Duration').setRequired(true)
        .addChoices(
          { name: '5 minutes', value: '5m' },
          { name: '15 minutes', value: '15m' },
          { name: '30 minutes', value: '30m' },
          { name: '1 hour', value: '1h' },
          { name: '6 hours', value: '6h' },
          { name: '12 hours', value: '12h' },
          { name: '1 day', value: '1d' },
          { name: '7 days', value: '7d' },
        ))
    .addStringOption(o => o.setName('reason').setDescription('Reason for mute'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    if (!target.moderatable) return interaction.reply({ content: 'I cannot mute this user.', ephemeral: true });

    const ms = DURATIONS[duration];
    await target.timeout(ms, reason);

    await logAction(interaction.guild, modActionEmbed({
      action: 'mute',
      target: `${target.user.tag} (${target.user.id})`,
      moderator: interaction.user.tag,
      reason,
      extra: { Duration: duration },
    }));

    await interaction.reply(`**${target.user.tag}** has been muted for ${duration}. Reason: ${reason}`);
  },
};
