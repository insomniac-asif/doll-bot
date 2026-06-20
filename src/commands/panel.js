import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getConfig } from '../config.js';
import { ticketPanelComponents } from '../features/tickets.js';

export default {
  data: new SlashCommandBuilder().setName('panel').setDescription('Post an interactive panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('verify').setDescription('Post the verification panel')
      .addStringOption(o => o.setName('title').setDescription('Panel title'))
      .addStringOption(o => o.setName('description').setDescription('Panel text')))
    .addSubcommand(s => s.setName('ticket').setDescription('Post the ticket panel')
      .addStringOption(o => o.setName('title').setDescription('Panel title'))
      .addStringOption(o => o.setName('description').setDescription('Panel text'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    if (sub === 'verify') {
      if (!config.verification.enabled || !config.verification.role) {
        return interaction.reply({ content: 'Set up verification first with `/feature verification`.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(interaction.options.getString('title') || 'Verification')
        .setDescription(interaction.options.getString('description') || 'Click the button below to verify and gain access to the server.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('doll_verify').setLabel('Verify').setStyle(ButtonStyle.Success).setEmoji('✅')
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: 'Verification panel posted.', ephemeral: true });
    }

    if (sub === 'ticket') {
      const embed = new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle(interaction.options.getString('title') || 'Support Tickets')
        .setDescription(interaction.options.getString('description') || 'Need help? Click the button below to open a private ticket with staff.');
      await interaction.channel.send({ embeds: [embed], components: ticketPanelComponents() });
      return interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
    }
  },
};
