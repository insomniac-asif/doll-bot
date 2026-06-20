import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getVoiceTime, voiceLeaderboard, formatDuration } from '../features/voiceTracking.js';

const vctime = {
  data: new SlashCommandBuilder().setName('vctime').setDescription('Show voice channel time')
    .addUserOption(o => o.setName('user').setDescription('User (default you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const seconds = getVoiceTime(interaction.guild.id, user.id);
    await interaction.reply(`🔊 <@${user.id}> has spent **${formatDuration(seconds)}** in voice.`);
  },
};

const vcleaderboard = {
  data: new SlashCommandBuilder().setName('vcleaderboard').setDescription('Voice time leaderboard'),
  async execute(interaction) {
    const top = voiceLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('No voice activity tracked yet.');
    const lines = top.map(u => `**${u.position}.** <@${u.id}> — ${formatDuration(u.seconds)}`);
    const embed = new EmbedBuilder().setTitle('🔊 Voice Leaderboard').setColor(0x1abc9c).setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed] });
  },
};

export default [vctime, vcleaderboard];
