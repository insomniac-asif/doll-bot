// OCR — lets Doll read text out of posted images (memes, screenshots, etc.).
// Ported from Crodie. Opt-in per server (toggle 'ocr') because it's CPU-heavy
// (~2-5s per image). Results are cached by URL so a re-ask is instant.

import Tesseract from 'tesseract.js';
import { isEnabled } from './featureToggle.js';

const cache = new Map(); // url -> text (bounded)
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i;

export function isImageUrl(url) {
  return typeof url === 'string' && (IMAGE_RE.test(url) || /cdn\.discordapp|media\.discordapp|images-ext/.test(url));
}

// Pull the first image URL from a message (attachment or embed).
export function firstImageUrl(message) {
  const att = message.attachments?.find?.(a => a.contentType?.startsWith('image/') || isImageUrl(a.url));
  if (att) return att.url;
  const emb = message.embeds?.find?.(e => e.image?.url || e.thumbnail?.url);
  if (emb) return emb.image?.url || emb.thumbnail?.url;
  return null;
}

export async function readImage(url) {
  if (!url) return '';
  if (cache.has(url)) return cache.get(url);
  try {
    const { data } = await Tesseract.recognize(url, 'eng');
    const text = (data?.text || '').replace(/\s+/g, ' ').trim();
    if (cache.size > 100) cache.clear();
    cache.set(url, text);
    return text;
  } catch (e) {
    console.error('[OCR] failed:', e.message);
    return '';
  }
}

// For the chat pipeline: if OCR is on and the message has an image, return a
// context line with the text Doll "sees" in it.
export async function getImageContext(message) {
  if (!isEnabled(message.guild.id, 'ocr')) return '';
  const url = firstImageUrl(message);
  if (!url) return '';
  const text = await readImage(url);
  if (!text || text.length < 4) return '';
  return `\n\n[text Doll can read in the attached image]: "${text.slice(0, 600)}"`;
}
