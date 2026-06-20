import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';

const PLATFORMS = [
  { name: 'Twitch (username)', value: 'twitch' },
  { name: 'YouTube (channel ID)', value: 'youtube' },
  { name: 'TikTok (username)', value: 'tiktok' },
];

export default {
  data: new SlashCommandBuilder().setName('social').setDescription('Manage live-stream notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('add').setDescription('Watch an account for going live')
      .addStringOption(o => o.setName('platform').setDescription('Platform').setRequired(true).addChoices(...PLATFORMS))
      .addStringOption(o => o.setName('target').setDescription('Username, or YouTube channel ID').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Where to post the alert').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to ping')))
    .addSubcommand(s => s.setName('remove').setDescription('Stop watching an account')
      .addStringOption(o => o.setName('platform').setDescription('Platform').setRequired(true).addChoices(...PLATFORMS))
      .addStringOption(o => o.setName('target').setDescription('Username/ID to remove').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List watched accounts')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    if (sub === 'add') {
      const platform = interaction.options.getString('platform');
      const target = interaction.options.getString('target');
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const list = config.social[platform];
      if (list.some(w => w.target.toLowerCase() === target.toLowerCase())) {
        return interaction.reply({ content: 'That account is already being watched.', ephemeral: true });
      }
      list.push({ target, announceChannel: channel.id, roleId: role?.id || null });
      updateConfig(interaction.guild.id, { social: config.social });
      return interaction.reply({ content: `Now watching **${target}** on ${platform}. Alerts → <#${channel.id}>${role ? ` pinging <@&${role.id}>` : ''}.`, ephemeral: true });
    }

    if (sub === 'remove') {
      const platform = interaction.options.getString('platform');
      const target = interaction.options.getString('target');
      const before = config.social[platform].length;
      config.social[platform] = config.social[platform].filter(w => w.target.toLowerCase() !== target.toLowerCase());
      if (config.social[platform].length === before) return interaction.reply({ content: 'That account wasn\'t being watched.', ephemeral: true });
      updateConfig(interaction.guild.id, { social: config.social });
      return interaction.reply({ content: `Stopped watching **${target}** on ${platform}.`, ephemeral: true });
    }

    if (sub === 'list') {
      const embed = new EmbedBuilder().setTitle('📡 Live Notifications').setColor(0x9146ff);
      for (const platform of ['twitch', 'youtube', 'tiktok']) {
        const list = config.social[platform];
        embed.addFields({
          name: platform[0].toUpperCase() + platform.slice(1),
          value: list.length ? list.map(w => `${w.target} → <#${w.announceChannel}>${w.roleId ? ` (<@&${w.roleId}>)` : ''}`).join('\n') : '*none*',
        });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
