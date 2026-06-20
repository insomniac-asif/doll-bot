import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getAccent } from '../config.js';
import { getMemory, addMemory, clearMemory, getGuildMemory, addGuildMemory } from '../features/memory.js';

const remember = {
  data: new SlashCommandBuilder().setName('remember').setDescription('Teach Doll something to remember')
    .addStringOption(o => o.setName('fact').setDescription('What should Doll remember?').setRequired(true))
    .addUserOption(o => o.setName('about').setDescription('About a specific user? (default: server-wide)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const fact = interaction.options.getString('fact');
    const about = interaction.options.getUser('about');
    if (about) {
      addMemory(interaction.guild.id, about.id, fact);
      return interaction.reply({ content: `noted — i'll remember that about ${about.username}. 🎀`, ephemeral: true });
    }
    addGuildMemory(interaction.guild.id, fact);
    return interaction.reply({ content: `noted — i'll remember that about this server. 🎀`, ephemeral: true });
  },
};

const forget = {
  data: new SlashCommandBuilder().setName('forget').setDescription('Clear Doll\'s memory about a user')
    .addUserOption(o => o.setName('user').setDescription('Whose memory to clear').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    clearMemory(interaction.guild.id, interaction.options.getUser('user').id);
    return interaction.reply({ content: 'memory cleared for that user.', ephemeral: true });
  },
};

const memoryView = {
  data: new SlashCommandBuilder().setName('memory').setDescription('See what Doll remembers')
    .addUserOption(o => o.setName('about').setDescription('About a specific user? (default: server-wide)')),
  async execute(interaction) {
    const about = interaction.options.getUser('about');
    const embed = new EmbedBuilder().setColor(getAccent(interaction.guild.id));

    if (about) {
      const mem = getMemory(interaction.guild.id, about.id);
      embed.setTitle(`🧠 What I remember about ${about.username}`);
      embed.setDescription(mem.notes.length ? mem.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : '*nothing yet*');
    } else {
      const mem = getGuildMemory(interaction.guild.id);
      embed.setTitle('🧠 Server memory');
      embed.setDescription(mem.length ? mem.map((n, i) => `${i + 1}. ${n}`).join('\n') : '*nothing yet*');
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default [remember, forget, memoryView];
