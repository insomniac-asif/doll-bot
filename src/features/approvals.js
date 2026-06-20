// Owner-approval flow with buttons. When an admin requests an owner-only action,
// Doll forwards it to the owner with Approve/Deny buttons. On approval, Doll
// executes the original tool herself. Pending approvals live in memory with a
// short TTL (lost on restart — that's fine, they're ephemeral requests).

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getConfig } from '../config.js';
import { getTool } from './toolRegistry.js';
import { resolveIds } from './ai.js';

const pending = new Map(); // id -> { guildId, toolName, params, requesterId, requesterName, createdAt }
let counter = 0;
const TTL_MS = 60 * 60 * 1000;

function newId() {
  counter = (counter + 1) % 100000;
  return `${Date.now().toString(36)}${counter}`;
}

function prune() {
  const now = Date.now();
  for (const [id, a] of pending.entries()) {
    if (now - a.createdAt > TTL_MS) pending.delete(id);
  }
}

function buildMessage(approval, tool) {
  const paramSummary = Object.entries(approval.params)
    .map(([k, v]) => `**${k}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n') || '*(no parameters)*';

  const embed = new EmbedBuilder()
    .setTitle('🔔 Action needs your approval')
    .setColor(0xf1c40f)
    .setDescription(`**${approval.requesterName}** asked me to run an owner-only action.`)
    .addFields(
      { name: 'Action', value: tool?.name || approval.toolName, inline: true },
      { name: 'What it does', value: (tool?.description || '').substring(0, 200) || 'n/a', inline: false },
      { name: 'Details', value: paramSummary.substring(0, 1024) },
    )
    .setFooter({ text: 'Approve to let Doll run it, or Deny to dismiss.' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`doll_approve:${approval.id}`).setLabel('Approve').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`doll_deny:${approval.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  return { embeds: [embed], components: [row] };
}

// Create + send an approval request. Returns true if it reached the owner.
export async function requestApproval(client, guild, requester, tool, params) {
  prune();
  const approval = {
    id: newId(),
    guildId: guild.id,
    toolName: tool.name,
    params,
    requesterId: requester.id,
    requesterName: requester.displayName,
    createdAt: Date.now(),
  };
  pending.set(approval.id, approval);

  const payload = buildMessage(approval, tool);
  let delivered = false;

  // DM the global owner
  if (process.env.OWNER_ID) {
    try {
      const owner = await client.users.fetch(process.env.OWNER_ID);
      await owner.send(payload);
      delivered = true;
    } catch { /* dms closed */ }
  }
  // Also post to the per-guild alert channel
  const config = getConfig(guild.id);
  if (config.ownerAlert?.channel) {
    try {
      const ch = await guild.channels.fetch(config.ownerAlert.channel).catch(() => null);
      if (ch) { await ch.send(payload); delivered = true; }
    } catch { /* no channel */ }
  }
  return delivered;
}

// Handle an Approve/Deny button press. Returns true if it was an approval button.
export async function handleApprovalButton(interaction) {
  const [action, id] = interaction.customId.split(':');
  if (action !== 'doll_approve' && action !== 'doll_deny') return false;

  // Only the owner (global or guild) may decide
  const approval = pending.get(id);
  if (!approval) {
    await interaction.reply({ content: 'that request expired or was already handled.', ephemeral: true });
    return true;
  }

  const guild = interaction.client.guilds.cache.get(approval.guildId);
  const isOwner = interaction.user.id === process.env.OWNER_ID || interaction.user.id === guild?.ownerId;
  if (!isOwner) {
    await interaction.reply({ content: 'only the server owner can approve this.', ephemeral: true });
    return true;
  }

  if (action === 'doll_deny') {
    pending.delete(id);
    await interaction.update({ content: `✖️ Denied — i won't run **${approval.toolName}**.`, embeds: [], components: [] });
    return true;
  }

  // Approve → execute the tool as the owner
  pending.delete(id);
  const tool = getTool(approval.toolName);
  if (!tool || !guild) {
    await interaction.update({ content: 'that action is no longer available.', embeds: [], components: [] });
    return true;
  }

  await interaction.update({ content: `✅ Approved — running **${approval.toolName}**…`, embeds: [], components: [] });

  try {
    const ownerMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    const channel = interaction.channel
      || (await guild.channels.fetch(getConfig(guild.id).ownerAlert?.channel).catch(() => null));
    const ctx = { guild, channel, member: ownerMember, client: interaction.client, message: null };

    let result = await tool.execute(approval.params, ctx);
    result = resolveIds(typeof result === 'string' ? result : JSON.stringify(result), guild);
    await interaction.followUp({ content: `done: ${result}`.substring(0, 1900), ephemeral: false });
  } catch (e) {
    await interaction.followUp({ content: `that failed: ${e.message}`, ephemeral: true });
  }
  return true;
}
