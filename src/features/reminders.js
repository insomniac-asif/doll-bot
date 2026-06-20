import { getGlobal, saveGlobal } from '../store.js';

// Reminders are global (cross-guild) so the loop is a single timer.
export function addReminder({ userId, channelId, guildId, text, fireAt }) {
  const store = getGlobal('reminders', { items: [] });
  const id = `${Date.now()}-${Math.floor(store.items.length)}`;
  store.items.push({ id, userId, channelId, guildId, text, fireAt });
  saveGlobal('reminders', store);
  return id;
}

export function startReminderLoop(client) {
  setInterval(async () => {
    const store = getGlobal('reminders', { items: [] });
    if (!store.items.length) return;
    const now = Date.now();
    const due = store.items.filter(r => r.fireAt <= now);
    if (!due.length) return;

    store.items = store.items.filter(r => r.fireAt > now);
    saveGlobal('reminders', store);

    for (const r of due) {
      try {
        const channel = await client.channels.fetch(r.channelId).catch(() => null);
        if (channel) {
          await channel.send({ content: `⏰ <@${r.userId}> reminder: ${r.text}` });
        } else {
          const user = await client.users.fetch(r.userId).catch(() => null);
          if (user) await user.send(`⏰ Reminder: ${r.text}`);
        }
      } catch (e) {
        console.error('[Reminders] Failed to deliver:', e.message);
      }
    }
  }, 15 * 1000);
}

// Parse strings like "10m", "2h30m", "1d", "45s" into milliseconds.
export function parseDuration(input) {
  const re = /(\d+)\s*(d|h|m|s)/gi;
  let ms = 0;
  let match;
  let found = false;
  while ((match = re.exec(input)) !== null) {
    found = true;
    const n = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === 'd') ms += n * 86400000;
    else if (unit === 'h') ms += n * 3600000;
    else if (unit === 'm') ms += n * 60000;
    else if (unit === 's') ms += n * 1000;
  }
  return found ? ms : null;
}
