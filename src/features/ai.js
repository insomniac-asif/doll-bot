// Doll's AI brain — dual-provider chat with tool-calling integration.
// Pure conversation → Mistral (fast, personality-tuned)
// Management/action requests → DeepSeek with function-calling tools
// Fallback chain: Mistral → DeepSeek chat → error message

import { getConfig } from '../config.js';
import { getSystemPrompt } from './personality.js';
import { isActiveConversation, dollSpokeRecently, markActionContext, isActionContext } from './conversationTracker.js';
import { getServerContext } from './serverAwareness.js';
import { getMemory, getGuildMemory } from './memory.js';
import { isManagementRequest, responseIndicatesAction, executeToolPath, stripDSML } from './toolRouter.js';
import { getFaqContext } from './faq.js';
import { isEnabled } from './featureToggle.js';
import { chatText } from './aiProvider.js';
import { getVaultContext } from './vault.js';
import { getImageContext } from './ocr.js';

const conversationHistory = new Map();
const MAX_HISTORY = 20;

function getHistory(channelId) {
  if (!conversationHistory.has(channelId)) conversationHistory.set(channelId, []);
  return conversationHistory.get(channelId);
}

function trimHistory(channelId) {
  const history = getHistory(channelId);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

// ── Providers ────────────────────────────────────────────────────────────

// Chat completion with Mistral-first / DeepSeek-fallback (see aiProvider.js).
async function callChat(messages) {
  return chatText(messages, { maxTokens: 600, temperature: 0.8 });
}

// ── ID Resolution ────────────────────────────────────────────────────────
// Replace raw Discord snowflake IDs in Doll's output with human-readable names.
export function resolveIds(text, guild) {
  if (!guild || !text) return text;
  // <@userId> or <@!userId> → display name
  text = text.replace(/<@!?(\d{17,20})>/g, (match, id) => {
    const member = guild.members.cache.get(id);
    if (member) return `@${member.displayName}`;
    return match;
  });
  // <#channelId> → #channel-name
  text = text.replace(/<#(\d{17,20})>/g, (match, id) => {
    const ch = guild.channels.cache.get(id);
    if (ch) return `#${ch.name}`;
    return match;
  });
  // <@&roleId> → @role-name
  text = text.replace(/<@&(\d{17,20})>/g, (match, id) => {
    const role = guild.roles.cache.get(id);
    if (role) return `@${role.name}`;
    return match;
  });
  return text;
}

// ── System Prompt Builder ────────────────────────────────────────────────

function buildSystemPrompt(message) {
  const config = getConfig(message.guild.id);
  const basePrompt = getSystemPrompt(config, message.guild);

  // Server context (channels, roles, members map)
  const serverCtx = getServerContext(message.guild);

  // User memory
  const userMem = getMemory(message.guild.id, message.author.id);
  const userMemBlock = userMem.notes.length
    ? `\n\nwhat you remember about ${message.member?.displayName || message.author.username}:\n${userMem.notes.join('\n')}`
    : '';

  // Server memory
  const guildMem = getGuildMemory(message.guild.id);
  const guildMemBlock = guildMem.length
    ? `\n\nserver notes you've memorized:\n${guildMem.join('\n')}`
    : '';

  // Relevant FAQ entries (so Doll answers known questions correctly when engaged)
  const faqBlock = isEnabled(message.guild.id, 'autoFaq')
    ? getFaqContext(message.guild.id, message.content)
    : '';

  // Long-term conversation vault (Crodie-ported awareness, opt-in)
  const vaultBlock = getVaultContext(message.guild.id, message.content);

  return basePrompt + serverCtx + userMemBlock + guildMemBlock + faqBlock + vaultBlock +
    '\n\nimportant: never show raw Discord IDs to users. always use #channel-name, @username, @role-name.';
}

// ── Chat ─────────────────────────────────────────────────────────────────

