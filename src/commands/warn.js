import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';
import { logAction, modActionEmbed } from '../features/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (!target) return interaction.reply({ content: 'User not found.', ephemeral: true });

    const config = getConfig(interaction.guild.id);
    const warnings = config.warnings || {};
    warnings[target.id] = (warnings[target.id] || 0) + 1;
    updateConfig(interaction.guild.id, { warnings });

    const count = warnings[target.id];

    try {
      const dm = await target.createDM();
      await dm.send(`You have been warned in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: ${count}`);
    } catch {
      // DMs closed
    }

    await logAction(interaction.guild, modActionEmbed({
      action: 'warn',
      target: `${target.tag} (${target.id})`,
      moderator: interaction.user.tag,
      reason,
      extra: { 'Total Warnings': String(count) },
    }));

    await interaction.reply(`**${target.tag}** has been warned (${count} total). Reason: ${reason}`);
  },
};
