// Free translation via Google's public gtx endpoint (no key, no cost) +
// per-channel auto-translate. Falls back silently on failure.

import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getAccent } from '../config.js';
import { isEnabled } from './featureToggle.js';

export const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', pl: 'Polish', tr: 'Turkish',
  sv: 'Swedish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', uk: 'Ukrainian',
  el: 'Greek', he: 'Hebrew', ro: 'Romanian', cs: 'Czech', fi: 'Finnish',
  da: 'Danish', no: 'Norwegian', hu: 'Hungarian', tl: 'Filipino',
};

// Translate text. Returns { translated, detected } or null.
export async function translateText(text, target, source = 'auto') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.[0])) return null;
    const translated = data[0].map(seg => seg[0]).filter(Boolean).join('');
    const detected = data[2] || source;
    return { translated, detected };
  } catch {
    return null;
  }
}

// Auto-translate a message if its channel is configured. Returns true if it posted.
const recent = new Map(); // channelId -> ts, light throttle
export async function handleAutoTranslate(message) {
  if (!isEnabled(message.guild.id, 'autoTranslate')) return false;
  const config = getConfig(message.guild.id);
  const target = config.autotranslate?.[message.channel.id];
  if (!target) return false;

  const text = message.content?.trim();
  if (!text || text.length < 2) return false;
  if (!/[a-zA-ZÀ-￿]/.test(text)) return false; // skip pure emoji/links/numbers
  if (/^https?:\/\/\S+$/.test(text)) return false;

  // Light throttle so a burst doesn't spam
  const last = recent.get(message.channel.id) || 0;
  if (Date.now() - last < 1500) return false;

  const result = await translateText(text.substring(0, 500), target);
  if (!result || !result.translated) return false;
  if (result.detected === target) return false; // already in target language
  if (result.translated.toLowerCase().trim() === text.toLowerCase()) return false;

  recent.set(message.channel.id, Date.now());
  const embed = new EmbedBuilder()
    .setColor(getAccent(message.guild.id))
    .setDescription(result.translated.substring(0, 1024))
    .setFooter({ text: `${LANG_NAMES[result.detected] || result.detected} → ${LANG_NAMES[target] || target}` });
  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
  return true;
}
