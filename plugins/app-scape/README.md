# @elizaos/app-scape

First-class agent integration for **xRSPS** — the TypeScript OSRS private
server at [xrsps-typescript](https://github.com/xrsps/xrsps-typescript).

## What this plugin does

`'scape` turns a running xRSPS instance into an autonomous-agent playground
for the milady runtime. When you click **'scape** in the apps launcher:

1. The viewer iframe loads the xRSPS React client (default
   `http://localhost:3000`, override with `SCAPE_CLIENT_URL`) so you can
   watch what's happening in the game world in real time.
2. The plugin's `ScapeGameService` connects to xRSPS's **bot-SDK**
   endpoint — a TOON-encoded WebSocket at `ws://127.0.0.1:43595` — and
   spawns a first-class agent-player account using the same scrypt auth
   + save-file persistence that human logins use.
3. The milady LLM runtime drives the agent via the action list (walk,
   fight, chat, skill, bank, ...) every N seconds, with optional
   directed prompts from the operator UI.

## Why "first-class citizen"?

The agent isn't a scripted bot glued on top of the client protocol. It's
a `PlayerState` in the xRSPS world with an optional `AgentComponent`
attached — same tick loop, same combat rules, same autosave, same
visibility to human players. Human and agent logins share the *exact*
same account store, save file, and code path. The only differences are:

- Agents talk over TOON frames on port 43595 instead of the binary
  protocol on 43594.
- Agents carry an `AgentComponent` on their `PlayerState` that holds
  perception snapshots, action queues, journal refs, and goals.

This is the first step toward turning xRSPS into an ECS-for-agents.

## Protocol

Agents speak **TOON** (Token-Oriented Object Notation,
`@toon-format/toon`) — a format optimized for LLM token efficiency,
typically 40–60% cheaper than JSON for the kinds of state snapshots an
agent loop emits every few seconds. The full frame reference lives in
the xRSPS server at
[`server/src/network/botsdk/BotSdkProtocol.ts`](https://github.com/xrsps/xrsps-typescript/blob/main/server/src/network/botsdk/BotSdkProtocol.ts).

## Env vars

| Variable              | Default                     | Purpose                                          |
|-----------------------|-----------------------------|--------------------------------------------------|
| `SCAPE_CLIENT_URL`    | `http://localhost:3000`     | xRSPS client URL the viewer iframe points at.   |
| `SCAPE_BOT_SDK_URL`   | `ws://127.0.0.1:43595`      | bot-SDK WebSocket endpoint on the xRSPS server. |
| `SCAPE_BOT_SDK_TOKEN` | *(unset → plugin disabled)* | Shared secret matching xRSPS `BOT_SDK_TOKEN`.   |
| `SCAPE_AGENT_NAME`    | `scape-agent`               | In-game display name for the agent.              |
| `SCAPE_AGENT_PASSWORD`| *(unset → plugin disabled)* | Plaintext password for the agent's account.     |
| `SCAPE_LOOP_INTERVAL_MS` | `15000`                  | Autonomous LLM step interval.                    |
| `SCAPE_MODEL_SIZE`    | `TEXT_SMALL`                | milady model tier for the loop.                  |

## Scope by PR

- **PR 2 (this):** Plugin skeleton, curated-registry entry, viewer route
  embedding the xRSPS client. No agent loop yet.
- **PR 3:** Bot-SDK client (`sdk/`) + connection manager + empty game
  service. Plugin connects to xRSPS and logs `agent spawned`, but
  doesn't do anything afterward.
- **PR 4:** First LLM loop + 5 actions + 3 providers. Watch the agent
  walk itself one tile at a time based on model output.
- **PR 5:** Full action toolbelt (~25 actions), world-knowledge
  provider, skill data.
- **PR 6:** Scape Journal — persistent memory/goals/progress.
- **PR 7:** Operator-directed prompts via `POST /api/apps/scape/prompt`.
- **PR 8:** Docs, deployment guide, end-to-end verification.
