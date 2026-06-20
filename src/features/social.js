// Social live notifications. When a watched account goes live, ping a role in
// a chosen channel. Twitch + YouTube use official APIs; TikTok uses
// tiktok-live-connector (free, no API key — direct HTTP check).
import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getStore, saveStore } from '../store.js';
import { WebcastPushConnection } from 'tiktok-live-connector';
import { isEnabled } from './featureToggle.js';

let twitchToken = { value: null, expiresAt: 0 };

async function getTwitchToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (twitchToken.value && Date.now() < twitchToken.expiresAt) return twitchToken.value;

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`, { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json();
  twitchToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return twitchToken.value;
}

async function checkTwitch(login) {
  const token = await getTwitchToken();
  if (!token) return null;
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const stream = data.data?.[0];
  if (!stream) return { live: false };
  return { live: true, title: stream.title, url: `https://twitch.tv/${login}`, thumbnail: stream.thumbnail_url?.replace('{width}', '440').replace('{height}', '248') };
}

async function checkYouTube(channelId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${key}`);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return { live: false };
  return { live: true, title: item.snippet.title, url: `https://youtube.com/watch?v=${item.id.videoId}`, thumbnail: item.snippet.thumbnails?.high?.url };
}

// TikTok: free, no API key. Uses tiktok-live-connector's HTTP-only fetchIsLive.
async function checkTikTok(username) {
  try {
    const tiktok = new WebcastPushConnection(username, { processInitialData: false });
    const isLive = await tiktok.fetchIsLive();
    if (!isLive) return { live: false };
    return { live: true, title: `${username} is live on TikTok`, url: `https://tiktok.com/@${username}/live` };
  } catch (e) {
    // UserOfflineError or network issue — treat as "not live"
    if (e?.name === 'UserOfflineError') return { live: false };
    console.error('[Social] TikTok check error:', e.message);
    return null;
  }
}

const checkers = { twitch: checkTwitch, youtube: checkYouTube, tiktok: checkTikTok };
const labels = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok' };
const colors = { twitch: 0x9146ff, youtube: 0xff0000, tiktok: 0x00f2ea };

async function announce(guild, platform, watcher, result) {
  const channel = await guild.channels.fetch(watcher.announceChannel).catch(() => null);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(colors[platform])
    .setTitle(`🔴 LIVE on ${labels[platform]}`)
    .setDescription(`**${result.title || watcher.target}**\n${result.url}`)
    .setTimestamp();
  if (result.thumbnail) embed.setImage(result.thumbnail);
  const ping = watcher.roleId ? `<@&${watcher.roleId}> ` : '';
  await channel.send({ content: `${ping}${watcher.target} just went live!`, embeds: [embed] });
}

async function pollGuild(guild) {
  const config = getConfig(guild.id);
  const store = getStore('social', guild.id, { live: {} });
  let dirty = false;

  for (const platform of ['twitch', 'youtube', 'tiktok']) {
    for (const watcher of config.social[platform] || []) {
      const key = `${platform}:${watcher.target}`;
      const result = await checkers[platform](watcher.target).catch(() => null);
      if (!result) continue; // provider disabled or error
      const was = !!store.live[key];
      if (result.live && !was) {
        await announce(guild, platform, watcher, result).catch(() => {});
        store.live[key] = true; dirty = true;
      } else if (!result.live && was) {
        store.live[key] = false; dirty = true;
      }
    }
  }
  if (dirty) saveStore('social', guild.id, store);
}

export function startSocialLoop(client) {
  // TikTok needs no key (tiktok-live-connector). Twitch + YouTube need their keys.
  // Loop always starts — individual providers self-disable if keys are missing.
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      if (!isEnabled(guild.id, 'social')) continue;
      await pollGuild(guild).catch(e => console.error('[Social] poll error:', e.message));
    }
  }, 2 * 60 * 1000);
}
