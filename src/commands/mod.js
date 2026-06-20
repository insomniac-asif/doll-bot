import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logAction, modActionEmbed } from '../features/logging.js';

const slowmode = {
  data: new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    await interaction.channel.setRateLimitPerUser(seconds);
    await interaction.reply(seconds === 0 ? 'Slowmode disabled.' : `Slowmode set to ${seconds}s.`);
  },
};

const lockdown = {
  data: new SlashCommandBuilder().setName('lockdown').setDescription('Lock the current channel')
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    await logAction(interaction.guild, modActionEmbed({
      action: 'clear', target: `#${interaction.channel.name}`, moderator: interaction.user.tag, reason: `Locked: ${reason}`,
    }));
    await interaction.reply(`🔒 Channel locked. ${reason}`);
  },
};

const unlock = {
  data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    await interaction.reply('🔓 Channel unlocked.');
  },
};

const unban = {
  data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID')
    .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    try {
      await interaction.guild.bans.remove(userId, reason);
    } catch {
      return interaction.reply({ content: 'Could not unban — is that user actually banned?', ephemeral: true });
    }
    await logAction(interaction.guild, modActionEmbed({
      action: 'unmute', target: userId, moderator: interaction.user.tag, reason,
    }));
    await interaction.reply(`Unbanned <@${userId}>. Reason: ${reason}`);
  },
};

const unmute = {
  data: new SlashCommandBuilder().setName('unmute').setDescription('Remove a member\'s timeout')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: 'User not found.', ephemeral: true });
    await member.timeout(null);
    await logAction(interaction.guild, modActionEmbed({
      action: 'unmute', target: `${member.user.tag} (${member.user.id})`, moderator: interaction.user.tag, reason: 'Timeout removed',
    }));
    await interaction.reply(`Unmuted ${member.user.tag}.`);
  },
};

export default [slowmode, lockdown, unlock, unban, unmute];
