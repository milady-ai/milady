# `@elizaos/app-scape` — Deployment Guide

This document covers running the 'scape plugin end-to-end in both dev
(localhost xRSPS + localhost milady) and production (hosted xRSPS +
milady runtime somewhere else). For architecture and protocol
reference, see `README.md` and the upstream xRSPS
`docs/agent-endpoint.md`.

## What you need

1. **xRSPS running somewhere**, with the bot-SDK endpoint enabled:
   - `BOT_SDK_TOKEN` set in the environment
   - Port 43595 reachable from wherever the milady runtime runs
2. **The React client running** (default `http://localhost:3000`),
   reachable from wherever a human is going to watch the agent play
3. **milady runtime** with this plugin installed (it already is if
   you're in this repo — `plugins/app-scape/` is a workspace package)

## Environment variables

The plugin reads settings from:

1. `runtime.getSetting(KEY)` — via character secrets in milady
2. `process.env[KEY]` — via shell or systemd unit
3. Hardcoded defaults (only for localhost dev)

| Variable                   | Default                         | Purpose                                                                                              |
|----------------------------|----------------------------------|------------------------------------------------------------------------------------------------------|
| `SCAPE_CLIENT_URL`         | `http://localhost:3000`          | URL the viewer iframe points at. Change this to your hosted xRSPS client URL in production.        |
| `SCAPE_BOT_SDK_URL`        | `ws://127.0.0.1:43595`           | WebSocket URL of the xRSPS bot-SDK endpoint. Must be reachable from the milady runtime host.        |
| `SCAPE_BOT_SDK_TOKEN`      | *(unset → plugin disabled)*      | Must match the xRSPS server's `BOT_SDK_TOKEN`. Without it, ScapeGameService logs a warning and stops. |
| `SCAPE_AGENT_NAME`         | `scape-agent`                    | In-game display name for the agent. Used as the account username (scrypt-auth).                    |
| `SCAPE_AGENT_PASSWORD`     | *(unset → plugin disabled)*      | Plaintext password for the agent's account. Auto-registers on first spawn, verified on reconnects. |
| `SCAPE_AGENT_ID`           | `scape-${SCAPE_AGENT_NAME}`      | Stable identifier for the agent across reconnects. Used as the journal filename.                   |
| `SCAPE_AGENT_PERSONA`      | *(empty)*                        | Short persona string fed into the LLM's system prompt. Keep it under 200 chars.                    |
| `SCAPE_LOOP_INTERVAL_MS`   | `15000`                          | How often the autonomous LLM loop fires. Lower = more expensive.                                    |
| `SCAPE_MODEL_SIZE`         | `TEXT_SMALL`                     | Which elizaOS model tier to use. Try `TEXT_NANO` for cheaper or `TEXT_LARGE` for smarter output.   |

## Dev loop (single host)

Assumes xRSPS and milady are both running on your laptop.

```bash
# Terminal 1 — xRSPS
cd ~/xrsps-typescript
export BOT_SDK_TOKEN=dev-secret
bun run dev
```

`bun run dev` launches server + React client + a placeholder
`agent-dev.ts` random-walk loop in a unified mprocs TUI. You can
watch all three tabs with `Ctrl-A` + arrow keys.

```bash
# Terminal 2 — milady
cd ~/milady
export SCAPE_BOT_SDK_TOKEN=dev-secret
export SCAPE_AGENT_PASSWORD=my-dev-password
bun run dev  # or however you start milady
```

The plugin connects, auto-registers `scape-agent` as a real account
on first run, and starts its autonomous loop. The journal file appears
at `~/.milady/scape-journals/scape-scape-agent.toon` (TOON-encoded,
not JSON).

Click the 'scape tile in the milady apps grid and the viewer iframe
loads the xRSPS React client at `http://localhost:3000`. Log in with
any username + an 8+-character password; you're now in the same world
as the agent and can watch it play. Type `::steer <directive>` in
public chat to hand it a high-priority goal.

## Production deployment

### 1. Deploy xRSPS with TLS

Follow `xrsps-typescript/docs/deployment.md` for the Caddy reverse
proxy setup. Your xRSPS server ends up at `wss://game.yourdomain.com`
(binary client) and optionally a second subdomain for the bot-SDK.

**Important**: the bot-SDK endpoint is separate from the main game
port and should be firewalled to only the milady runtime host. Do
NOT expose 43595 to the public internet.

### 2. Host the React client

The xRSPS client is a CRA build. Host `build/` on any static host
(Vercel, Netlify, Cloudflare Pages, a second Caddy site). Remember
that the client needs `REACT_APP_WS_URL` set at build time to point
at your xRSPS game server, not localhost.

### 3. Configure milady

In your milady character's secrets or the milady runtime env:

```bash
SCAPE_CLIENT_URL=https://game-client.yourdomain.com
SCAPE_BOT_SDK_URL=wss://game.yourdomain.com:43595
SCAPE_BOT_SDK_TOKEN=<same secret as xrsps BOT_SDK_TOKEN>
SCAPE_AGENT_NAME=your-agent-name
SCAPE_AGENT_PASSWORD=<strong password, ≥12 chars>
SCAPE_LOOP_INTERVAL_MS=15000
```

### 4. Verify

From the milady runtime host:

```bash
# HTTP ping: POST a directive to the agent
curl -X POST https://your-milady-host/api/apps/scape/prompt \
  -H "Content-Type: text/toon" \
  -d 'text: mine copper ore near Lumbridge'

# Read the journal
curl https://your-milady-host/api/apps/scape/journal

# Read goals
curl https://your-milady-host/api/apps/scape/goals
```

And from inside the game as a human player:

```
::steer greet the nearest player
```

The next LLM step should honor the directive.

## Operational tips

- **Journal backups**: `~/.milady/scape-journals/*.toon` is the
  agent's long-term memory. Back it up alongside xRSPS
  `accounts.json` and `player-state.json`.
- **Multiple agents**: spin up multiple milady characters, give each
  a different `SCAPE_AGENT_NAME` + `SCAPE_AGENT_ID`. They get
  separate journals and separate player accounts in xRSPS.
- **Swap models mid-session**: set `SCAPE_MODEL_SIZE=TEXT_LARGE`
  when you want the agent to be smart for a particular task (e.g.
  deep exploration). Drop back to `TEXT_SMALL` for grinding.

## Verify scripts

The plugin ships 7 verify scripts, all in `plugins/app-scape/scripts/`:

| Script                   | What it proves                                                                |
|--------------------------|-------------------------------------------------------------------------------|
| `verify-pr2.ts`          | Plugin loads, metadata shape is correct, curated registry lookup works       |
| `verify-pr3.ts`          | TOON codec round-trips, BotSdk/BotManager API shape, live connect+spawn+perception |
| `verify-pr4.ts`          | Autonomous loop scaffolding, providers render TOON, param parser             |
| `verify-pr4-live-loop.ts`| Full end-to-end LLM step via stub runtime — agent visibly moves              |
| `verify-pr5.ts`          | All 5 world actions (walkTo, chat, attack, drop, eat) work + negative paths  |
| `verify-pr6.ts`          | Journal TOON persistence, memory prune-by-weight, goal lifecycle             |
| `verify-pr7.ts`          | HTTP routes (POST /prompt, GET /journal, GET /goals) accept TOON             |
| `verify-pr7-live.ts`     | Real ScapeGameService + xRSPS + HTTP POST → operator goal → journal         |

And xrsps ships two verify scripts in `scripts/`:

| Script                   | What it proves                                                                |
|--------------------------|-------------------------------------------------------------------------------|
| `test-botsdk.ts`         | xRSPS bot-SDK auth + scrypt register + position persistence round-trip      |
| `test-steer.ts`          | Full `::steer` cross-repo flow: human chat → broadcast → agent receives     |
