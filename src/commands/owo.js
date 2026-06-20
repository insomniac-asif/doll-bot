import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getConfig, getAccent } from '../config.js';
import { addBalance } from '../features/economy.js';
import { hunt, getZoo, sell, battle, tierEmoji, HUNT_COOLDOWN_MS } from '../features/owo.js';

const huntCmd = {
  data: new SlashCommandBuilder().setName('hunt').setDescription('Hunt for a cute critter 🐾'),
  async execute(interaction) {
    const res = hunt(interaction.guild.id, interaction.user.id);
    if (!res.ok) {
      return interaction.reply({ content: `slow down! you can hunt again in ${Math.ceil(res.remaining / 1000)}s 🥺`, ephemeral: true });
    }
    const c = res.critter;
    await interaction.reply(`${tierEmoji(c.tier)} <@${interaction.user.id}> found a ${c.emoji} **${c.name}**! *(${c.tier}, worth ${c.value})*`);
  },
};

const zooCmd = {
  data: new SlashCommandBuilder().setName('zoo').setDescription('View your critter collection 🌸')
    .addUserOption(o => o.setName('user').setDescription('Whose zoo? (default you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const zoo = getZoo(interaction.guild.id, user.id);
    if (!zoo.length) return interaction.reply(`${user.id === interaction.user.id ? 'your' : 'their'} zoo is empty — go \`/hunt\`! 🐰`);
    const lines = zoo.map(c => `${c.emoji} **${c.name}** ×${c.count} ${tierEmoji(c.tier)}`);
    const total = zoo.reduce((s, c) => s + c.value * c.count, 0);
    const embed = new EmbedBuilder()
      .setColor(getAccent(interaction.guild.id))
      .setTitle(`${user.username}'s Zoo 🎀`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Total value: ${total}` });
    await interaction.reply({ embeds: [embed] });
  },
};

const sellCmd = {
  data: new SlashCommandBuilder().setName('sell').setDescription('Sell critters for coins 💰')
    .addStringOption(o => o.setName('tier').setDescription('Which to sell').addChoices(
      { name: 'All', value: 'all' },
      { name: 'Common only', value: 'common' },
      { name: 'Uncommon only', value: 'uncommon' },
      { name: 'Rare only', value: 'rare' },
      { name: 'Epic only', value: 'epic' },
      { name: 'Mythic only', value: 'mythic' },
    )),
  async execute(interaction) {
    const tier = interaction.options.getString('tier') || 'all';
    const earned = sell(interaction.guild.id, interaction.user.id, tier);
    if (!earned) return interaction.reply({ content: 'nothing to sell there 🥺', ephemeral: true });
    const bal = addBalance(interaction.guild.id, interaction.user.id, earned);
    const cur = getConfig(interaction.guild.id).economy.currency;
    await interaction.reply(`sold for **${earned} ${cur}**! balance: ${bal} 🌸`);
  },
};

const battleCmd = {
  data: new SlashCommandBuilder().setName('battle').setDescription('Battle another member with your critters ⚔️')
    .addUserOption(o => o.setName('user').setDescription('Opponent').setRequired(true)),
  async execute(interaction) {
    const opp = interaction.options.getUser('user');
    if (opp.bot || opp.id === interaction.user.id) return interaction.reply({ content: 'pick a different opponent 🥺', ephemeral: true });
    const res = battle(interaction.guild.id, interaction.user.id, opp.id);
    if (!res.ok) return interaction.reply({ content: 'both of you need critters first — go `/hunt`! 🐾', ephemeral: true });
    const reward = 25;
    addBalance(interaction.guild.id, res.winner, reward);
    const cur = getConfig(interaction.guild.id).economy.currency;
    await interaction.reply(
      `⚔️ <@${interaction.user.id}> sent out ${res.ca.emoji} **${res.ca.name}** vs <@${opp.id}>'s ${res.cb.emoji} **${res.cb.name}**!\n` +
      `🏆 <@${res.winner}> wins and earns **${reward} ${cur}**!`
    );
  },
};

export default [huntCmd, zooCmd, sellCmd, battleCmd];
