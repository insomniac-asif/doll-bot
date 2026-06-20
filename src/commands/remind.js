import { SlashCommandBuilder } from 'discord.js';
import { addReminder, parseDuration } from '../features/reminders.js';

export default {
  data: new SlashCommandBuilder().setName('remind').setDescription('Set a reminder')
    .addStringOption(o => o.setName('when').setDescription('e.g. 10m, 2h30m, 1d').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('What to remind you about').setRequired(true)),
  async execute(interaction) {
    const when = interaction.options.getString('when');
    const text = interaction.options.getString('text');
    const ms = parseDuration(when);
    if (!ms || ms < 5000) {
      return interaction.reply({ content: 'Invalid duration. Use formats like `10m`, `2h30m`, `1d`.', ephemeral: true });
    }
    const fireAt = Date.now() + ms;
    addReminder({
      userId: interaction.user.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      text,
      fireAt,
    });
    await interaction.reply(`⏰ I'll remind you <t:${Math.floor(fireAt / 1000)}:R>: ${text}`);
  },
};
