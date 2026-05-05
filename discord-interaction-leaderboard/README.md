# Discord Interaction Leaderboard

Export-based leaderboard generator for Cozy Devs Discord interaction scoring.

The live Discord pull is blocked until a channel/message source is supplied. This project still performs the requested work as far as the local environment allows: it computes an interaction leaderboard from Discord JSON or CSV exports, produces Markdown/JSON/CSV outputs, and writes a static homepage that Discord can screenshot.

## Scoring

Total score is:

- messages: `1.00` point each
- replies sent: `1.25` points each
- mentions received: `1.00` point each
- reactions received: `0.75` points each
- reactions given: `0.25` points each
- vibes bonus: small clearly labeled bonus, capped at `2.00` points per user

The vibes bonus is intentionally low weight. It rewards supportive words such as `thanks`, `love`, `great`, `ship`, `helpful`, and similar terms without dominating the interaction score.

## Run

```sh
npm run sample
```

Or use a real export:

```sh
node scripts/interaction-leaderboard.mjs --input /path/to/messages.json --out-dir output
```

Supported inputs:

- DiscordChatExporter-style JSON with a top-level `messages` array
- JSON arrays of message objects
- CSV with common columns such as `author`, `authorId`, `content`, `timestamp`, `mentions`, `reactions`, `replyTo`

## Outputs

- `output/leaderboard.md`
- `output/leaderboard.json`
- `output/leaderboard.csv`
- `public/leaderboard-data.js`
- `reports/live-status.md`

Homepage path for screenshot use:

```text
/Users/binkyfishai/milady-fisbat/discord-interaction-leaderboard/public/index.html
```

## Live Blocker

Current blocker: this workspace did not include a Discord export, channel ID, guild ID, or message history source. The local bot config confirms a Discord token exists, but no channel/guild target was available and secrets were not exposed.
