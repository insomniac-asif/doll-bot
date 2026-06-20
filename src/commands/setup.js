import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getConfig, saveConfig } from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up Doll for this server')
    .addChannelOption(o =>
      o.setName('log_channel').setDescription('Channel for mod logs')
        .addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o =>
      o.setName('welcome_channel').setDescription('Channel for welcome/leave messages')
        .addChannelTypes(ChannelType.GuildText))
    .addRoleOption(o =>
      o.setName('mod_role').setDescription('Role that can use mod commands'))
    .addRoleOption(o =>
      o.setName('auto_role').setDescription('Role auto-assigned to new members'))
    .addStringOption(o =>
      o.setName('personality').setDescription('Bot personality')
        .addChoices(
          { name: 'Default', value: 'default' },
          { name: 'Cutesy (sanrio/pink/soft)', value: 'cutesy' },
          { name: 'Professional', value: 'professional' },
          { name: 'Casual', value: 'casual' },
          { name: 'Fun', value: 'fun' },
          { name: 'Strict', value: 'strict' },
        ))
    .addStringOption(o =>
      o.setName('automod_level').setDescription('Auto-moderation sensitivity')
        .addChoices(
          { name: 'Strict (catches more)', value: 'strict' },
          { name: 'Moderate (balanced)', value: 'moderate' },
          { name: 'Lenient (fewer flags)', value: 'lenient' },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    const changes = [];

    const logChannel = interaction.options.getChannel('log_channel');
    if (logChannel) { config.logChannel = logChannel.id; changes.push(`Log channel: <#${logChannel.id}>`); }

    const welcomeChannel = interaction.options.getChannel('welcome_channel');
    if (welcomeChannel) { config.welcomeChannel = welcomeChannel.id; changes.push(`Welcome channel: <#${welcomeChannel.id}>`); }

    const modRole = interaction.options.getRole('mod_role');
    if (modRole) {
      if (!config.modRoles.includes(modRole.id)) config.modRoles.push(modRole.id);
      changes.push(`Mod role: @${modRole.name}`);
    }

    const autoRole = interaction.options.getRole('auto_role');
    if (autoRole) { config.autoRole = autoRole.id; changes.push(`Auto-role: @${autoRole.name}`); }

    const personality = interaction.options.getString('personality');
    if (personality) { config.personality = personality; changes.push(`Personality: ${personality}`); }

    const automodLevel = interaction.options.getString('automod_level');
    if (automodLevel) { config.automod.level = automodLevel; changes.push(`AutoMod level: ${automodLevel}`); }

    saveConfig(interaction.guild.id, config);

    if (changes.length === 0) {
      await interaction.reply({ content: 'No changes specified. Use the options to configure Doll for this server.', ephemeral: true });
    } else {
      await interaction.reply({
        content: `**Doll configured for ${interaction.guild.name}:**\n${changes.map(c => `• ${c}`).join('\n')}`,
        ephemeral: true,
      });
    }
  },
};
