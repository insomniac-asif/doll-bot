// Confirm-before-commit flow for high-impact actions. When a tool is marked
// confirm:true, Doll spells out EXACTLY what she's about to do and posts
// Confirm/Cancel buttons. The person who asked (not the owner) confirms.
// This is what makes destructive/permission changes safe and deliberate.

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTool } from './toolRegistry.js';
import { resolveIds } from './ai.js';

const pending = new Map(); // id -> { guildId, channelId, requesterId, toolName, params, createdAt }
let counter = 0;
const TTL_MS = 5 * 60 * 1000; // confirmations expire fast

function newId() {
  counter = (counter + 1) % 100000;
  return `${Date.now().toString(36)}${counter}`;
}

function prune() {
  const now = Date.now();
  for (const [id, c] of pending.entries()) if (now - c.createdAt > TTL_MS) pending.delete(id);
}

// Generic fallback preview when a tool doesn't supply its own.
export function defaultPreview(toolName, params) {
  const lines = Object.entries(params)
    .map(([k, v]) => `• **${k}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
  return `i'm about to run **${toolName}**${lines ? ` with:\n${lines}` : ''}.`;
}

/**
 * Post a confirmation prompt. Returns true if delivered.
 */
export async function requestConfirmation(channel, requester, tool, params, previewText) {
  prune();
  if (!channel?.isTextBased?.()) return false;

  const confirmation = {
    id: newId(),
    guildId: channel.guild.id,
    channelId: channel.id,
    requesterId: requester.id,
    toolName: tool.name,
    params,
    createdAt: Date.now(),
  };
  pending.set(confirmation.id, confirmation);

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Confirm this action')
    .setColor(0xf39c12)
    .setDescription(previewText.substring(0, 4000))
    .setFooter({ text: `${requester.displayName}, click Confirm to proceed or Cancel to stop.` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`doll_do:${confirmation.id}`).setLabel('Confirm').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`doll_no:${confirmation.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
  );

  try {
    await channel.send({ content: `<@${requester.id}>`, embeds: [embed], components: [row], allowedMentions: { users: [requester.id] } });
    return true;
  } catch {
    pending.delete(confirmation.id);
    return false;
  }
}

/** Handle a Confirm/Cancel button. Returns true if it was a confirmation button. */
export async function handleConfirmationButton(interaction) {
  const [action, id] = interaction.customId.split(':');
  if (action !== 'doll_do' && action !== 'doll_no') return false;

  const conf = pending.get(id);
  if (!conf) {
    await interaction.reply({ content: 'that confirmation expired — ask me again.', ephemeral: true });
    return true;
  }
  // Only the person who asked may confirm
  if (interaction.user.id !== conf.requesterId) {
    await interaction.reply({ content: 'only the person who requested this can confirm it.', ephemeral: true });
    return true;
  }

  if (action === 'doll_no') {
    pending.delete(id);
    await interaction.update({ content: '✖️ cancelled — nothing happened.', embeds: [], components: [] });
    return true;
  }

  pending.delete(id);
  const guild = interaction.client.guilds.cache.get(conf.guildId);
  const tool = getTool(conf.toolName);
  if (!guild || !tool) {
    await interaction.update({ content: 'that action is no longer available.', embeds: [], components: [] });
    return true;
  }

  await interaction.update({ content: `✅ confirmed — running **${conf.toolName}**…`, embeds: [], components: [] });

  try {
    const member = await guild.members.fetch(conf.requesterId).catch(() => null);
    const channel = await guild.channels.fetch(conf.channelId).catch(() => null);
    const ctx = { guild, channel, member, client: interaction.client, message: null };
    let result = await tool.execute(conf.params, ctx);
    result = resolveIds(typeof result === 'string' ? result : JSON.stringify(result), guild);
    await interaction.followUp({ content: result.substring(0, 1900) });
  } catch (e) {
    await interaction.followUp({ content: `that failed: ${e.message}`, ephemeral: true });
  }
  return true;
}
