// Visual polish: rendered welcome cards (canvas) + free AI image generation
// (Pollinations — no key, no cost).

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';

// Register a system font so text renders (canvas has no default on bare linux).
let FONT = 'sans-serif';
for (const p of [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'DollFont'); FONT = 'DollFont'; break; } catch { /* */ } }
}

export async function renderWelcomeCard(member, text) {
  const W = 800, H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // pastel gradient background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ffd9ec'); g.addColorStop(1, '#d9e8ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // circular avatar
  try {
    const av = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
    const cx = 150, cy = H / 2, r = 88;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.drawImage(av, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.lineWidth = 8; ctx.strokeStyle = '#ff9ecb';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  } catch { /* avatar failed, skip */ }

  // text
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5a3a4a';
  ctx.font = `bold 46px ${FONT}`;
  ctx.fillText('✿ Welcome!', 300, 115);
  ctx.fillStyle = '#6a4a5a';
  ctx.font = `34px ${FONT}`;
  ctx.fillText(member.displayName.substring(0, 22), 300, 165);
  ctx.fillStyle = '#8a6a7a';
  ctx.font = `22px ${FONT}`;
  ctx.fillText((text || '').substring(0, 42), 300, 215);

  return canvas.toBuffer('image/png');
}

// ── Free AI image gen via Pollinations ──
export function pollinationsUrl(prompt, { w = 1024, h = 1024 } = {}) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true`;
}

export async function generateImageBuffer(prompt, opts) {
  try {
    const res = await fetch(pollinationsUrl(prompt, opts), { headers: { 'User-Agent': 'DollBot/1.0' } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
