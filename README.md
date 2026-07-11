# doll

**your mod bot says "done — locked the server and gave @bob the vip role." if it's lying about that, it's worse than a bot that just couldn't.**
doll is one bot for many discord servers: ai chat that does real admin work — permission-tiered, confirm-gated, and wired so it can only claim an action it actually took.

[![checks](https://img.shields.io/badge/checks-131_modules_%C2%B7_19%2F19_routing-brightgreen)](#checks)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-9-blue)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<p align="center">
  <img src="assets/demo.svg" alt="doll refuses an over-privileged action and only claims what a tool actually confirmed" width="720">
</p>

> One Node process serves many guilds. Each server gets its own JSON config, personality, and feature toggles — nothing is shared across servers, and doll only ever touches a guild it's been invited to. It replies only when addressed (mention, its name, a reply, or a designated AI channel); the one thing it does unprompted is alert the owner/admins.

---

## Why this exists

LLMs are fluent liars about their own work. The prose is not evidence — a model will happily write "created the role and locked #general" having called no tool at all, or having called one that errored. That's a nuisance in a chatbot. In a bot that can **ban, lock channels, rewrite role permissions, and delete things**, it's a liability.

So doll treats "the AI can act" as a security problem, not a feature, and builds in three guardrails:

- **Permission tiers** — every tool is tagged `MOD` / `ADMIN` / `OWNER`. The router checks the *caller's* role before a tool runs, so "give @me admin" from a non-admin gets refused, not executed.
- **Confirm-gates on the scary stuff** — locking the whole server, pruning members, granting server-wide permissions, revoking every invite, and bulk builds don't fire on the model's say-so. They post a Confirm/Cancel preview that spells out exactly what will change, and **nothing happens until a human clicks confirm.**
- **Honesty-about-actions prompt** — the system prompt's first rule is that *words are not actions*: doll may only report something as created/posted/assigned/deleted if it called the tool **this turn** and the result confirmed success. If a tool failed, was denied, or is still awaiting confirmation, it says so plainly.

The honest edge: this is prompt-and-plumbing discipline, not a proof. The permission check and the confirm-gate are structural and hold. The *honesty* rule is a prompt — a determined jailbreak, or a tool that returns a false-positive success string, can still get doll to narrate something wrong. See [Limitations](#limitations).

## Install

```bash
git clone https://github.com/insomniac-asif/doll-bot.git
cd doll-bot
npm install
```

Node **18+**, ESM (`"type": "module"`), discord.js v14. Music needs **`yt-dlp`** and **`ffmpeg`** on `PATH` (both are external CLIs, not npm deps — if they're missing, everything except playback still works).

## Configure

```bash
cp .env.example .env
# then edit .env
```

Required:

- `DISCORD_TOKEN` — bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
- `DISCORD_CLIENT_ID` — application id (same portal)
- `MISTRAL_API_KEY` — primary AI, [Mistral](https://console.mistral.ai/) (free tier)
- `OPENAI_API_KEY` — auto-moderation via the [OpenAI Moderation API](https://platform.openai.com/) (free, zero token cost)

Optional: `DEEPSEEK_API_KEY` (fallback AI when Mistral errors or 429s), `OWNER_ID` (who doll DMs for alerts/approvals), Twitch / YouTube / Last.fm keys for live-notify and now-playing, Spotify id/secret to resolve Spotify links to playable sources. See `.env.example` for the full list.

In the Developer Portal, enable the **Server Members** and **Message Content** privileged intents, then invite with (swap in your id):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=1505385702406&scope=bot%20applications.commands
```

## Run

```bash
npm run deploy   # register slash commands (globals take ~1h to propagate)
npm start        # or: npm run dev  (node --watch, restarts on file change)
```

Then, in any server doll has joined:

- `/setup` — one-shot wizard: log channel, welcome channel, mod role, personality, automod level
- `/config view` / `/config ai_channel` / `/config welcome_message` / `/config automod` — tweak core settings
- `/feature` — toggle verification, tickets, starboard, temp-voice, confessions, leveling
- `/panel verify` · `/panel ticket` — post the interactive button panels
- `/reactionrole create` · `link` · `unlink` — build reaction-role panels

Server configs are written to `src/data/servers/{guildId}.json`, auto-created on first interaction.

## Example: the confirm-gate in action

Illustrative — a big action never fires on the model's word alone:

```
you:  doll, lock down the whole server, we're getting raided
doll: i'm about to lock the entire server — no one but staff will be able to
      send messages in any channel.  [Confirm] [Cancel]
      (nothing's happened yet — hit confirm and i'll do it)
you:  *clicks Confirm*
doll: done — locked every text channel to staff-only. run /unlock or ask me to
      undo when it's over.
```

And a caller without the rank simply gets refused, not obeyed:

```
you:  give me the administrator permission
doll: only the server owner can authorize that.
```

## Commands

### Moderation
| Command | Description | Permission |
|---------|-------------|------------|
| `/kick @user [reason]` | Kick a member | Kick Members |
| `/ban @user [reason]` | Ban a member | Ban Members |
| `/unban <user_id> [reason]` | Unban by ID | Ban Members |
| `/mute @user <duration> [reason]` | Timeout a member | Moderate Members |
| `/unmute @user` | Remove timeout | Moderate Members |
| `/warn @user <reason>` | Warn a member | Moderate Members |
| `/clear <count>` | Bulk delete messages | Manage Messages |
| `/slowmode <seconds>` | Set channel slowmode | Manage Channels |
| `/lockdown` · `/unlock` | Lock/unlock a channel | Manage Channels |

### Setup & config
| Command | Description |
|---------|-------------|
| `/setup` | Server setup wizard |
| `/config` | View/edit core configuration |
| `/feature` | Configure verification, tickets, starboard, temp-voice, confessions, leveling |
| `/panel verify` · `/panel ticket` | Post interactive button panels |
| `/reactionrole create` · `link` · `unlink` | Build reaction-role panels |

### Engagement
| Command | Description |
|---------|-------------|
| `/rank` · `/leaderboard` | Leveling & XP |
| `/balance` · `/daily` · `/pay` · `/richest` · `/give-coins` | Economy |
| `/shop view/buy/add/remove` · `/inventory` | Server shop |
| `/giveaway start/end/reroll` | Giveaways |
| `/poll` | Reaction polls |
| `/remind <when> <text>` | Reminders |
| `/afk [reason]` | AFK status |
| `/birthday set/remove/list/channel` | Birthdays |
| `/confess <message>` | Anonymous confessions |
| `/vctime` · `/vcleaderboard` | Voice activity tracking |
| `/8ball` · `/coinflip` · `/roll` · `/ship` · `/roast` · `/compliment` | Fun |
| `/avatar` · `/userinfo` · `/serverinfo` | Info utilities |
| `/fm set/np` | Last.fm now-playing |

### Music
| Command | Description |
|---------|-------------|
| `/play` · `/skip` · `/stop` · `/pause` · `/resume` | Playback (yt-dlp + ffmpeg) |
| `/queue` · `/np` · `/volume` | Queue & controls |

### Cute (anime reactions, sanrio-soft theme)
| Command | Description |
|---------|-------------|
| `/hug /pat /cuddle /kiss /poke /tickle /highfive /handhold /feed /bonk /slap /bite /wave /peck` | Anime action GIFs at a user |
| `/blush /cry /happy /dance /pout /smug` | Mood GIFs |
| `/neko /waifu /kitsune` | Cute images |

### Games (OwO-style)
| Command | Description |
|---------|-------------|
| `/hunt` | Catch a critter by rarity |
| `/zoo` · `/sell` · `/battle` | Collection, selling for coins, battling |

### Live notifications & safety
| Command | Description |
|---------|-------------|
| `/social add/remove/list` | Twitch / YouTube / TikTok go-live alerts |
| `/antinuke enable/disable/punish/whitelist/status` | Raid & mass-action protection |

## Features

- **AI chat** — responds when mentioned or in designated channels (Mistral primary, DeepSeek fallback)
- **AI that acts** — beyond chat, natural-language requests ("make a #staff channel, staff-only") route through a tool layer that can build channels/roles/panels, moderate, and configure the server — behind the permission tiers and confirm-gates above
- **Auto-moderation** — scans messages via the OpenAI Moderation API (free)
- **Audit logging** — mod actions, edits, deletes, joins/leaves logged to a channel
- **Welcome system** — configurable welcome/leave messages and auto-role
- **Reaction roles** — embed panels with emoji → role mapping (custom emojis + GIFs)
- **Leveling** — per-message XP, level-up announcements, optional level roles
- **Economy** — balance, daily rewards, peer payments, leaderboard
- **Giveaways** — timed 🎉 giveaways with auto-draw and reroll
- **Tickets** — button-based private support tickets with staff-role access
- **Verification** — button gate that grants a verified role
- **Starboard** — highlights popular messages by star count
- **Temp voice** — join-to-create personal voice channels
- **Birthdays / reminders / polls / AFK / confessions** — community utilities
- **Music** — YouTube/SoundCloud playback via yt-dlp + ffmpeg, per-server queue
- **Live notifications** — Twitch/YouTube/TikTok go-live alerts that ping a role
- **Anti-nuke** — detects mass channel/role deletes & bans, alerts the owner, neutralizes the attacker
- **Owner forwarding** — doll DMs `OWNER_ID` and posts to a per-server alert channel for anything needing attention (including admin requests for owner-level actions, which get an approve/deny prompt)
- **Server lore & conversation vault** — saves notable moments as server lore and keeps a searchable long-term conversation vault, both toggleable per server
- **Applications** — build member-fillable forms (e.g. a staff application) that DM the questions and post submissions to a review channel
- **Cute pack** — anime reaction GIFs (nekos.best) + OwO-style critter game, themeable accent color
- **Per-server config** — each server gets independent settings stored as JSON

## How it works

A message that looks like a request runs this pipeline:

```
message
  -> isManagementRequest()      // regex gate: does this look like an action, not chatter?
  -> aiProvider                 // Mistral (free) primary; DeepSeek fallback on error/429
  -> model picks tool(s)        // from 165 registered AI tools
  -> checkToolPermission()      // MOD / ADMIN / OWNER tier vs the caller's roles
  -> tool.confirm ?             // if high-impact: post Confirm/Cancel preview, run nothing yet
  -> execute tool               // the ONLY way anything actually changes
  -> honest synthesis           // report only what a tool result confirmed this turn
```

- `src/features/toolRouter.js` — the brain: the management-request gate, permission checks, confirm-gating (`requestConfirmation`), execution, and the honesty rules injected into the system prompt.
- `src/features/aiProvider.js` — single source of truth for LLM calls. Mistral is primary for chat *and* tool-calling; DeepSeek only spends money when Mistral is unavailable. Flip with `PRIMARY_AI=deepseek`.
- `src/features/confirmations.js` — the Confirm/Cancel button flow for gated tools.
- `src/skills/*` — the tool implementations (channels, roles, members, moderation, invites, emojis, templates, music, …), each declaring its `permLevel` and whether it needs `confirm`.
- `src/data/servers/{guildId}.json` — per-guild config, personality, and feature toggles.

## Limitations

Read these before you trust it with a real server.

- **Honesty is a prompt, not a proof.** The permission tier and the confirm-gate are structural and hold. The *don't-claim-what-you-didn't-do* rule lives in the system prompt — a jailbreak or an unusual model turn can still make doll narrate an action it didn't take. The gates stop the *action*; they don't guarantee the *narration*.
- **Failure detection trusts the tool.** doll reports success/failure based on what a tool returns. A tool that returns a misleading string, or fails in a way it doesn't surface, can be reported wrong.
- **The management-request gate is regex.** `isManagementRequest()` is a curated pattern list. Novel phrasings can miss the tool path (treated as plain chat) and creative phrasings can trip it. `test-routing.mjs` pins 19 cases; it does not cover the whole surface.
- **AI quality depends on a free tier.** Normal operation rides Mistral's free tier; under load you'll hit rate limits and fall back to (paid) DeepSeek or degrade. No AI keys = chat and the tool layer are off, but slash commands still work.
- **Lots of in-flight state is JSON on disk, per process.** This is a single-process, single-host design. It is not built for horizontal scaling or concurrent writers to the same `src/data/` tree.
- **Music depends on external CLIs you have to keep current.** `yt-dlp` breaks when sites change; if `yt-dlp`/`ffmpeg` aren't on `PATH`, playback silently no-ops while everything else runs.
- **Anti-nuke and audit attribution rely on Discord's audit log** within short windows and the View Audit Log permission — lag or bulk actions can show an unknown executor.

## Checks

There is **no test framework and no test suite** here — just two ad-hoc scripts that catch the two most common ways a change breaks the build. Both run offline, no Discord login.

```bash
npm run check            # -> node smoke.mjs
node test-routing.mjs
```

- **`smoke.mjs`** imports every module under `src/commands`, `src/features`, `src/events`, `src/skills` and registers the skill layer. It fails if any import throws or a command has a bad shape. Latest run:

  ```
  [Skills] Loaded 165 AI tools

  Loaded 131 modules, 0 failure(s).
  ```

- **`test-routing.mjs`** asserts `isManagementRequest()` sends the right phrasings to the tool path and leaves plain chatter alone — 19 hand-written cases:

  ```
  19/19 passed
  ```

Honest edge: these are an import check and one pure-function check. Nothing exercises Discord, the AI providers, or the tools end-to-end. They catch "you broke an import" and "you broke the routing regex" — not "the feature actually works."

## Not included (by design)

Left out as personal-to-one-server: **Valorant integration** and **member presence/distress monitoring** (watching members' custom statuses for crisis keywords). Note that natural-language tool-calling ("doll, make a #staff channel"), server lore, the long-term conversation vault, and the staff-application flow are all present here — see [How it works](#how-it-works) and [Features](#features).

## Theme

doll defaults to a soft-pink accent (`accentColor` in each server's config) and ships a `cutesy` personality option (sanrio/frills/kitty-bunny energy) — set it via `/setup`. She replies only when addressed and never inserts herself into chatter; her only proactive message is an alert to the owner/admins.

## Development

```bash
npm run dev    # node --watch, auto-restart on file changes
npm run check  # smoke-import every module before deploying
```

## License

MIT © 2026 insomniac-asif
