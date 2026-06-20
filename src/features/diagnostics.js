// Self-diagnostics — Doll checks that everything is actually wired and working
// and reports a clear checklist. Read-only by default; an optional live test
// creates a throwaway channel + role + gif panel and cleans it up to prove the
// full create path end-to-end.

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { spawn } from 'node:child_process';
import { getConfig } from '../config.js';
import { getToolCount } from './toolRegistry.js';
import { getAllFeatures } from './featureToggle.js';
import { searchGif, fetchGifAttachment } from './media.js';
import { translateText } from './translate.js';
import { chatCompletion } from './aiProvider.js';

const OK = '✅', WARN = '⚠️', BAD = '❌';

function which(bin) {
  return new Promise(resolve => {
    const p = spawn('which', [bin]);
    p.on('close', code => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

async function pingProvider(provider) {
  try {
    const { provider: used } = await chatCompletion(
      [{ role: 'user', content: 'reply with "ok"' }],
      { maxTokens: 5, temperature: 0 },
    );
    return used === provider ? OK : `${WARN} (answered via ${used})`;
  } catch (e) {
    return `${BAD} (${e.message.slice(0, 40)})`;
  }
}

// Permission → which features it powers
const PERM_CHECKS = [
  ['ManageRoles', 'create/assign roles, reaction roles, role menus'],
  ['ManageChannels', 'create/edit/delete channels, lock/unlock'],
  ['ManageMessages', 'purge, pin, lock channels'],
  ['BanMembers', 'ban/unban'],
  ['KickMembers', 'kick, prune'],
  ['ModerateMembers', 'timeout/mute'],
  ['ManageGuild', 'invites, server settings, automod, invite tracking'],
  ['ManageGuildExpressions', 'add/remove emojis'],
  ['CreateInstantInvite', 'create invites'],
  ['MoveMembers', 'move/disconnect voice'],
  ['ManageEvents', 'scheduled events'],
  ['ViewAuditLog', 'audit log lookups'],
  ['AttachFiles', 'gifs/images in embeds'],
  ['AddReactions', 'reaction-role panels'],
  ['ManageNicknames', 'set nicknames'],
];

export async function runDiagnostics(guild, client) {
  const me = guild.members.me;
  const config = getConfig(guild.id);
  const sections = [];

  // ── Permissions ──
  const perms = me.permissions;
  const isAdmin = perms.has(PermissionFlagsBits.Administrator);
  const permLines = [];
  if (isAdmin) {
    permLines.push(`${OK} Administrator — full access, everything available`);
  } else {
    for (const [flag, what] of PERM_CHECKS) {
      const has = perms.has(PermissionFlagsBits[flag]);
      permLines.push(`${has ? OK : BAD} ${flag}${has ? '' : ` — missing → blocks: ${what}`}`);
    }
  }
  sections.push(`**Permissions**\n${permLines.join('\n')}`);

  // ── Role position ──
  const myPos = me.roles.highest.position;
  const topPos = guild.roles.cache.reduce((m, r) => r.id !== guild.id ? Math.max(m, r.position) : m, 0);
  const rolesAbove = guild.roles.cache.filter(r => r.position > myPos && r.id !== guild.id).size;
  sections.push(`**Role position**\n${rolesAbove === 0 ? OK : WARN} my top role is "${me.roles.highest.name}" (pos ${myPos}); ${rolesAbove} role(s) sit above me${rolesAbove ? ' — i can\'t manage members/roles above those' : ''}`);

  // ── AI providers ──
  const [mistral, deepseek] = await Promise.all([
    process.env.MISTRAL_API_KEY ? pingProvider('mistral') : `${WARN} no key`,
    process.env.DEEPSEEK_API_KEY ? `${OK} key set (fallback)` : `${WARN} no key`,
  ]);
  sections.push(`**AI brain**\n${mistral} Mistral (primary/free)\n${deepseek} DeepSeek (fallback)`);

  // ── External services ──
  const ext = [];
  try { ext.push(`${(await searchGif('test', 1)).length ? OK : WARN} gif search (Tenor)`); } catch { ext.push(`${BAD} gif search`); }
  try { ext.push(`${(await translateText('hola', 'en'))?.translated ? OK : WARN} translate (free)`); } catch { ext.push(`${BAD} translate`); }
  sections.push(`**External services**\n${ext.join('\n')}`);

  // ── Music stack ──
  const [ytdlp, ffmpeg] = await Promise.all([which('yt-dlp'), which('ffmpeg')]);
  sections.push(`**Music stack**\n${ytdlp ? OK : BAD} yt-dlp${ytdlp ? '' : ' — missing → music won\'t play'}\n${ffmpeg ? OK : BAD} ffmpeg${ffmpeg ? '' : ' — missing → music won\'t play'}`);

  // ── Config ──
  const cfg = [];
  const chName = id => { const c = guild.channels.cache.get(id); return c ? `#${c.name}` : null; };
  cfg.push(`${config.logChannel ? OK : WARN} log channel: ${chName(config.logChannel) || 'not set — say "set the log channel to #x"'}`);
  cfg.push(`${config.ownerAlert?.channel ? OK : WARN} alert channel: ${chName(config.ownerAlert.channel) || 'not set'}`);
  cfg.push(`${config.welcomeChannel ? OK : WARN} welcome channel: ${chName(config.welcomeChannel) || 'not set'}`);
  cfg.push(`${config.modRoles?.length ? OK : WARN} mod roles: ${config.modRoles?.length || 0}`);
  sections.push(`**Config**\n${cfg.join('\n')}`);

  // ── Tools + features ──
  const feats = getAllFeatures(guild.id);
  const on = feats.filter(f => f.enabled).length;
  sections.push(`**Capabilities**\n${OK} ${getToolCount()} AI tools registered\n${OK} ${on}/${feats.length} features enabled`);

  // ── Summary ──
  const allText = sections.join('\n\n');
  const bad = (allText.match(/❌/g) || []).length;
  const warn = (allText.match(/⚠️/g) || []).length;
  const header = bad === 0 && warn === 0
    ? `🎀 everything checks out — i'm fully operational!`
    : `diagnostics: ${bad} blocking issue(s), ${warn} thing(s) to look at`;

  return `${header}\n\n${allText}`;
}

// ── Live end-to-end test ──────────────────────────────────────────────────
// Actually creates a test channel + role + gif panel, then deletes them.
export async function runLiveTest(guild) {
  const steps = [];
  let role, channel;
  try {
    // 1. create role
    role = await guild.roles.create({ name: 'doll-selftest', reason: 'self-test' });
    steps.push(`${OK} created test role`);

    // 2. create channel
    channel = await guild.channels.create({ name: 'doll-selftest', type: ChannelType.GuildText, reason: 'self-test' });
    steps.push(`${OK} created test channel`);

    // 3. real gif + attach
    const gifs = await searchGif('cute test', 1);
    let gifStep = `${WARN} gif search returned nothing`;
    if (gifs.length) {
      const a = await fetchGifAttachment(gifs[0], 'selftest').catch(() => null);
      gifStep = a?.attachment ? `${OK} found + downloaded a real gif` : `${WARN} found gif but couldn't attach`;
    }
    steps.push(gifStep);

    // 4. post embed (with gif if available) + react
    const { EmbedBuilder } = await import('discord.js');
    const embed = new EmbedBuilder().setTitle('Doll self-test ✅').setDescription('this is a throwaway test — deleting in a sec');
    const files = [];
    if (gifs.length) {
      const a = await fetchGifAttachment(gifs[0], 'selftest').catch(() => null);
      if (a?.attachment) { embed.setImage(`attachment://${a.name}`); files.push(a.attachment); }
    }
    const msg = await channel.send({ embeds: [embed], files });
    await msg.react('🎀');
    steps.push(`${OK} posted an embed with a gif + reaction`);
  } catch (e) {
    steps.push(`${BAD} failed: ${e.message}`);
  } finally {
    // cleanup
    try { if (channel) await channel.delete('self-test cleanup'); } catch { /* leave it */ }
    try { if (role) await role.delete('self-test cleanup'); } catch { /* leave it */ }
    steps.push(`${OK} cleaned up test channel + role`);
  }
  return `live test (create → gif → post → cleanup):\n${steps.join('\n')}`;
}
