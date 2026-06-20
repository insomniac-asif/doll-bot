// AI server-health digest. Turns the activity/level/voice data Doll already
// collects into a plain-English health report with churn risk + suggestions —
// the "why + what to do" layer that paid analytics bots don't give cheaply.

import { EmbedBuilder } from 'discord.js';
import { getActivityStats, getChurnRisk } from './activity.js';
import { getLeaderboard } from './leveling.js';
import { voiceLeaderboard, formatDuration } from './voiceTracking.js';
import { complete } from './llm.js';
import { isEnabled } from './featureToggle.js';
import { notifyOwner } from './ownerForward.js';
import { getStore, saveStore } from '../store.js';
import { getAccent } from '../config.js';

// Gather raw numbers for a guild.
function gatherData(guild) {
  const activity = getActivityStats(guild.id);
  const churn = getChurnRisk(guild.id);
  const topLevels = getLeaderboard(guild.id, 5);
  const topVoice = voiceLeaderboard(guild.id, 3);

  const topChannelNames = activity.topChannels.map(c => {
    const ch = guild.channels.cache.get(c.id);
    return ch ? { name: `#${ch.name}`, count: c.count } : null;
  }).filter(Boolean);

  const churnNames = churn.map(c => {
    const m = guild.members.cache.get(c.id);
    return m ? { name: m.displayName, daysAgo: Math.floor((Date.now() - c.lastSeen) / 86_400_000) } : null;
  }).filter(Boolean);

  return { activity, topChannelNames, churnNames, topLevels, topVoice };
}

// Build the digest embed (with an AI-written insight section).
export async function generateDigest(guild) {
  const data = gatherData(guild);
  const { activity, topChannelNames, churnNames } = data;

  const trend = activity.trendPct === null
    ? 'not enough history yet'
    : `${activity.trendPct >= 0 ? '+' : ''}${activity.trendPct}% vs the previous week`;

  // Compact facts for the LLM
  const facts = [
    `Server: ${guild.name} (${guild.memberCount} members)`,
    `Messages last 7 days: ${activity.last7} (${trend})`,
    `Messages today: ${activity.today}`,
    `Active members tracked: ${activity.activeUsers}`,
    `Busiest channels: ${topChannelNames.map(c => `${c.name} (${c.count})`).join(', ') || 'n/a'}`,
    `Going quiet (churn risk): ${churnNames.map(c => `${c.name} (${c.daysAgo}d)`).join(', ') || 'none'}`,
  ].join('\n');

  const insight = await complete(
    `You are Doll, giving a server owner a short, friendly health read. Based on these stats, write 2-4 sentences: what's going well, what to watch, and ONE concrete suggestion. Be specific and warm, not corporate. No bullet points, no preamble.`,
    facts,
    { maxTokens: 250, temperature: 0.6 },
  );

  const embed = new EmbedBuilder()
    .setTitle(`🎀 ${guild.name} — weekly health`)
    .setColor(getAccent(guild.id))
    .addFields(
      { name: 'Activity', value: `${activity.last7} msgs this week (${trend})`, inline: true },
      { name: 'Today', value: `${activity.today} msgs`, inline: true },
      { name: 'Top channels', value: topChannelNames.slice(0, 3).map(c => `${c.name} — ${c.count}`).join('\n') || 'n/a', inline: false },
    )
    .setTimestamp();

  if (churnNames.length) {
    embed.addFields({
      name: '⚠️ Going quiet',
      value: churnNames.slice(0, 5).map(c => `${c.name} — last seen ${c.daysAgo}d ago`).join('\n'),
    });
  }
  if (insight) embed.addFields({ name: 'Doll\'s read', value: insight.trim().substring(0, 1024) });

  return embed;
}

// ── Weekly loop ──────────────────────────────────────────────────────────

const CHECK_INTERVAL = 60 * 60 * 1000; // hourly check; sends at most weekly per guild
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function startDigestLoop(client) {
  setInterval(() => runDigestCheck(client).catch(e => console.error('[Digest] loop error:', e.message)), CHECK_INTERVAL);
  console.log('[Digest] Weekly health-digest loop started');
}

async function runDigestCheck(client) {
  const state = getStore('digest', '_global', { lastSent: {} });
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    if (!isEnabled(guild.id, 'healthDigest')) continue;
    const last = state.lastSent[guild.id] || 0;
    if (now - last < WEEK_MS) continue;

    try {
      const embed = await generateDigest(guild);
      await notifyOwner(client, guild, {
        title: 'Weekly server health',
        description: 'here\'s how your server\'s doing this week.',
        level: 'info',
      });
      // Send the rich embed to the alert channel / owner DM directly too
      const owner = await client.users.fetch(process.env.OWNER_ID).catch(() => null);
      if (owner) await owner.send({ embeds: [embed] }).catch(() => {});

      state.lastSent[guild.id] = now;
      saveStore('digest', '_global', state);
    } catch (e) {
      console.error(`[Digest] Failed for ${guild.name}:`, e.message);
    }
  }
}
