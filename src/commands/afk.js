import { SlashCommandBuilder } from 'discord.js';
import { setAfk } from '../features/afk.js';

export default {
  data: new SlashCommandBuilder().setName('afk').setDescription('Set your AFK status')
    .addStringOption(o => o.setName('reason').setDescription('Why are you AFK?')),
  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'AFK';
    setAfk(interaction.guild.id, interaction.user.id, reason);
    await interaction.reply({ content: `You're now AFK: ${reason}`, ephemeral: true });
  },
};
