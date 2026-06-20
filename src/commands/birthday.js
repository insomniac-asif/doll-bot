import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';
import { setBirthday, removeBirthday } from '../features/birthday.js';

export default {
  data: new SlashCommandBuilder().setName('birthday').setDescription('Birthday system')
    .addSubcommand(s => s.setName('set').setDescription('Set your birthday')
      .addIntegerOption(o => o.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
      .addIntegerOption(o => o.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove your birthday'))
    .addSubcommand(s => s.setName('list').setDescription('List upcoming birthdays'))
    .addSubcommand(s => s.setName('channel').setDescription('(Admin) Set the birthday announcement channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    if (sub === 'set') {
      const month = interaction.options.getInteger('month');
      const day = interaction.options.getInteger('day');
      setBirthday(interaction.guild.id, interaction.user.id, month, day);
      return interaction.reply({ content: `🎂 Birthday set to ${month}/${day}.`, ephemeral: true });
    }

    if (sub === 'remove') {
      removeBirthday(interaction.guild.id, interaction.user.id);
      return interaction.reply({ content: 'Birthday removed.', ephemeral: true });
    }

    if (sub === 'list') {
      const list = config.birthdays.list;
      const entries = Object.entries(list);
      if (!entries.length) return interaction.reply('No birthdays set yet.');
      const sorted = entries.sort((a, b) => (a[1].month - b[1].month) || (a[1].day - b[1].day));
      const lines = sorted.map(([id, d]) => `<@${id}> — ${d.month}/${d.day}`);
      const embed = new EmbedBuilder().setTitle('🎂 Birthdays').setColor(0xff69b4).setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'channel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'Administrators only.', ephemeral: true });
      }
      const channel = interaction.options.getChannel('channel');
      config.birthdays.channel = channel.id;
      updateConfig(interaction.guild.id, { birthdays: config.birthdays });
      return interaction.reply({ content: `Birthday announcements will post in <#${channel.id}>.`, ephemeral: true });
    }
  },
};
