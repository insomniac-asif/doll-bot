// Resolve share/page links (Tenor, Giphy) to a DIRECT media URL so the GIF
// renders inside a bot embed instead of showing an ugly raw link. Free, no key.

import { AttachmentBuilder } from 'discord.js';

// Tenor (and some hosts) block Discord's image proxy from hotlinking their
// media inside a bot embed — so the embed shows nothing. The reliable fix is to
// download the gif ourselves and ATTACH it, then point the embed at
// attachment://name. Discord hosts it → it always renders.
// Returns { attachment, name } to attach + use with embed.setImage, or
// { directUrl } if it's too big to attach (fall back to hotlinking), or null.
export async function fetchGifAttachment(url, baseName = 'doll-gif') {
  const direct = await resolveGifUrl(url);
  if (!direct) return null;
  try {
    const res = await fetch(direct, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DollBot/1.0)' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/^image\//i.test(ct)) return { directUrl: direct };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return { directUrl: direct }; // too big to attach safely
    const ext = ct.includes('gif') ? 'gif' : ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const name = `${baseName}.${ext}`;
    return { attachment: new AttachmentBuilder(buf, { name }), name, directUrl: direct };
  } catch {
    return { directUrl: direct };
  }
}

// Search for a REAL gif by keyword (so Doll never fabricates URLs). Uses the
// Tenor API — set TENOR_API_KEY for the v2 endpoint, otherwise falls back to
// Tenor's public demo key. Returns an array of direct .gif URLs (newest API
// first). Empty array if nothing/failed → Doll should then ask for a link.
export async function searchGif(query, limit = 6) {
  if (!query) return [];
  const q = encodeURIComponent(query);
  const key = process.env.TENOR_API_KEY;
  try {
    if (key) {
      const r = await fetch(`https://tenor.googleapis.com/v2/search?q=${q}&key=${key}&client_key=dollbot&limit=${limit}&media_filter=gif&contentfilter=high`);
      if (r.ok) {
        const d = await r.json();
        const urls = (d.results || []).map(x => x.media_formats?.gif?.url).filter(Boolean);
        if (urls.length) return urls;
      }
    }
    // Public demo key fallback (v1)
    const r = await fetch(`https://g.tenor.com/v1/search?q=${q}&key=LIVDSRZULELA&limit=${limit}&contentfilter=high`);
    if (r.ok) {
      const d = await r.json();
      return (d.results || []).map(x => x.media?.[0]?.gif?.url).filter(Boolean);
    }
  } catch { /* network error */ }
  return [];
}

// Remember the last gif search per guild so "use option 2" can resolve.
const lastSearch = new Map();
export function setLastGifSearch(guildId, urls) { lastSearch.set(guildId, urls); }
export function getLastGifSearch(guildId) { return lastSearch.get(guildId) || []; }

// Turn an image PARAM into a usable URL. Accepts: a real URL, a bare number
// (pick from the last search), or a SEARCH TERM (e.g. "pastel sparkles") which
// gets searched and the top real result returned. This is what makes "add a
// sparkles gif" just work without the user pasting links or picking across turns.
export async function resolveImageInput(input, guildId) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^https?:\/\//i.test(s)) return s; // already a URL
  const num = s.match(/^(?:option\s*|gif\s*)?#?(\d{1,2})$/i);
  if (num) {
    const arr = getLastGifSearch(guildId);
    const i = parseInt(num[1], 10) - 1;
    if (arr[i]) return arr[i];
  }
  // treat as a search term
  const results = await searchGif(s, 6);
  if (results.length) { if (guildId) setLastGifSearch(guildId, results); return results[0]; }
  return null;
}

export async function resolveGifUrl(url) {
  if (!url) return null;
  // Already a direct media URL
  if (/\.(gif|png|jpe?g|webp)(\?|$)/i.test(url)) return url;

  try {
    // Tenor view page → scrape the direct media URL from the page metadata
    if (/tenor\.com\/view\//i.test(url)) {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DollBot/1.0)' } });
      if (!res.ok) return null;
      const html = await res.text();

      // Prefer a direct .gif from Tenor's media CDN
      const gif = html.match(/https:\/\/media[0-9]?\.tenor\.com\/[^"'\s\\]+\.gif/i);
      if (gif) return gif[0];

      // Fall back to the og:image meta (may be a png/gif preview)
      const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (og && /\.(gif|png|jpe?g|webp)/i.test(og[1])) return og[1];
      return null;
    }

    // Giphy view page → derive the direct media URL from the trailing id
    if (/giphy\.com\/gifs\//i.test(url)) {
      const id = url.split(/[?#]/)[0].split('-').pop();
      if (id && /^[A-Za-z0-9]+$/.test(id)) return `https://i.giphy.com/media/${id}/giphy.gif`;
    }

    // Imgur page → direct .gif
    const imgur = url.match(/imgur\.com\/(?:gallery\/|a\/)?([A-Za-z0-9]+)/i);
    if (imgur && !/\./.test(imgur[1])) return `https://i.imgur.com/${imgur[1]}.gif`;
  } catch { /* network/parse error */ }

  return null;
}
