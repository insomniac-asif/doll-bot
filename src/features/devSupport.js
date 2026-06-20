// Developer support bridge. Any server owner/admin can send a ticket to the bot
// developer (you, OWNER_ID) via Doll — she DMs you the details. You reply back
// through Doll's DMs ("reply 3 fixed it!") and she relays it live to that
// server's owner. A real support channel built into the bot.

import { EmbedBuilder } from 'discord.js';
import { getGlobal, saveGlobal } from '../store.js';
import { getConfig } from '../config.js';

function state() { return getGlobal('devtickets', { tickets: [], nextId: 1 }); }
function save(s) { saveGlobal('devtickets', s); }

export function listTickets(openOnly = false) {
  const t = state().tickets;
  return openOnly ? t.filter(x => x.status === 'open') : t;
}

// A server owner/admin opens a ticket → DM the developer.
export async function createTicket(client, guild, requester, subject, message) {
  const s = state();
  const ticket = {
    id: s.nextId++,
    guildId: guild.id,
    guildName: guild.name,
    requesterId: requester.id,
    requesterTag: requester.user?.tag || requester.tag || requester.displayName,
    subject: subject || 'Support request',
    message,
    status: 'open',
    at: Date.now(),
  };
  s.tickets.push(ticket);
  save(s);

  const ownerId = process.env.OWNER_ID;
  if (ownerId) {
    try {
      const dev = await client.users.fetch(ownerId);
      const embed = new EmbedBuilder()
        .setTitle(`🎫 Dev ticket #${ticket.id}`)
        .setColor(0xffb3d9)
        .setDescription(message.substring(0, 2000))
        .addFields(
          { name: 'From', value: `${ticket.requesterTag}`, inline: true },
          { name: 'Server', value: `${guild.name}`, inline: true },
          { name: 'Subject', value: subject || 'Support request', inline: false },
        )
        .setFooter({ text: `reply in this DM with:  reply ${ticket.id} <your message>` })
        .setTimestamp();
      await dev.send({ embeds: [embed] });
    } catch (e) {
      console.error('[DevSupport] DM to developer failed:', e.message);
    }
  }
  return ticket;
}

// Handle a DM FROM the developer (OWNER_ID): relay replies, list tickets.
// Returns true if it was a dev command (so modmail doesn't also handle it).
export async function handleDevReply(message, client) {
  if (message.author.id !== process.env.OWNER_ID || message.guild) return false;
  const content = message.content.trim();

  // list open tickets
  if (/^(tickets?|list|inbox)\b/i.test(content)) {
    const open = listTickets(true);
    if (open.length === 0) { await message.reply('no open dev tickets 🎀'); return true; }
    const lines = open.map(t => `#${t.id} — ${t.guildName} (${t.requesterTag}): ${t.message.slice(0, 80)}`);
    await message.reply(`open tickets:\n${lines.join('\n')}\n\nreply with:  reply <id> <message>`);
    return true;
  }

  // reply <id> <message>
  const m = content.match(/^reply\s+#?(\d+)\s+([\s\S]+)/i);
  if (!m) return false; // not a dev command — let other handlers (none) run
  const id = Number(m[1]);
  const text = m[2].trim();
  const s = state();
  const ticket = s.tickets.find(t => t.id === id);
  if (!ticket) { await message.reply(`no ticket #${id}`); return true; }

  const guild = client.guilds.cache.get(ticket.guildId);
  let delivered = false;
  // DM the requester
  try {
    const user = await client.users.fetch(ticket.requesterId);
    const embed = new EmbedBuilder()
      .setTitle('💌 Message from the developer')
      .setColor(0x57f287)
      .setDescription(text)
      .setFooter({ text: `re: ticket #${id}${guild ? ` · ${guild.name}` : ''}` });
    await user.send({ embeds: [embed] });
    delivered = true;
  } catch { /* dms closed */ }
  // also post to the server's alert channel
  if (guild) {
    const cfg = getConfig(guild.id);
    if (cfg.ownerAlert?.channel) {
      const ch = await guild.channels.fetch(cfg.ownerAlert.channel).catch(() => null);
      if (ch?.isTextBased?.()) { await ch.send(`💌 **from the developer** (re: your request): ${text}`).catch(() => {}); delivered = true; }
    }
  }

  ticket.status = 'replied';
  save(s);
  await message.reply(delivered ? `relayed to ${ticket.requesterTag} (#${id}) ✅` : `couldn't reach them (DMs closed + no alert channel) — but ticket #${id} is marked replied`);
  return true;
}
