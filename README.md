# Disc Bot

A feature-rich Discord bot MVP. No database — everything persistent is a **text file** under `data/`.

Slash commands are first-class. Chat still earns XP, trips automod, and drives welcome/AFK/starboard.

## Quick start

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications).
2. Bot tab → **Reset Token** → copy it.
3. Bot tab → enable these **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent
4. OAuth2 → URL Generator → scopes `bot` + `applications.commands` → grant Administrator (or the permissions listed below) → open the URL and invite the bot.
5. Copy `.env.example` to `.env` and fill it in.

```bash
cp .env.example .env
npm install
npm start
```

`DISCORD_GUILD_ID` is optional. Set it while developing so slash commands appear instantly in that server. Leave it empty to register commands globally (can take up to an hour the first time).

## What you get

### Utility
`/ping` `/help` `/userinfo` `/serverinfo` `/avatar` `/botinfo` `/invite` `/uptime` `/poll` `/remind` `/math` `/choose` `/say` `/announce` `/membercount`

### Moderation
`/kick` `/ban` `/unban` `/softban` `/timeout` `/untimeout` `/warn` `/warnings` `/clearwarns` `/purge` `/slowmode` `/lock` `/unlock` `/nickname` `/role` `/modlog`

### Economy
`/balance` `/daily` `/work` `/crime` `/deposit` `/withdraw` `/pay` `/gamble` `/slots` `/rob` `/shop` `/buy` `/inventory` `/use` `/baltop`

### Levels
Chat XP with a 60s cooldown. `/rank` `/levels` `/setxp`

### Fun
`/8ball` `/coinflip` `/dice` `/rps` `/joke` `/fact` `/compliment` `/roast` `/ship` `/rate` `/fortune` `/wyr` `/trivia` `/how` `/reverse` `/emojify`

### Social
`/afk` `/snipe` `/editsnipe` `/suggest` `/suggestion` `/tag` `/quote` `/note` `/todo` `/suggestchannel`

### Tickets & giveaways
`/ticket setup|close|add` with a button panel. Closing writes a `.txt` transcript.

`/giveaway start|end|reroll` with an enter button.

### Config
`/config` `/welcome` `/autorole` `/automod` `/starboard`

## Storage map

Shipped content (edit freely, one line per entry, `#` comments ignored):

| File | Used by |
| --- | --- |
| `data/content/jokes.txt` | `/joke` |
| `data/content/facts.txt` | `/fact` |
| `data/content/fortunes.txt` | `/fortune` |
| `data/content/eightball.txt` | `/8ball` |
| `data/content/compliments.txt` | `/compliment` |
| `data/content/roasts.txt` | `/roast` |
| `data/content/wouldyourather.txt` | `/wyr` |
| `data/content/work.txt` | `/work` |
| `data/content/crime-win.txt` `/crime-fail.txt` | `/crime` |
| `data/content/quotes.txt` | fallback `/quote random` |
| `data/content/badwords.txt` | automod defaults |
| `data/content/shop.json` | `/shop` `/buy` `/use` |
| `data/content/trivia.json` | `/trivia` |

Runtime files are created on first use in `data/runtime/` (gitignored):

- `guilds.json` — per-server config
- `economy.json` `levels.json` `warnings.json`
- `tags.json` `quotes.json` `suggestions.json`
- `tickets.json` `giveaways.json` `reminders.json`
- `notes.json` `todos.json` `afk.json` `polls.json` `starboard.json`
- `badwords-<guildId>.txt` — extra automod words
- `logs/<guildId>.txt` — moderation audit trail
- `transcripts/<channelId>.txt` — closed ticket logs

JSON is still just text. You can open any of these in a normal editor.

## Permissions

Minimum useful set if you do not want Administrator:

- Manage Channels, Manage Roles, Manage Nicknames
- Kick Members, Ban Members, Moderate Members, Manage Messages
- Read Message History, Embed Links, Add Reactions, Send Messages
- View Channels, Use Application Commands

## Scripts

```bash
npm start      # run the bot
npm run dev    # restart on file changes
npm run typecheck
```

## Notes

- Economy, levels, warnings, tags, and quotes are **per server**.
- Notes, todos, and shop inventory live on the user (inventory is still per-server).
- Reminders and giveaways are polled every 10 seconds.
- Starboard listens for ⭐ reactions.
- Prefix commands only hint at the slash version. Configure the prefix with `/config prefix`.
