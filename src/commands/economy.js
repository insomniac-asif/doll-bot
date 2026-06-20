import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getBalance, addBalance, transfer, claimDaily, leaderboard } from '../features/economy.js';

const balance = {
  data: new SlashCommandBuilder().setName('balance').setDescription('Check your balance')
    .addUserOption(o => o.setName('user').setDescription('User (default you)')),
  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    const user = interaction.options.getUser('user') || interaction.user;
    const bal = getBalance(interaction.guild.id, user.id);
    await interaction.reply(`💰 <@${user.id}> has **${bal} ${config.economy.currency}**.`);
  },
};

const daily = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),
  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    const res = claimDaily(interaction.guild.id, interaction.user.id, config.economy.dailyAmount);
    if (!res.ok) {
      const hours = Math.ceil(res.nextIn / 3600000);
      return interaction.reply({ content: `You already claimed your daily. Come back in ~${hours}h.`, ephemeral: true });
    }
    await interaction.reply(`✅ You claimed **${config.economy.dailyAmount} ${config.economy.currency}**! Balance: ${res.balance}.`);
  },
};

const pay = {
  data: new SlashCommandBuilder().setName('pay').setDescription('Give coins to another member')
    .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (target.id === interaction.user.id) return interaction.reply({ content: 'You can\'t pay yourself.', ephemeral: true });
    if (target.bot) return interaction.reply({ content: 'You can\'t pay a bot.', ephemeral: true });
    const res = transfer(interaction.guild.id, interaction.user.id, target.id, amount);
    if (!res.ok) return interaction.reply({ content: 'You don\'t have enough to do that.', ephemeral: true });
    await interaction.reply(`💸 <@${interaction.user.id}> paid <@${target.id}> **${amount} ${config.economy.currency}**.`);
  },
};

const ecoLeaderboard = {
  data: new SlashCommandBuilder().setName('richest').setDescription('Show the wealth leaderboard'),
  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    const top = leaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('No balances yet.');
    const lines = top.map(u => `**${u.position}.** <@${u.id}> — ${u.balance} ${config.economy.currency}`);
    const embed = new EmbedBuilder().setTitle('💰 Richest Members').setColor(0x2ecc71).setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed] });
  },
};

const give = {
  data: new SlashCommandBuilder().setName('give-coins').setDescription('(Admin) Grant coins to a user')
    .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true))
    .setDefaultMemberPermissions(0),
  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Administrators only.', ephemeral: true });
    }
    const config = getConfig(interaction.guild.id);
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const bal = addBalance(interaction.guild.id, target.id, amount);
    await interaction.reply(`Granted **${amount} ${config.economy.currency}** to <@${target.id}>. New balance: ${bal}.`);
  },
};

export default [balance, daily, pay, ecoLeaderboard, give];
