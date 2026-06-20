import { scanMessage } from '../features/automod.js';
import { chat, shouldRespond } from '../features/ai.js';
import { handleMessageXp } from '../features/leveling.js';
import { handleAfk } from '../features/afk.js';
import { markDollReply, markDollChannelActivity } from '../features/conversationTracker.js';
import { trackMessage } from '../features/activity.js';
import { evaluateMessage } from '../features/rulesEngine.js';
import { tryAutoAnswerFaq } from '../features/faq.js';
import { isEnabled } from '../features/featureToggle.js';
import { checkChat } from '../features/rateLimiter.js';
import { matchAutoresponder } from '../features/autoresponders.js';
import { handleScamScan } from '../features/antiScam.js';
import { handleModmailDM, handleModmailStaffReply, modmailUserForChannel } from '../features/modmail.js';
import { handleDevReply } from '../features/devSupport.js';
import { handleDevMonitor } from '../features/devMonitor.js';
import { handleAutoTranslate } from '../features/translate.js';
import { archiveMessage } from '../features/vault.js';

// Guard against the same message being handled twice (e.g. overlapping gateway
// connections during a restart). Keeps a short-lived set of seen message IDs.
const seenMessages = new Set();
function alreadyHandled(id) {
  if (seenMessages.has(id)) return true;
  seenMessages.add(id);
  if (seenMessages.size > 500) {
    // trim oldest ~100
    let i = 0;
    for (const k of seenMessages) { seenMessages.delete(k); if (++i >= 100) break; }
  }
  return false;
}

export default {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (alreadyHandled(message.id)) return;

    // DMs → developer-reply bridge (you) first, then ModMail (members→staff)
    if (!message.guild) {
      if (await handleDevMonitor(message, client).catch(() => false)) return; // dev: "status"/"issues"
      if (await handleDevReply(message, client).catch(() => false)) return;   // dev: "reply N ..."
      await handleModmailDM(message, client).catch(e => console.error('[ModMail] DM error:', e.message));
      return;
    }

    // Staff replies inside a modmail channel → relay to the member, then stop
    if (modmailUserForChannel(message.channel.id)) {
      await handleModmailStaffReply(message).catch(e => console.error('[ModMail] reply error:', e.message));
      return;
    }

    // Anti-scam runs first — if it removes the message, stop here
    if (await handleScamScan(message).catch(() => false)) return;

    // Passive tracking + automation (cheap, runs on every message)
    trackMessage(message);
    archiveMessage(message); // long-term vault (no-op unless 'vault' enabled)
    await scanMessage(message);
    await handleAfk(message);
    await handleMessageXp(message);
    await evaluateMessage(message).catch(e => console.error('[Rules] eval error:', e.message));

    // Custom auto-responders (before AI; cheap local match)
    const ar = isEnabled(message.guild.id, 'autoresponders')
      ? matchAutoresponder(message.guild.id, message.channel.id, message.content)
      : null;
    if (ar) {
      try { await message.channel.send({ content: ar, allowedMentions: { parse: [] } }); } catch { /* ignore */ }
    }

    // Auto-translate configured channels (free; runs regardless of AI gating)
    await handleAutoTranslate(message).catch(() => {});

    // Conservative auto-FAQ: answer obvious repeat questions even if not addressed
    if (isEnabled(message.guild.id, 'autoFaq')) {
      const answer = tryAutoAnswerFaq(message.guild.id, message.channel.id, message.content);
      if (answer) {
        try {
          await message.reply({ content: answer, allowedMentions: { repliedUser: false } });
          markDollReply(message.channel.id, message.author.id);
          markDollChannelActivity(message.channel.id);
          return; // answered the question; don't also run the chat path
        } catch { /* fall through */ }
      }
    }

    if (await shouldRespond(message, client)) {
      // Rate limit AI replies (per-user + per-guild cost cap). Signal with a
      // reaction instead of spamming text.
      const rl = checkChat(message.guild.id, message.author.id);
      if (!rl.allowed) {
        try { await message.react('⏳'); } catch { /* ignore */ }
        return;
      }
      try {
        await message.channel.sendTyping();
        const reply = await chat(message);

        if (reply.length > 2000) {
          const chunks = reply.match(/[\s\S]{1,2000}/g) || [reply];
          for (const chunk of chunks) {
            await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
          }
        } else {
          await message.reply({ content: reply, allowedMentions: { repliedUser: false } });
        }

        // Mark the conversation as active so follow-ups keep working
        markDollReply(message.channel.id, message.author.id);
        markDollChannelActivity(message.channel.id);
      } catch (e) {
        console.error('[AI] Failed to respond:', e.message);
      }
    }
  },
};
