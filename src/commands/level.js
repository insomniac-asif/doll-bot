import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getRank, getLeaderboard } from '../features/leveling.js';

const rank = {
  data: new SlashCommandBuilder().setName('rank').setDescription('Show your level and XP')
    .addUserOption(o => o.setName('user').setDescription('User (default you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const r = getRank(interaction.guild.id, user.id);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .addFields(
        { name: 'Level', value: String(r.level), inline: true },
        { name: 'Rank', value: `#${r.rank} / ${r.total}`, inline: true },
        { name: 'XP', value: `${r.into} / ${r.needed} (total ${r.xp})`, inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Show the XP leaderboard'),
  async execute(interaction) {
    const top = getLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('No one has earned XP yet.');
    const lines = top.map(u => `**${u.position}.** <@${u.id}> — Level ${u.level} (${u.xp} XP)`);
    const embed = new EmbedBuilder().setTitle('🏆 XP Leaderboard').setColor(0xf1c40f).setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed] });
  },
};

export default [rank, leaderboard];
