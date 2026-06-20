import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getConfig, updateConfig } from '../config.js';
import { listPersonalities } from '../features/personality.js';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or edit server configuration')
    .addSubcommand(sub =>
      sub.setName('view').setDescription('View current configuration'))
    .addSubcommand(sub =>
      sub.setName('ai_channel').setDescription('Add/remove an AI chat channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to toggle').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('welcome_message').setDescription('Set welcome message (use {user}, {server}, {count})')
        .addStringOption(o => o.setName('message').setDescription('Welcome message template').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('leave_message').setDescription('Set leave message (use {user}, {server})')
        .addStringOption(o => o.setName('message').setDescription('Leave message template').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('automod').setDescription('Toggle auto-moderation')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setTitle(`Doll Config — ${interaction.guild.name}`)
        .setColor(0x7c3aed)
        .addFields(
          { name: 'Log Channel', value: config.logChannel ? `<#${config.logChannel}>` : 'Not set', inline: true },
          { name: 'Welcome Channel', value: config.welcomeChannel ? `<#${config.welcomeChannel}>` : 'Not set', inline: true },
          { name: 'Auto-Role', value: config.autoRole ? `<@&${config.autoRole}>` : 'Not set', inline: true },
          { name: 'Mod Roles', value: config.modRoles.length ? config.modRoles.map(r => `<@&${r}>`).join(', ') : 'None', inline: true },
          { name: 'Personality', value: config.personality, inline: true },
          { name: 'AutoMod', value: config.automod.enabled ? `Enabled (${config.automod.level})` : 'Disabled', inline: true },
          { name: 'AI Channels', value: config.aiChannels.length ? config.aiChannels.map(c => `<#${c}>`).join(', ') : 'Mention only' },
          { name: 'Welcome Message', value: config.welcomeMessage },
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'ai_channel') {
      const channel = interaction.options.getChannel('channel');
      const idx = config.aiChannels.indexOf(channel.id);
      if (idx >= 0) {
        config.aiChannels.splice(idx, 1);
        updateConfig(interaction.guild.id, { aiChannels: config.aiChannels });
        return interaction.reply({ content: `Removed <#${channel.id}> from AI channels.`, ephemeral: true });
      } else {
        config.aiChannels.push(channel.id);
        updateConfig(interaction.guild.id, { aiChannels: config.aiChannels });
        return interaction.reply({ content: `Added <#${channel.id}> as an AI channel. I'll respond to all messages there.`, ephemeral: true });
      }
    }

    if (sub === 'welcome_message') {
      const msg = interaction.options.getString('message');
      updateConfig(interaction.guild.id, { welcomeMessage: msg });
      return interaction.reply({ content: `Welcome message updated: ${msg}`, ephemeral: true });
    }

    if (sub === 'leave_message') {
      const msg = interaction.options.getString('message');
      updateConfig(interaction.guild.id, { leaveMessage: msg });
      return interaction.reply({ content: `Leave message updated: ${msg}`, ephemeral: true });
    }

    if (sub === 'automod') {
      const enabled = interaction.options.getBoolean('enabled');
      config.automod.enabled = enabled;
      updateConfig(interaction.guild.id, { automod: config.automod });
      return interaction.reply({ content: `Auto-moderation ${enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
    }
  },
};
