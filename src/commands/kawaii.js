import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAccent } from '../config.js';
import { fetchNeko, ACTIONS, MOODS, IMAGES } from '../features/kawaii.js';

function makeAction({ name, category, verb }) {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(`${verb[0].toUpperCase() + verb.slice(1)} someone 🎀`)
      .addUserOption(o => o.setName('user').setDescription('Who?').setRequired(true)),
    async execute(interaction) {
      const target = interaction.options.getUser('user');
      await interaction.deferReply();
      try {
        const { url, source } = await fetchNeko(category);
        const who = target.id === interaction.user.id ? 'themselves' : `<@${target.id}>`;
        const embed = new EmbedBuilder()
          .setColor(getAccent(interaction.guild.id))
          .setDescription(`<@${interaction.user.id}> ${verb} ${who} 🌸`)
          .setImage(url);
        if (source) embed.setFooter({ text: source });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply('couldn\'t fetch a cute gif right now, try again in a sec 🥺');
      }
    },
  };
}

function makeMood({ name, category, verb }) {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(`Show that you ${verb} 🎀`),
    async execute(interaction) {
      await interaction.deferReply();
      try {
        const { url, source } = await fetchNeko(category);
        const embed = new EmbedBuilder()
          .setColor(getAccent(interaction.guild.id))
          .setDescription(`<@${interaction.user.id}> ${verb} 🌸`)
          .setImage(url);
        if (source) embed.setFooter({ text: source });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply('couldn\'t fetch a cute gif right now, try again in a sec 🥺');
      }
    },
  };
}

function makeImage({ name, category, label }) {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(`Get a picture of ${label} 🎀`),
    async execute(interaction) {
      await interaction.deferReply();
      try {
        const { url, source } = await fetchNeko(category);
        const embed = new EmbedBuilder()
          .setColor(getAccent(interaction.guild.id))
          .setImage(url);
        if (source) embed.setFooter({ text: source });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply('couldn\'t fetch an image right now, try again in a sec 🥺');
      }
    },
  };
}

export default [
  ...ACTIONS.map(makeAction),
  ...MOODS.map(makeMood),
  ...IMAGES.map(makeImage),
];
