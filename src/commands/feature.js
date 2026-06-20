import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';

export default {
  data: new SlashCommandBuilder().setName('feature').setDescription('Configure Doll feature systems')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('verification').setDescription('Configure verification')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable verification').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role granted on verify'))
      .addChannelOption(o => o.setName('channel').setDescription('Verification channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('tickets').setDescription('Configure tickets')
      .addChannelOption(o => o.setName('category').setDescription('Category for ticket channels').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName('staff_role').setDescription('Staff role added to tickets')))
    .addSubcommand(s => s.setName('starboard').setDescription('Configure starboard')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable starboard').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Starboard channel').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName('threshold').setDescription('Stars needed (default 3)').setMinValue(1))
      .addStringOption(o => o.setName('emoji').setDescription('Star emoji (default ⭐)')))
    .addSubcommand(s => s.setName('tempvoice').setDescription('Configure join-to-create voice')
      .addChannelOption(o => o.setName('hub').setDescription('Hub voice channel members join to create').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
      .addChannelOption(o => o.setName('category').setDescription('Category for created channels').addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(s => s.setName('confessions').setDescription('Configure confessions')
      .addChannelOption(o => o.setName('channel').setDescription('Confession channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('leveling').setDescription('Configure leveling')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable leveling').setRequired(true))
      .addChannelOption(o => o.setName('announce_channel').setDescription('Level-up announce channel').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName('xp_per_message').setDescription('XP per message (default 15)').setMinValue(1)))
    .addSubcommand(s => s.setName('owner_alert').setDescription('Set the channel where Doll forwards problems for owner/admin attention')
      .addChannelOption(o => o.setName('channel').setDescription('Alert channel').addChannelTypes(ChannelType.GuildText).setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    if (sub === 'verification') {
      config.verification.enabled = interaction.options.getBoolean('enabled');
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');
      if (role) config.verification.role = role.id;
      if (channel) config.verification.channel = channel.id;
      updateConfig(interaction.guild.id, { verification: config.verification });
      return interaction.reply({ content: `Verification ${config.verification.enabled ? 'enabled' : 'disabled'}. Use \`/panel verify\` to post the button.`, ephemeral: true });
    }

    if (sub === 'tickets') {
      const category = interaction.options.getChannel('category');
      const staffRole = interaction.options.getRole('staff_role');
      if (category) config.tickets.category = category.id;
      if (staffRole) config.tickets.staffRole = staffRole.id;
      updateConfig(interaction.guild.id, { tickets: config.tickets });
      return interaction.reply({ content: 'Tickets configured. Use `/panel ticket` to post the panel.', ephemeral: true });
    }

    if (sub === 'starboard') {
      config.starboard.enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');
      const threshold = interaction.options.getInteger('threshold');
      const emoji = interaction.options.getString('emoji');
      if (channel) config.starboard.channel = channel.id;
      if (threshold) config.starboard.threshold = threshold;
      if (emoji) config.starboard.emoji = emoji;
      updateConfig(interaction.guild.id, { starboard: config.starboard });
      return interaction.reply({ content: `Starboard ${config.starboard.enabled ? 'enabled' : 'disabled'} (${config.starboard.emoji} x${config.starboard.threshold}).`, ephemeral: true });
    }

    if (sub === 'tempvoice') {
      config.tempVoice.hub = interaction.options.getChannel('hub').id;
      const category = interaction.options.getChannel('category');
      if (category) config.tempVoice.category = category.id;
      updateConfig(interaction.guild.id, { tempVoice: config.tempVoice });
      return interaction.reply({ content: 'Join-to-create voice configured.', ephemeral: true });
    }

    if (sub === 'confessions') {
      config.confessions.channel = interaction.options.getChannel('channel').id;
      updateConfig(interaction.guild.id, { confessions: config.confessions });
      return interaction.reply({ content: 'Confession channel set.', ephemeral: true });
    }

    if (sub === 'leveling') {
      config.leveling.enabled = interaction.options.getBoolean('enabled');
      const ch = interaction.options.getChannel('announce_channel');
      const xp = interaction.options.getInteger('xp_per_message');
      if (ch) config.leveling.announceChannel = ch.id;
      if (xp) config.leveling.xpPerMessage = xp;
      updateConfig(interaction.guild.id, { leveling: config.leveling });
      return interaction.reply({ content: `Leveling ${config.leveling.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
    }

    if (sub === 'owner_alert') {
      config.ownerAlert.channel = interaction.options.getChannel('channel').id;
      updateConfig(interaction.guild.id, { ownerAlert: config.ownerAlert });
      return interaction.reply({ content: `Owner alerts will post in <#${config.ownerAlert.channel}> (and DM the owner).`, ephemeral: true });
    }
  },
};
