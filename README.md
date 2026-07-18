# doll-bot

One Node.js process that runs an AI-driven Discord management bot across many servers — built so the AI can only *claim* an action it actually performed.

[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-9-blue)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What it does

doll is a multi-server Discord bot: moderation, server setup, leveling/economy, tickets, giveaways, music, reaction roles, anti-nuke, and AI chat — all from a single process where each guild gets its own JSON config, personality, and feature toggles (`src/data/servers/{guildId}.json`, auto-created on first interaction). Beyond chatting, it exposes a natural-language **tool layer**: a request like "make a #staff channel, staff-only" is routed to real skills that build channels/roles/panels, moderate, and configure the server. Tools are permission-tiered (`READ` / `MOD` / `ADMIN` / `OWNER`) — read-only tools are always allowed, and the high-impact ones are gated behind a Confirm/Cancel button preview, so nothing destructive runs on the model's say-so alone. The AI chat layer only replies when addressed (mention, its name, a reply, or a designated AI channel) — it never interjects into conversation unprompted. Separately, configured features post on their own triggers (live-stream go-live notifications, reminders, birthdays, scheduled messages, digests).

## Why

LLMs are fluent about work they didn't do. A model will happily write "created the role and locked #general" having called no tool, or having called one that errored. That's a nuisance in a chatbot; in a bot that can **ban, lock channels, rewrite permissions, and delete things**, it's a liability. doll treats "the AI can act" as a security problem and adds three guardrails:

- **Permission tiers** — read-only tools are always allowed; before any `MOD` / `ADMIN` / `OWNER` tool runs the router checks the *caller's* role, so "give me admin" from a non-admin is refused, not executed.
- **Confirm-gates** — server-wide locks, member prunes, granting server-wide permissions, revoking invites, and bulk builds post a preview and run nothing until a human clicks Confirm.
- **Honesty-about-actions prompt** — the system prompt's first rule is that words are not actions: doll may report something as done only if it called the tool *this turn* and the result confirmed success; otherwise it says the action failed, was denied, or is still awaiting confirmation.

