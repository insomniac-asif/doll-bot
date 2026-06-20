import { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getConfig } from '../config.js';
import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

export function ticketPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('doll_ticket_open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    ),
  ];
}

export function ticketCloseComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('doll_ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    ),
  ];
}

export async function handleTicketButton(interaction) {
  if (interaction.customId !== 'doll_ticket_open' && interaction.customId !== 'doll_ticket_close') return false;
  if (!isEnabled(interaction.guild.id, 'tickets')) {
    await interaction.reply({ content: 'tickets are turned off on this server.', ephemeral: true });
    return true;
  }
  if (interaction.customId === 'doll_ticket_open') return openTicket(interaction);
  if (interaction.customId === 'doll_ticket_close') return closeTicket(interaction);
  return false;
}

async function openTicket(interaction) {
  const config = getConfig(interaction.guild.id);
  const store = getStore('tickets', interaction.guild.id, { open: {}, counter: 0 });

  // One open ticket per user
  const existing = Object.entries(store.open).find(([, t]) => t.userId === interaction.user.id);
  if (existing) {
    await interaction.reply({ content: `You already have an open ticket: <#${existing[0]}>`, ephemeral: true });
    return true;
  }

  store.counter += 1;
  const num = store.counter;

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (config.tickets.staffRole) {
    overwrites.push({ id: config.tickets.staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${num}`,
    type: ChannelType.GuildText,
    parent: config.tickets.category || null,
    permissionOverwrites: overwrites,
  });

  store.open[channel.id] = { userId: interaction.user.id, num };
  saveStore('tickets', interaction.guild.id, store);

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`Ticket #${num}`)
    .setDescription(`Thanks <@${interaction.user.id}>, a staff member will be with you shortly.\nUse the button below to close this ticket.`);

  const staffPing = config.tickets.staffRole ? `<@&${config.tickets.staffRole}>` : '';
  await channel.send({ content: `${staffPing} <@${interaction.user.id}>`, embeds: [embed], components: ticketCloseComponents() });
  await interaction.reply({ content: `Your ticket has been created: <#${channel.id}>`, ephemeral: true });
  return true;
}

async function closeTicket(interaction) {
  const store = getStore('tickets', interaction.guild.id, { open: {}, counter: 0 });
  const ticket = store.open[interaction.channel.id];
  if (!ticket) {
    await interaction.reply({ content: 'This is not an open ticket channel.', ephemeral: true });
    return true;
  }

  await interaction.reply({ content: 'Closing this ticket in 5 seconds...' });
  delete store.open[interaction.channel.id];
  saveStore('tickets', interaction.guild.id, store);
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  return true;
}
