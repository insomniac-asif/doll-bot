import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getConfig, updateConfig, getAccent } from '../config.js';
import { getBalance, addBalance } from '../features/economy.js';
import { getStore, saveStore } from '../store.js';

const shopCmd = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Browse and buy from the server shop 🛍️')
    .addSubcommand(s => s.setName('view').setDescription('See what\'s for sale'))
    .addSubcommand(s => s.setName('buy').setDescription('Buy an item')
      .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)))
    .addSubcommand(s => s.setName('add').setDescription('(Admin) Add a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1))
      .addRoleOption(o => o.setName('role').setDescription('Role granted on purchase (optional)'))
      .addStringOption(o => o.setName('description').setDescription('Short description')))
    .addSubcommand(s => s.setName('remove').setDescription('(Admin) Remove a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);
    const cur = config.economy.currency;

    if (sub === 'view') {
      if (!config.shop.length) return interaction.reply('the shop is empty right now 🎀');
      const embed = new EmbedBuilder()
        .setColor(getAccent(interaction.guild.id))
        .setTitle('🛍️ Server Shop')
        .setDescription(config.shop.map(i =>
          `**${i.name}** — ${i.price} ${cur}${i.roleId ? ` (role)` : ''}${i.description ? `\n*${i.description}*` : ''}`
        ).join('\n\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'buy') {
      const name = interaction.options.getString('item');
      const item = config.shop.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (!item) return interaction.reply({ content: 'no item by that name 🥺', ephemeral: true });
      if (getBalance(interaction.guild.id, interaction.user.id) < item.price) {
        return interaction.reply({ content: `you need ${item.price} ${cur} for that.`, ephemeral: true });
      }
      addBalance(interaction.guild.id, interaction.user.id, -item.price);

      if (item.roleId) {
        try { await interaction.member.roles.add(item.roleId); } catch { /* perms */ }
      } else {
        const inv = getStore('inventory', interaction.guild.id, { users: {} });
        if (!inv.users[interaction.user.id]) inv.users[interaction.user.id] = {};
        inv.users[interaction.user.id][item.name] = (inv.users[interaction.user.id][item.name] || 0) + 1;
        saveStore('inventory', interaction.guild.id, inv);
      }
      return interaction.reply(`you bought **${item.name}**! 🌸`);
    }

    // Admin subcommands
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'manage-server permission required.', ephemeral: true });
    }

    if (sub === 'add') {
      const item = {
        name: interaction.options.getString('name'),
        price: interaction.options.getInteger('price'),
        roleId: interaction.options.getRole('role')?.id || null,
        description: interaction.options.getString('description') || null,
      };
      config.shop.push(item);
      updateConfig(interaction.guild.id, { shop: config.shop });
      return interaction.reply({ content: `added **${item.name}** to the shop.`, ephemeral: true });
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name');
      const before = config.shop.length;
      config.shop = config.shop.filter(i => i.name.toLowerCase() !== name.toLowerCase());
      if (config.shop.length === before) return interaction.reply({ content: 'no item by that name.', ephemeral: true });
      updateConfig(interaction.guild.id, { shop: config.shop });
      return interaction.reply({ content: `removed **${name}**.`, ephemeral: true });
    }
  },
};

const inventoryCmd = {
  data: new SlashCommandBuilder().setName('inventory').setDescription('View your purchased items 🎁'),
  async execute(interaction) {
    const inv = getStore('inventory', interaction.guild.id, { users: {} }).users[interaction.user.id];
    if (!inv || !Object.keys(inv).length) return interaction.reply({ content: 'your inventory is empty 🎀', ephemeral: true });
    const lines = Object.entries(inv).map(([name, count]) => `**${name}** ×${count}`);
    const embed = new EmbedBuilder().setColor(getAccent(interaction.guild.id)).setTitle('🎁 Your Inventory').setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default [shopCmd, inventoryCmd];
