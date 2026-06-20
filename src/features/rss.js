// RSS / Atom feed watcher. Polls feeds and posts new items to a channel.
// Minimal dependency-free XML parsing (handles RSS <item> and Atom <entry>).

import { EmbedBuilder } from 'discord.js';
import { getStore, saveStore } from '../store.js';
import { getAccent } from '../config.js';
import { isEnabled } from './featureToggle.js';

function store(guildId) { return getStore('rss', guildId, { feeds: [], nextId: 1 }); }

function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '') // strip any inner HTML tags
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function atomLink(block) {
  const m = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return m ? m[1] : '';
}

// Parse feed XML into items: [{ title, link, id, date }]
function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi) || [];

  for (const block of blocks) {
    if (isAtom) {
      items.push({ title: tag(block, 'title'), link: atomLink(block), id: tag(block, 'id') || atomLink(block), date: tag(block, 'updated') || tag(block, 'published') });
    } else {
      items.push({ title: tag(block, 'title'), link: tag(block, 'link'), id: tag(block, 'guid') || tag(block, 'link'), date: tag(block, 'pubDate') });
    }
  }
  return items;
}

function feedTitle(xml) {
  // The channel/feed title is the first <title> before any item
  const head = xml.split(/<item[\s>]|<entry[\s>]/i)[0];
  return tag(head, 'title') || 'feed';
}

async function fetchFeed(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DollBot/1.0 RSS' }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function addFeed(guildId, url, channelId, name) {
  if (!/^https?:\/\//.test(url)) return { error: 'that doesn\'t look like a valid feed URL' };
  const xml = await fetchFeed(url);
  if (!xml) return { error: 'i couldn\'t fetch that feed — double-check the URL' };
  const items = parseFeed(xml);
  if (items.length === 0) return { error: 'that URL didn\'t look like a valid RSS/Atom feed' };

  const s = store(guildId);
  const resolvedName = name || feedTitle(xml);
  // Seed lastId with the newest current item so we don't dump history on add
  s.feeds.push({ id: s.nextId++, url, channelId, name: resolvedName, lastId: items[0].id });
  saveStore('rss', guildId, s);
  return { name: resolvedName };
}

export function removeFeed(guildId, idOrName) {
  const s = store(guildId);
  const before = s.feeds.length;
  if (/^\d+$/.test(String(idOrName))) s.feeds = s.feeds.filter(f => f.id !== Number(idOrName));
  else s.feeds = s.feeds.filter(f => f.name.toLowerCase() !== String(idOrName).toLowerCase());
  saveStore('rss', guildId, s);
  return before - s.feeds.length;
}

export function listFeeds(guildId) { return store(guildId).feeds; }

// ── Poll loop ───────────────────────────────────────────────────────────

export function startRssLoop(client) {
  setInterval(() => pollAll(client).catch(e => console.error('[RSS] loop error:', e.message)), 5 * 60 * 1000);
  console.log('[RSS] Feed watcher started');
}

async function pollAll(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!isEnabled(guild.id, 'feeds')) continue;
    const s = store(guild.id);
    if (s.feeds.length === 0) continue;
    let changed = false;

    for (const feed of s.feeds) {
      const xml = await fetchFeed(feed.url);
      if (!xml) continue;
      const items = parseFeed(xml);
      if (items.length === 0) continue;

      // Collect items newer than lastId (stop when we hit the known one)
      const fresh = [];
      for (const item of items) {
        if (item.id === feed.lastId) break;
        fresh.push(item);
      }
      if (fresh.length === 0) continue;

      const ch = await guild.channels.fetch(feed.channelId).catch(() => null);
      if (ch?.isTextBased?.()) {
        // Post oldest→newest, cap at 5 to avoid floods
        for (const item of fresh.slice(0, 5).reverse()) {
          const embed = new EmbedBuilder()
            .setColor(getAccent(guild.id))
            .setTitle((item.title || 'New post').substring(0, 256))
            .setURL(item.link || null)
            .setAuthor({ name: feed.name.substring(0, 256) })
            .setTimestamp(item.date ? new Date(item.date) : new Date());
          await ch.send({ embeds: [embed] }).catch(() => {});
        }
      }
      feed.lastId = items[0].id;
      changed = true;
    }
    if (changed) saveStore('rss', guild.id, s);
  }
}
