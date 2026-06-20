// Anti-raid join-gate. Detects a burst of joins (raid) in a short window and
// locks the server down + alerts the owner. Optional new-account gate kicks/
// alerts on suspiciously-young accounts. Opt-in (config.antiRaid.enabled).

import { PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../config.js';
import { notifyOwner } from './ownerForward.js';
import { logIssue } from './devMonitor.js';

const joinTimes = new Map(); // guildId -> [timestamps]
const raidActive = new Map(); // guildId -> bool (avoid re-triggering)

export async function handleJoinRaid(member) {
  const guild = member.guild;
  const cfg = getConfig(guild.id).antiRaid;
  if (!cfg?.enabled) return;

  // ── account-age gate ──
  if (cfg.minAccountAgeDays > 0) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    if (ageDays < cfg.minAccountAgeDays) {
      if (cfg.ageAction === 'kick' && member.kickable) {
        await member.kick(`Anti-raid: account younger than ${cfg.minAccountAgeDays}d`).catch(() => {});
      } else if (cfg.ageAction === 'ban' && member.bannable) {
        await guild.members.ban(member, { reason: 'Anti-raid: young account' }).catch(() => {});
      } else {
        await notifyOwner(member.client, guild, {
          title: 'New-account join', level: 'warn',
          description: `**${member.user.tag}** joined — account is only ${Math.floor(ageDays)}d old (under your ${cfg.minAccountAgeDays}d gate).`,
        });
      }
    }
  }

  // ── burst detection ──
  const now = Date.now();
  const arr = (joinTimes.get(guild.id) || []).filter(t => t > now - cfg.windowSec * 1000);
  arr.push(now);
  joinTimes.set(guild.id, arr);

  if (arr.length >= cfg.joinThreshold && !raidActive.get(guild.id)) {
    raidActive.set(guild.id, true);
    setTimeout(() => raidActive.set(guild.id, false), 5 * 60 * 1000); // cooldown
    await triggerRaidResponse(guild, arr.length, cfg);
  }
}

async function triggerRaidResponse(guild, count, cfg) {
  let actionTaken = 'alerted you';
  if (cfg.action === 'lockdown') {
    // raise verification to highest + deny @everyone send in text channels
    try { await guild.setVerificationLevel(4, 'Anti-raid lockdown'); } catch { /* missing perm */ }
    let locked = 0;
    for (const ch of guild.channels.cache.filter(c => c.type === 0).values()) {
      try { await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }); locked++; } catch { /* skip */ }
    }
    actionTaken = `locked the server (${locked} channels) + raised verification to highest`;
  }

  logIssue(guild, 'raid', `${count} joins in ${cfg.windowSec}s — ${actionTaken}`);
  await notifyOwner(guild.members.me?.client || guild.client, guild, {
    title: '🚨 RAID DETECTED', level: 'urgent',
    description: `${count} accounts joined within ${cfg.windowSec}s. i ${actionTaken}.\n\nsay "unlock the server" once it's safe, and "lower verification to medium".`,
  });
}
