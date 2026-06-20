import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logAction, modActionEmbed } from '../features/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: 'I cannot ban this user. They may have higher permissions than me.', ephemeral: true });

    await target.ban({ reason });

    await logAction(interaction.guild, modActionEmbed({
      action: 'ban',
      target: `${target.user.tag} (${target.user.id})`,
      moderator: interaction.user.tag,
      reason,
    }));

    await interaction.reply(`**${target.user.tag}** has been banned. Reason: ${reason}`);
  },
};
