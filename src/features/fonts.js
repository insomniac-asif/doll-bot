// Fancy unicode fonts + cute decoration wrappers. Lets Doll style text
// reliably (channel/category/role names, titles) instead of hoping the model
// remembers astral codepoints.

function mapOffset(text, capBase, lowBase, digitBase) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90 && capBase) out += String.fromCodePoint(capBase + (c - 65));
    else if (c >= 97 && c <= 122 && lowBase) out += String.fromCodePoint(lowBase + (c - 97));
    else if (c >= 48 && c <= 57 && digitBase) out += String.fromCodePoint(digitBase + (c - 48));
    else out += ch;
  }
  return out;
}

const SMALLCAPS = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };

export const FONT_STYLES = {
  script: t => mapOffset(t, 0x1D4D0, 0x1D4EA, null),   // 𝓬𝓾𝓽𝓮 (bold script)
  bold: t => mapOffset(t, 0x1D400, 0x1D41A, 0x1D7CE),  // 𝐜𝐮𝐭𝐞
  mono: t => mapOffset(t, 0x1D670, 0x1D68A, 0x1D7F6),  // 𝚌𝚞𝚝𝚎
  fullwidth: t => mapOffset(t, 0xFF21, 0xFF41, 0xFF10), // ｃｕｔｅ
  bubble: t => [...t].map(ch => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x24B6 + (c - 65));
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x24D0 + (c - 97));
    if (c >= 49 && c <= 57) return String.fromCodePoint(0x2460 + (c - 49));
    if (c === 48) return '⓪';
    return ch;
  }).join(''),
  smallcaps: t => [...t].map(ch => SMALLCAPS[ch.toLowerCase()] || ch).join(''),
};

export const DECOR = {
  sparkle: t => `⋆˚࿔ ${t} ｡˚`,
  hearts: t => `♡ ${t} ♡`,
  bows: t => `୨୧ ${t} ୨୧`,
  flower: t => `✿ ${t} ✿`,
  stars: t => `˚‧୨ ${t} ୧‧˚`,
  full: t => `·˚ ༘ ⋆｡˚ ${t} ˚｡⋆ ༘ ˚·`,
  paw: t => `⊹ ${t} ⊹`,
};

export function styleText(text, style, decorate) {
  let out = text;
  if (style && FONT_STYLES[style]) out = FONT_STYLES[style](out);
  if (decorate && DECOR[decorate]) out = DECOR[decorate](out);
  return out;
}

export const FONT_NAMES = Object.keys(FONT_STYLES);
export const DECOR_NAMES = Object.keys(DECOR);