export async function chat(message) {
  const systemPrompt = buildSystemPrompt(message);
  const history = getHistory(message.channel.id);

  // Clean the incoming message. CRITICAL: resolve channel/role/user mentions to
  // their real NAMES before the model sees them — otherwise the model gets a raw
  // <#id> snowflake it can't identify and GUESSES the wrong channel (e.g. "alerts"
  // → "✿-colors"). Strip only Doll's own @mention, keep everything else as names.
  const botMention = new RegExp(`<@!?${message.client.user.id}>`, 'g');
  const cleaned = resolveIds(message.content.replace(botMention, '').trim(), message.guild);
  const speaker = message.member?.displayName || message.author.username;
  history.push({ role: 'user', content: `${speaker}: ${cleaned}` });
  trimHistory(message.channel.id);

  // Ambient context (recent channel messages for room-reading) — also resolved
  let ambient = '';
  try {
    const recent = await message.channel.messages.fetch({ limit: 5, before: message.id });
    const lines = recent.reverse().map(m => {
      if (m.author.bot && m.author.id !== message.client.user.id) return null;
      const name = m.member?.displayName || m.author.username;
      const content = m.content ? resolveIds(m.content.substring(0, 200), message.guild) : '[embed/attachment]';
      return `${name}: ${content}`;
    }).filter(Boolean);
    if (lines.length) ambient = `\n\nrecent channel context (for awareness, don't repeat):\n${lines.join('\n')}`;
  } catch { /* no perms or empty */ }

  // OCR: if the message has an image and OCR is on, let Doll "see" its text
  const imageCtx = await getImageContext(message).catch(() => '');

  const fullSystemPrompt = systemPrompt + ambient + imageCtx;
  const channelId = message.channel.id;
  const userId = message.author.id;

  // ── Route: management request OR an active action flow → tools ──
  // The action-context check keeps multi-step setups (e.g. "make roles" →
  // "name the channel roles" → "now the embed") on the tool path so Doll
  // actually does each step instead of the chat model claiming she did.
  if (isManagementRequest(cleaned) || isActionContext(channelId, userId)) {
    try {
      let reply = await executeToolPath(message, fullSystemPrompt, history);
      reply = resolveIds(reply, message.guild);
      history.push({ role: 'assistant', content: reply });
      trimHistory(channelId);
      markActionContext(channelId, userId); // stay on the tool path for follow-ups
      return reply;
    } catch (e) {
      console.error('[AI] Tool path failed, falling back to chat:', e.message);
      // Fall through to Mistral chat
    }
  }

  // ── Route: pure chat → Mistral ──
  // Hard guard: on the chat path Doll has NO tools, so she must never claim to
  // have performed (or to be performing) a server action — that's how false
  // "channel created!" replies happen. If the user wants something done, she
  // says she's on it, which re-routes her to the real tools.
  const chatGuard = `\n\nYOU ARE IN CONVERSATION MODE — you cannot create, delete, edit, assign, post, or change anything from here. If the user asks you to DO something (make/create a channel, role, embed, panel; assign/remove a role; ban/kick/mute; post/announce; set anything up), do NOT claim it's done, ready, created, or going in. Instead say you're on it (e.g. "on it — setting that up now") and nothing else about having done it. Only describe an action as completed if a tool result in this conversation actually confirms it.`;
  const messages = [
    { role: 'system', content: fullSystemPrompt + chatGuard },
    ...history,
  ];

  let reply = await callChat(messages);
  reply = stripDSML(reply);
  if (!reply) return 'i\'m having trouble connecting to my brain right now. try again in a sec.';

  // If the reply implies an action ("on it" / "i'll handle that" / completion
  // claims), re-route to the tools so she ACTUALLY does it instead of just saying so.
  if (responseIndicatesAction(reply)) {
    try {
      console.log('[AI] Re-routing to tool path — chat reply implied an action');
      let toolReply = await executeToolPath(message, fullSystemPrompt, history);
      toolReply = resolveIds(toolReply, message.guild);
      history.push({ role: 'assistant', content: toolReply });
      trimHistory(channelId);
      markActionContext(channelId, userId);
      return toolReply;
    } catch (e) {
      console.error('[AI] Re-route tool path failed:', e.message);
      // Fall through to use the chat reply
    }
  }

  reply = resolveIds(reply, message.guild);
  history.push({ role: 'assistant', content: reply });
  trimHistory(channelId);
  return reply;
}

// ── Response gating ──────────────────────────────────────────────────────

export async function shouldRespond(message, client) {
  if (message.author.bot || !message.guild) return false;

  // Direct triggers
  if (message.mentions.has(client.user)) return true;
  if (/\bdoll\b/i.test(message.content)) return true;

  const config = getConfig(message.guild.id);
  if (config.aiChannels.length > 0 && config.aiChannels.includes(message.channel.id)) return true;

  // Reply to Doll's message
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      if (ref?.author?.id === client.user.id) return true;
    } catch { /* referenced message gone */ }
  }

  // Active conversation window
  if (isActiveConversation(message.channel.id, message.author.id)) return true;

  // Doll just spoke in this channel
  if (dollSpokeRecently(message.channel.id, 45_000)) return true;

  return false;
}
