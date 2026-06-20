import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const eightBall = {
  data: new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8-ball')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  async execute(interaction) {
    const answers = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Ask again later.',
      'Cannot predict now.', 'Don\'t count on it.', 'My reply is no.', 'Very doubtful.', 'Outlook not so good.'];
    await interaction.reply(`🎱 **Question:** ${interaction.options.getString('question')}\n**Answer:** ${pick(answers)}`);
  },
};

const coinflip = {
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
  async execute(interaction) {
    await interaction.reply(`🪙 The coin landed on **${pick(['Heads', 'Tails'])}**!`);
  },
};

const roll = {
  data: new SlashCommandBuilder().setName('roll').setDescription('Roll a die')
    .addIntegerOption(o => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(1000)),
  async execute(interaction) {
    const sides = interaction.options.getInteger('sides') || 6;
    await interaction.reply(`🎲 You rolled a **${Math.floor(Math.random() * sides) + 1}** (d${sides}).`);
  },
};

const ship = {
  data: new SlashCommandBuilder().setName('ship').setDescription('Calculate compatibility between two users')
    .addUserOption(o => o.setName('user1').setDescription('First user').setRequired(true))
    .addUserOption(o => o.setName('user2').setDescription('Second user').setRequired(true)),
  async execute(interaction) {
    const a = interaction.options.getUser('user1');
    const b = interaction.options.getUser('user2');
    const seed = (BigInt(a.id) + BigInt(b.id)) % 101n;
    const pct = Number(seed);
    await interaction.reply(`💘 **${a.username}** + **${b.username}** = **${pct}%** compatible!`);
  },
};

const roast = {
  data: new SlashCommandBuilder().setName('roast').setDescription('Playfully roast someone')
    .addUserOption(o => o.setName('user').setDescription('Who to roast').setRequired(true)),
  async execute(interaction) {
    const roasts = [
      'is the reason the gene pool needs a lifeguard.',
      'has the charisma of a wet paper towel.',
      'brings everyone so much joy... when they leave the room.',
      'is proof that even mistakes can be lovable.',
      'is like a software update — nobody asked, but here you are.',
    ];
    await interaction.reply(`🔥 <@${interaction.options.getUser('user').id}> ${pick(roasts)}`);
  },
};

const compliment = {
  data: new SlashCommandBuilder().setName('compliment').setDescription('Compliment someone')
    .addUserOption(o => o.setName('user').setDescription('Who to compliment').setRequired(true)),
  async execute(interaction) {
    const lines = [
      'you light up every channel you\'re in.',
      'your vibe is genuinely unmatched.',
      'the server is better with you in it.',
      'you\'re sharper than you give yourself credit for.',
      'you make this place feel like home.',
    ];
    await interaction.reply(`💖 <@${interaction.options.getUser('user').id}> ${pick(lines)}`);
  },
};

const avatar = {
  data: new SlashCommandBuilder().setName('avatar').setDescription('Show a user\'s avatar')
    .addUserOption(o => o.setName('user').setDescription('User (default you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder().setTitle(`${user.username}'s avatar`)
      .setImage(user.displayAvatarURL({ size: 1024 })).setColor(0x7c3aed);
    await interaction.reply({ embeds: [embed] });
  },
};

const userinfo = {
  data: new SlashCommandBuilder().setName('userinfo').setDescription('Show info about a user')
    .addUserOption(o => o.setName('user').setDescription('User (default you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const embed = new EmbedBuilder().setTitle(user.tag).setThumbnail(user.displayAvatarURL())
      .setColor(0x7c3aed)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      );
    if (member) {
      embed.addFields(
        { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
        { name: 'Roles', value: member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(' ') || 'None' },
      );
    }
    await interaction.reply({ embeds: [embed] });
  },
};

const serverinfo = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show info about this server'),
  async execute(interaction) {
    const g = interaction.guild;
    const embed = new EmbedBuilder().setTitle(g.name).setThumbnail(g.iconURL() || null).setColor(0x7c3aed)
      .addFields(
        { name: 'Members', value: String(g.memberCount), inline: true },
        { name: 'Channels', value: String(g.channels.cache.size), inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};

export default [eightBall, coinflip, roll, ship, roast, compliment, avatar, userinfo, serverinfo];
