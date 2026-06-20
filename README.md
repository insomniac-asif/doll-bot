# Doll

Discord server management, moderation, and AI chat bot. One instance, multiple servers.

## Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/insomniac-asif/doll-bot.git
   cd doll-bot
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your tokens
   ```

   Required:
   - `DISCORD_TOKEN` — Bot token from [Discord Developer Portal](https://discord.com/developers/applications)
   - `DISCORD_CLIENT_ID` — Application ID from the same portal
   - `MISTRAL_API_KEY` — From [Mistral AI](https://console.mistral.ai/)
   - `OPENAI_API_KEY` — From [OpenAI](https://platform.openai.com/) (moderation API is free)

   Optional:
   - `DEEPSEEK_API_KEY` — Fallback AI provider

3. **Register slash commands**
   ```bash
   npm run deploy
   ```
   Global commands take up to 1 hour to propagate to all servers.

4. **Start the bot**
   ```bash
   npm start
   ```

## Discord Bot Setup

When creating your bot in the Discord Developer Portal:

- Enable these **Privileged Gateway Intents**:
  - Server Members Intent
  - Message Content Intent
- Use this **OAuth2 invite URL** (replace `CLIENT_ID`):
  ```
  https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=1505385702406&scope=bot%20applications.commands
  ```

## Server Configuration

Once the bot is in your server:

- `/setup` — Initial configuration (log channel, welcome channel, mod role, personality, automod level)
- `/config view` — See current settings
- `/config ai_channel` — Toggle AI chat channels
- `/config welcome_message` — Customize welcome message
- `/config automod` — Enable/disable auto-moderation

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

### Setup & Config
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

- **AI Chat** — Responds when mentioned or in designated channels (Mistral API, DeepSeek fallback)
- **Auto-Moderation** — Scans messages via OpenAI Moderation API (free, zero cost)
- **Audit Logging** — Mod actions, edits, deletes, joins/leaves logged to a channel
- **Welcome System** — Configurable welcome/leave messages and auto-role
- **Reaction Roles** — Embed panels with emoji → role mapping (custom emojis + GIFs)
- **Leveling** — Per-message XP, level-up announcements, optional level roles
- **Economy** — Balance, daily rewards, peer payments, leaderboard
- **Giveaways** — Timed 🎉 giveaways with auto-draw and reroll
- **Tickets** — Button-based private support tickets with staff role access
- **Verification** — Button gate that grants a verified role
- **Starboard** — Highlights popular messages by star count
- **Temp Voice** — Join-to-create personal voice channels
- **Birthdays / Reminders / Polls / AFK / Confessions** — Community utilities
- **Per-Server Config** — Each server gets independent settings stored as JSON

- **Music** — YouTube/SoundCloud playback via yt-dlp + ffmpeg, per-server queue
- **Live notifications** — Twitch/YouTube/TikTok go-live alerts that ping a role
- **Anti-nuke** — detects mass channel/role deletes & bans, alerts the owner, neutralizes the attacker
- **Owner forwarding** — Doll DMs `OWNER_ID` and posts to a per-server alert channel for anything needing attention
- **Cute pack** — anime reaction GIFs (nekos.best) + OwO-style critter game, themeable accent color
- **Per-Server Config** — each server gets independent settings stored as JSON

Run `npm run check` to verify all modules load before deploying.

## Theme

Doll defaults to a soft-pink accent (`accentColor` in each server's config) and ships
a `cutesy` personality option (sanrio/frills/kitty-bunny energy) — set it via `/setup`.
She replies only when addressed (mention, her name, a reply to her, or a designated AI
channel) and never inserts herself into chatter; her only proactive message is an alert
to the owner/admins.

## Not Included (by design)

Left out as personal-to-one-server or against Doll's slash-command design: AI
tool-calling/skills ("doll play X" natural language), lore/vault memory, Valorant
integration, staff-application flow, and presence watching.

## Development

```bash
npm run dev    # Start with --watch (auto-restart on file changes)
```

Server configs are stored in `src/data/servers/{guildId}.json` and auto-created on first interaction.
