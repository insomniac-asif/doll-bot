import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAccent } from '../config.js';
import { setUser, getUser, nowPlaying } from '../features/lastfm.js';

export default {
  data: new SlashCommandBuilder().setName('fm').setDescription('Last.fm now-playing')
    .addSubcommand(s => s.setName('set').setDescription('Link your Last.fm username')
      .addStringOption(o => o.setName('username').setDescription('Your Last.fm username').setRequired(true)))
    .addSubcommand(s => s.setName('np').setDescription('Show what you\'re listening to')
      .addUserOption(o => o.setName('user').setDescription('Whose music? (default you)'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      setUser(interaction.guild.id, interaction.user.id, interaction.options.getString('username'));
      return interaction.reply({ content: `linked your Last.fm 🎶`, ephemeral: true });
    }

    if (sub === 'np') {
      const user = interaction.options.getUser('user') || interaction.user;
      const lastfmUser = getUser(interaction.guild.id, user.id);
      if (!lastfmUser) {
        return interaction.reply({ content: `${user.id === interaction.user.id ? 'you haven\'t' : 'they haven\'t'} linked a Last.fm yet (\`/fm set\`).`, ephemeral: true });
      }
      await interaction.deferReply();
      const np = await nowPlaying(lastfmUser);
      if (np.error) return interaction.editReply(np.error);
      const embed = new EmbedBuilder()
        .setColor(getAccent(interaction.guild.id))
        .setAuthor({ name: `${user.username} ${np.nowPlaying ? 'is now playing' : 'last played'}`, iconURL: user.displayAvatarURL() })
        .setTitle(np.name)
        .setURL(np.url)
        .setDescription(`by **${np.artist}**${np.album ? `\non *${np.album}*` : ''}`);
      if (np.image) embed.setThumbnail(np.image);
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
