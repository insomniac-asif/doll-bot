// Rotating cute rich presence. Doll cycles through a pool of soft, sanrio-ish
// statuses (Watching / Playing / Listening / Custom) instead of one static line.
// Presence is GLOBAL to the bot (one status across all servers). The owner can
// pin a custom one via the set_status tool; rotation resumes when cleared.

import { ActivityType } from 'discord.js';

// {type}, {text}. {members} is filled with the total member count.
const POOL = [
  { type: ActivityType.Watching, text: 'over the server 🎀' },
  { type: ActivityType.Watching, text: 'you be adorable' },
  { type: ActivityType.Watching, text: 'the kitty cam 🐾' },
  { type: ActivityType.Watching, text: 'for trouble (none allowed)' },
  { type: ActivityType.Watching, text: '{members} little cuties' },
  { type: ActivityType.Playing,  text: 'with pink ribbons 🎀' },
  { type: ActivityType.Playing,  text: 'dress-up 🌸' },
  { type: ActivityType.Playing,  text: 'in the sanrio café ☕' },
  { type: ActivityType.Playing,  text: 'hide & seek 🐰' },
  { type: ActivityType.Listening, text: 'lofi & rain 🌧️' },
  { type: ActivityType.Listening, text: 'to your secrets 🤫' },
  { type: ActivityType.Listening, text: 'kitty purrs 🐱' },
  { type: ActivityType.Listening, text: 'strawberry pop 🍓' },
  { type: ActivityType.Custom,   text: 'being a good girl ૮₍ ˶•⤙•˶ ₎ა' },
  { type: ActivityType.Custom,   text: '🌸 here if you need me' },
  { type: ActivityType.Custom,   text: 'sipping strawberry milk 🍓' },
  { type: ActivityType.Custom,   text: '/ᐠ｡ꞈ｡ᐟ\\ keeping watch' },
  { type: ActivityType.Custom,   text: '˚₊‧ ꒰ doll ꒱ ‧₊˚' },
];

const ROTATE_MS = 4 * 60 * 1000;
let i = 0;
let manual = null; // owner-pinned status overrides rotation
let timer = null;

function apply(client, item) {
  const total = client.guilds.cache.reduce((s, g) => s + (g.memberCount || 0), 0);
  const text = item.text.replace('{members}', total);
  // Custom status shows the `state`; the others show the `name`.
  if (item.type === ActivityType.Custom) {
    client.user.setActivity({ name: text, type: ActivityType.Custom, state: text });
  } else {
    client.user.setActivity(text, { type: item.type });
  }
}

function tick(client) {
  if (manual) { apply(client, manual); return; }
  apply(client, POOL[i % POOL.length]);
  i++;
}

export function startPresenceLoop(client) {
  tick(client); // set one immediately
  clearInterval(timer);
  timer = setInterval(() => tick(client), ROTATE_MS);
  console.log('[Presence] Rotating cute presence started');
}

// Owner pins a status (pauses rotation until cleared).
export function setManualStatus(client, text, type = ActivityType.Custom) {
  manual = { type, text };
  apply(client, manual);
}

export function clearManualStatus(client) {
  manual = null;
  tick(client);
}

export function isManualSet() { return manual !== null; }
