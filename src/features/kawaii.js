// Cute anime reactions & images via nekos.best (free, no API key).
// Returns a GIF/image URL plus its anime/artist source.

export async function fetchNeko(category) {
  const res = await fetch(`https://nekos.best/api/v2/${category}`);
  if (!res.ok) throw new Error(`nekos.best ${res.status}`);
  const data = await res.json();
  const item = data.results?.[0];
  if (!item) throw new Error('no result');
  return { url: item.url, source: item.anime_name || item.artist_name || null };
}

// Action commands target another user: "{author} {verb} {target}!"
// category = nekos.best endpoint, verb = display phrasing.
export const ACTIONS = [
  { name: 'hug', category: 'hug', verb: 'hugs' },
  { name: 'pat', category: 'pat', verb: 'pats' },
  { name: 'cuddle', category: 'cuddle', verb: 'cuddles' },
  { name: 'kiss', category: 'kiss', verb: 'kisses' },
  { name: 'poke', category: 'poke', verb: 'pokes' },
  { name: 'tickle', category: 'tickle', verb: 'tickles' },
  { name: 'highfive', category: 'highfive', verb: 'high-fives' },
  { name: 'handhold', category: 'handhold', verb: 'holds hands with' },
  { name: 'feed', category: 'feed', verb: 'feeds' },
  { name: 'bonk', category: 'punch', verb: 'bonks' },
  { name: 'slap', category: 'slap', verb: 'slaps' },
  { name: 'bite', category: 'bite', verb: 'bites' },
  { name: 'wave', category: 'wave', verb: 'waves at' },
  { name: 'peck', category: 'peck', verb: 'gives a little peck to' },
];

// Solo-mood commands: "{author} is {mood}"
export const MOODS = [
  { name: 'blush', category: 'blush', verb: 'is blushing' },
  { name: 'cry', category: 'cry', verb: 'is crying' },
  { name: 'happy', category: 'happy', verb: 'is so happy' },
  { name: 'dance', category: 'dance', verb: 'is dancing' },
  { name: 'pout', category: 'pout', verb: 'is pouting' },
  { name: 'smug', category: 'smug', verb: 'looks smug' },
];

// Pure image commands (no target)
export const IMAGES = [
  { name: 'neko', category: 'neko', label: 'a neko' },
  { name: 'waifu', category: 'waifu', label: 'a waifu' },
  { name: 'kitsune', category: 'kitsune', label: 'a kitsune' },
];
