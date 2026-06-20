import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as music from '../features/music.js';

function inVoice(interaction) {
  return interaction.member?.voice?.channel || null;
}

const play = {
  data: new SlashCommandBuilder().setName('play').setDescription('Play a song or add it to the queue')
    .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)),
  async execute(interaction) {
    const vc = inVoice(interaction);
    if (!vc) return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
    await interaction.deferReply();
    try {
      const res = await music.play(vc, interaction.channel, interaction.options.getString('query'), interaction.user.username);
      if (res.queued) return interaction.editReply(`Added to queue (#${res.position}): **${res.track.title}**`);
      return interaction.editReply(`Now playing: **${res.track.title}**`);
    } catch (e) {
      return interaction.editReply(`Couldn't play that: ${e.message}`);
    }
  },
};

const skip = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
  async execute(interaction) {
    if (!inVoice(interaction)) return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
    const ok = music.skip(interaction.guild.id);
    await interaction.reply(ok ? '⏭️ Skipped.' : 'Nothing is playing.');
  },
};

const stop = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
  async execute(interaction) {
    if (!inVoice(interaction)) return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
    music.stop(interaction.guild.id);
    await interaction.reply('⏹️ Stopped and cleared the queue.');
  },
};

const pause = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  async execute(interaction) {
    await interaction.reply(music.pause(interaction.guild.id) ? '⏸️ Paused.' : 'Nothing to pause.');
  },
};

const resume = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute(interaction) {
    await interaction.reply(music.resume(interaction.guild.id) ? '▶️ Resumed.' : 'Nothing to resume.');
  },
};

const queue = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the music queue'),
  async execute(interaction) {
    const { current, queue: q } = music.getQueue(interaction.guild.id);
    if (!current) return interaction.reply('The queue is empty.');
    const lines = q.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.title}`);
    const embed = new EmbedBuilder().setColor(0xc77dff).setTitle('Queue')
      .setDescription(`**Now:** ${current.title}\n\n${lines.join('\n') || '*Nothing queued*'}`);
    if (q.length > 10) embed.setFooter({ text: `+${q.length - 10} more` });
    await interaction.reply({ embeds: [embed] });
  },
};

const np = {
  data: new SlashCommandBuilder().setName('np').setDescription('Show the currently playing song'),
  async execute(interaction) {
    const info = music.nowPlaying(interaction.guild.id);
    if (!info) return interaction.reply('Nothing is playing.');
    const { track, elapsed } = info;
    await interaction.reply(`🎵 **${track.title}** — ${music.formatTime(elapsed)} / ${music.formatTime(track.durationSec)}`);
  },
};

const volume = {
  data: new SlashCommandBuilder().setName('volume').setDescription('Set playback volume (1-100)')
    .addIntegerOption(o => o.setName('level').setDescription('Volume 1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(interaction) {
    const v = music.setVolume(interaction.guild.id, interaction.options.getInteger('level'));
    await interaction.reply(`🔊 Volume set to ${v}%.`);
  },
};

export default [play, skip, stop, pause, resume, queue, np, volume];
