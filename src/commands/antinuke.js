import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';

export default {
  data: new SlashCommandBuilder().setName('antinuke').setDescription('Raid / mass-action protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('enable').setDescription('Enable anti-nuke'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable anti-nuke'))
    .addSubcommand(s => s.setName('punish').setDescription('Set what happens when tripped')
      .addStringOption(o => o.setName('mode').setDescription('Action').setRequired(true).addChoices(
        { name: 'Strip roles + timeout', value: 'strip' },
        { name: 'Alert only', value: 'none' },
      )))
    .addSubcommand(s => s.setName('whitelist').setDescription('Allow a trusted user to bypass anti-nuke')
      .addUserOption(o => o.setName('user').setDescription('User to whitelist').setRequired(true)))
    .addSubcommand(s => s.setName('unwhitelist').setDescription('Remove a user from the whitelist')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('Show anti-nuke settings')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    if (sub === 'enable') {
      config.antinuke.enabled = true;
      updateConfig(interaction.guild.id, { antinuke: config.antinuke });
      const me = interaction.guild.members.me;
      const warn = me?.permissions.has(PermissionFlagsBits.ViewAuditLog) ? '' : '\n⚠️ I need **View Audit Log** permission to detect who performs actions.';
      return interaction.reply({ content: `Anti-nuke **enabled** (punish: ${config.antinuke.punish}).${warn}`, ephemeral: true });
    }

    if (sub === 'disable') {
      config.antinuke.enabled = false;
      updateConfig(interaction.guild.id, { antinuke: config.antinuke });
      return interaction.reply({ content: 'Anti-nuke **disabled**.', ephemeral: true });
    }

    if (sub === 'punish') {
      config.antinuke.punish = interaction.options.getString('mode');
      updateConfig(interaction.guild.id, { antinuke: config.antinuke });
      return interaction.reply({ content: `Anti-nuke punishment set to **${config.antinuke.punish}**.`, ephemeral: true });
    }

    if (sub === 'whitelist') {
      const user = interaction.options.getUser('user');
      if (!config.antinuke.whitelist.includes(user.id)) config.antinuke.whitelist.push(user.id);
      updateConfig(interaction.guild.id, { antinuke: config.antinuke });
      return interaction.reply({ content: `<@${user.id}> is now whitelisted from anti-nuke.`, ephemeral: true });
    }

    if (sub === 'unwhitelist') {
      const user = interaction.options.getUser('user');
      config.antinuke.whitelist = config.antinuke.whitelist.filter(id => id !== user.id);
      updateConfig(interaction.guild.id, { antinuke: config.antinuke });
      return interaction.reply({ content: `<@${user.id}> removed from the whitelist.`, ephemeral: true });
    }

    if (sub === 'status') {
      const a = config.antinuke;
      const embed = new EmbedBuilder()
        .setColor(a.enabled ? 0x2ecc71 : 0x95a5a6)
        .setTitle('🛡️ Anti-Nuke')
        .addFields(
          { name: 'Status', value: a.enabled ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Punish', value: a.punish, inline: true },
          { name: 'Window', value: `${a.windowSec}s`, inline: true },
          { name: 'Thresholds', value: `Channel deletes: ${a.thresholds.channelDelete}\nRole deletes: ${a.thresholds.roleDelete}\nBans: ${a.thresholds.ban}` },
          { name: 'Whitelist', value: a.whitelist.length ? a.whitelist.map(id => `<@${id}>`).join(', ') : 'None' },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
