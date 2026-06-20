import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const LETTERS = ['🇦', '🇧', '🇨', '🇩', '🇪'];

export default {
  data: new SlashCommandBuilder().setName('poll').setDescription('Create a reaction poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option A').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option B').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option C'))
    .addStringOption(o => o.setName('option4').setDescription('Option D'))
    .addStringOption(o => o.setName('option5').setDescription('Option E')),
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const options = ['option1', 'option2', 'option3', 'option4', 'option5']
      .map(o => interaction.options.getString(o))
      .filter(Boolean);

    const desc = options.map((opt, i) => `${LETTERS[i]} ${opt}`).join('\n\n');
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription(desc)
      .setColor(0x3498db)
      .setFooter({ text: `Poll by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();
    for (let i = 0; i < options.length; i++) {
      await msg.react(LETTERS[i]);
    }
  },
};
