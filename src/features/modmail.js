// ModMail — bridges member DMs to a private staff channel and relays staff
// replies back to the member's DMs. Sessions are global (DMs aren't guild-scoped).

import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../config.js';
import { getGlobal, saveGlobal } from '../store.js';
import { getAccent } from '../config.js';

function state() { return getGlobal('modmail', { sessions: {}, channels: {} }); }
function save(s) { saveGlobal('modmail', s); }

// Is this guild channel an open modmail thread? Returns the member's user id.
export function modmailUserForChannel(channelId) {
  return state().channels[channelId] || null;
}

// Find guilds where this user can open modmail.
function eligibleGuilds(client, userId) {
  const out = [];
  for (const guild of client.guilds.cache.values()) {
    const cfg = getConfig(guild.id);
    if (cfg.modmail?.enabled && cfg.modmail.category && guild.members.cache.has(userId)) {
      out.push(guild);
    }
  }
  return out;
}

async function openSession(guild, user, firstContent) {
  const cfg = getConfig(guild.id);
  const category = await guild.channels.fetch(cfg.modmail.category).catch(() => null);

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  if (cfg.modmail.staffRole) {
    overwrites.push({ id: cfg.modmail.staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  const channel = await guild.channels.create({
    name: `mail-${user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: category && category.type === ChannelType.GuildCategory ? category.id : undefined,
    permissionOverwrites: overwrites,
  });

  const member = await guild.members.fetch(user.id).catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(getAccent(guild.id))
    .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL?.() })
    .setTitle('New ModMail')
    .setDescription(firstContent || '*(no message)*')
    .addFields(
      { name: 'Member since', value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'unknown', inline: true },
      { name: 'Reply', value: 'just type in this channel — i\'ll DM it to them. use `close` to end.', inline: false },
    )
    .setTimestamp();
  await channel.send({ content: cfg.modmail.staffRole ? `<@&${cfg.modmail.staffRole}>` : '', embeds: [embed] });

  const s = state();
  s.sessions[user.id] = { guildId: guild.id, channelId: channel.id };
  s.channels[channel.id] = user.id;
  save(s);
  return channel;
}

// Handle an incoming DM from a member.
export async function handleModmailDM(message, client) {
  if (message.author.bot || message.guild) return false;
  const userId = message.author.id;
  const s = state();
  const existing = s.sessions[userId];

  // Active session → relay to the staff channel
  if (existing) {
    const guild = client.guilds.cache.get(existing.guildId);
    const channel = guild ? await guild.channels.fetch(existing.channelId).catch(() => null) : null;
    if (!channel) { delete s.sessions[userId]; save(s); return false; }
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || '*(attachment)*');
    if (message.attachments.size) embed.addFields({ name: 'Attachment', value: message.attachments.first().url });
    await channel.send({ embeds: [embed] }).catch(() => {});
    await message.react('📨').catch(() => {});
    return true;
  }

  // No session — open one in the (first) eligible guild
  const guilds = eligibleGuilds(client, userId);
  if (guilds.length === 0) return false; // modmail not available; let other DM handlers run
  const guild = guilds[0];
  try {
    await openSession(guild, message.author, message.content);
    await message.reply(`📨 thanks — i've passed this to the **${guild.name}** staff team. they'll reply here.`).catch(() => {});
    return true;
  } catch (e) {
    console.error('[ModMail] open failed:', e.message);
    return false;
  }
}

// Handle a staff message typed in a modmail channel → DM it to the member.
export async function handleModmailStaffReply(message) {
  const userId = modmailUserForChannel(message.channel.id);
  if (!userId) return false;
  if (message.author.bot) return false;

  // "close" ends the session
  if (message.content.trim().toLowerCase() === 'close') {
    await closeSession(message.client, message.channel.id, message.author);
    return true;
  }

  const user = await message.client.users.fetch(userId).catch(() => null);
  if (user) {
    const embed = new EmbedBuilder()
      .setColor(getAccent(message.guild.id))
      .setAuthor({ name: `${message.member?.displayName || message.author.username} (staff)`, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || '*(attachment)*');
    await user.send({ embeds: [embed] }).catch(async () => {
      await message.channel.send('⚠️ couldn\'t DM them — their DMs may be closed.').catch(() => {});
    });
    await message.react('✅').catch(() => {});
  }
  return true;
}

export async function closeSession(client, channelId, staff) {
  const s = state();
  const userId = s.channels[channelId];
  if (userId) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) await user.send('📪 your conversation with staff has been closed. message again any time to reopen.').catch(() => {});
    delete s.sessions[userId];
  }
  delete s.channels[channelId];
  save(s);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.send(`closed by ${staff?.username || 'staff'}. archiving in 5s…`).catch(() => {});
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
}
