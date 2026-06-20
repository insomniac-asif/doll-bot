// Anti-scam link scanning. Catches the common Discord scam patterns (fake
// Nitro/Steam gift sites, lookalike domains) using a built-in blocklist +
// heuristics. Free, no external API. Controlled by config.antiScam.

import { getConfig } from '../config.js';
import { notifyOwner } from './ownerForward.js';
import { logIssue } from './devMonitor.js';

// Known scam / phishing domain fragments (Discord/Steam gift scams etc.)
const SCAM_DOMAINS = [
  'dlscord', 'discrod', 'discordnitro', 'discord-nitro', 'discrod', 'dliscord',
  'steamcommunlty', 'steamcomunity', 'steam-community', 'discordgift', 'discord-gift',
  'discordapp.gift', 'discord.gift-', 'nitro-discord', 'free-nitro', 'discordgifts',
  'discrod.com', 'discordc.gift', 'discord-airdrop', 'click-nitro',
];

// Lookalike of discord/steam using digit/letter swaps
const LOOKALIKE_RE = /\b(d[i1l]scord|st[e3]amcommunity|d[i1l]scordapp)[\w-]*\.(com|net|gift|gg|info|xyz|ru)\b/i;
const URL_RE = /https?:\/\/([^\s/]+)/gi;

// Phrases that, combined with a link, strongly indicate a scam
const SCAM_PHRASES = /\b(free\s+nitro|nitro\s+for\s+free|claim\s+your\s+nitro|steam\s+gift|free\s+gift|@everyone\s+free)\b/i;

export function scanForScam(content) {
  if (!content) return null;
  const text = content.toLowerCase();

  // Explicit bl1ocklist domains
  for (const frag of SCAM_DOMAINS) {
    if (text.includes(frag)) return { reason: `known scam domain (${frag})` };
  }
  // Lookalike domains
  if (LOOKALIKE_RE.test(content)) return { reason: 'lookalike phishing domain' };

  // Scam phrase + any link
  const hasLink = URL_RE.test(content);
  URL_RE.lastIndex = 0;
  if (hasLink && SCAM_PHRASES.test(content)) return { reason: 'free-nitro/gift scam pattern' };

  return null;
}

// Scan + act per the guild's config. Returns true if it took action.
export async function handleScamScan(message) {
  const config = getConfig(message.guild.id);
  if (!config.antiScam?.enabled) return false;

  const hit = scanForScam(message.content);
  if (!hit) return false;

  const action = config.antiScam.action || 'delete';
  logIssue(message.guild, 'scam_blocked', hit.reason);
  try {
    await message.delete().catch(() => {});
    if (action === 'timeout' && message.member?.moderatable) {
      await message.member.timeout(60 * 60 * 1000, `Anti-scam: ${hit.reason}`).catch(() => {});
    } else if (action === 'kick' && message.member?.kickable) {
      await message.member.kick(`Anti-scam: ${hit.reason}`).catch(() => {});
    }
    await notifyOwner(message.client, message.guild, {
      title: 'Scam link blocked',
      description: `removed a likely scam from **${message.member?.displayName || 'someone'}** in <#${message.channel.id}>.`,
      level: 'warn',
      fields: [{ name: 'Reason', value: hit.reason, inline: true }, { name: 'Action', value: action, inline: true }],
    });
  } catch (e) {
    console.error('[AntiScam] action failed:', e.message);
  }
  return true;
}
