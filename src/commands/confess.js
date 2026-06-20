import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';

export default {
  data: new SlashCommandBuilder().setName('confess').setDescription('Send an anonymous confession')
    .addStringOption(o => o.setName('message').setDescription('Your confession').setRequired(true)),
  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    if (!config.confessions.channel) {
      return interaction.reply({ content: 'Confessions are not set up. An admin must run `/feature confessions` first.', ephemeral: true });
    }
    const channel = await interaction.guild.channels.fetch(config.confessions.channel).catch(() => null);
    if (!channel) return interaction.reply({ content: 'The confession channel no longer exists.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('Anonymous Confession')
      .setDescription(interaction.options.getString('message'))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Your confession has been posted anonymously.', ephemeral: true });
  },
};