The honest edge: the permission check and the confirm-gate are structural and hold. The *honesty* rule is a prompt, not a proof — see [Status / limitations](#status--limitations).

## Install

```bash
git clone https://github.com/insomniac-asif/doll-bot.git
cd doll-bot
npm install
```

Node **18+**, ESM (`"type": "module"`), discord.js **v14**. The nine npm dependencies are `discord.js`, `@discordjs/voice`, `@noble/ciphers`, `libsodium-wrappers`, `opusscript` (voice), `@napi-rs/canvas` (image rendering), `tesseract.js` (OCR), `tiktok-live-connector` (live notifications), and `dotenv`. Music additionally needs **`yt-dlp`** and **`ffmpeg`** on your `PATH` — these are external CLIs, not npm packages; if they're missing, everything except playback still works.

Configure with a `.env` (see `.env.example` for the full list):

| Variable | Needed for |
|----------|-----------|
| `DISCORD_TOKEN` | Required to start — the bot exits on boot without it |
| `DISCORD_CLIENT_ID` | Required for `npm run deploy` (slash-command registration), not to boot |
| `MISTRAL_API_KEY` | AI chat + natural-language tool-calling (primary provider) |
| `OPENAI_API_KEY` | Auto-moderation via the OpenAI Moderation API |
| `DEEPSEEK_API_KEY` | Fallback AI when Mistral errors or rate-limits (`PRIMARY_AI=deepseek` to flip) |
| `OWNER_ID` | Who doll DMs for alerts and owner-level approvals |
| `SPOTIFY_*`, `TWITCH_*`, `YOUTUBE_API_KEY`, `LASTFM_API_KEY`, `APIFY_*` | Optional: link resolution, go-live notifications, now-playing |

With no AI keys, chat and the tool layer are off but slash commands still work.

In the Discord Developer Portal, enable the **Server Members**, **Message Content**, and **Presence** privileged intents before inviting the bot — `src/index.js` requests all three, so leaving Presence off causes a disallowed-intents login failure.

## Quickstart

```bash
npm run deploy   # register slash commands (global commands take ~1h to propagate)
npm start        # or: npm run dev  — node --watch, restarts on file change
```

Then, in any server doll has joined (commands below are from the repo's command set; exact wizard flow may evolve):

- `/setup` — one-shot wizard: log channel, welcome channel, mod role, personality, automod level
- `/config`, `/feature` — tweak core settings and toggle verification, tickets, starboard, temp-voice, confessions, leveling
- `/panel verify`, `/panel ticket` — post the interactive button panels
- `/reactionrole create` / `link` / `unlink` — build reaction-role panels

Illustrative — a high-impact request never fires on the model's word alone:

```
you:  doll, lock down the whole server, we're getting raided
doll: i'm about to lock every text channel to staff-only.  [Confirm] [Cancel]
      (nothing's happened yet)
you:  *clicks Confirm*
doll: done — locked every text channel to staff-only.
```

And a caller without the rank is refused, not obeyed:

```
you:  give me the administrator permission
doll: only the server owner can authorize that.
```

## How it works

A message that looks like a request runs this pipeline:

```
message
  -> isManagementRequest()   // regex gate: action, or just chatter?
  -> aiProvider              // Mistral primary; DeepSeek fallback on error/429
  -> model picks tool(s)     // from the registered AI-tool (skill) surface
  -> checkToolPermission()   // READ always allowed; MOD / ADMIN / OWNER checked vs the caller's roles
  -> tool.confirm ?          // high-impact: post Confirm/Cancel preview, run nothing yet
  -> execute tool            // the only path that changes anything
  -> honest synthesis        // report only what a tool result confirmed this turn
```

- `src/features/toolRouter.js` — the management-request gate, permission checks, confirm-gating, execution, and the honesty rules injected into the system prompt.
- `src/features/aiProvider.js` — single source of truth for LLM calls; Mistral handles chat *and* tool-calling, DeepSeek is the fallback.
- `src/features/confirmations.js` — the Confirm/Cancel button flow for gated tools.
- `src/skills/*` — the tool implementations (channels, roles, members, moderation, invites, emojis, templates, music, …), each declaring its `permLevel` and whether it needs `confirm`.
- `src/data/servers/{guildId}.json` — per-guild config, personality, and feature toggles. Nothing is shared across guilds.

## Status / limitations

Early / single-operator project. Read these before trusting it with a real server:

- **No test framework.** There are two offline check scripts, not a suite. `smoke.mjs` (`npm run check`) import-checks every module under `src/commands`, `src/features`, `src/events`, `src/skills` and validates command shape — its recorded output reports 131 modules and 165 AI tools loading with 0 failures (I did not re-run it here). `test-routing.mjs` pins `isManagementRequest()` against **19** hand-written cases (17 positive, 2 negative). Neither exercises Discord, the AI providers, or the tools end-to-end — they catch broken imports and broken routing regex, not "the feature actually works."
- **Honesty is a prompt, not a proof.** The permission tier and confirm-gate are structural and hold. The don't-claim-what-you-didn't-do rule lives in the system prompt — a jailbreak or an unusual model turn can still make doll narrate an action it didn't take. The gates stop the *action*; they don't guarantee the *narration*.
- **Failure detection trusts the tool.** doll reports success/failure from what a tool returns; a tool that returns a misleading string can be reported wrong.
- **The request gate is regex.** `isManagementRequest()` is a curated pattern list; novel phrasings can miss the tool path and creative phrasings can trip it.
- **AI rides a free tier.** Normal operation uses Mistral's free tier; under load you'll hit rate limits and fall back to (paid) DeepSeek or degrade.
- **State is JSON on disk, per process.** Single-process, single-host design; not built for horizontal scaling or concurrent writers to the same `src/data/` tree.
- **Music depends on external CLIs.** `yt-dlp` breaks when sites change; if `yt-dlp`/`ffmpeg` aren't on `PATH`, playback silently no-ops while everything else runs.
- **Anti-nuke / audit attribution rely on Discord's audit log** within short windows and the View Audit Log permission; lag or bulk actions can show an unknown executor.

## License

MIT © 2026 insomniac-asif

---

*Part of a set of projects on agent reliability, honesty, and calibration — the "words are not actions" discipline here is the same idea applied to a bot that can actually change a live server.*
