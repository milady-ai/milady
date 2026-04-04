# Milady Architecture Plan: Connector-First Design

> **Goal:** Milady reaches "OpenClaw level" — the agent is always-on, headless-first, and users interact primarily through connectors (Discord, Telegram, Signal, etc.). The Vite frontend handles ONLY the VRM/companion experience. Everything else flows through connectors and the API.

**Date:** 2026-03-30
**Status:** Draft

---

## 1. Current State Assessment

### 1.1 Repository Structure

```
milady/
├── apps/
│   ├── app/          # Vite frontend (VRM companion, settings UI, onboarding)
│   ├── home/         # Home dashboard
│   └── homepage/     # Marketing site
├── packages/
│   ├── agent/        # Core runtime — THE BRAIN (5,385 lines in eliza.ts alone)
│   ├── app-core/     # Shared UI/API logic between apps
│   ├── autonomous/   # Built dist of agent (pre-compiled)
│   ├── shared/       # @miladyai/shared utilities
│   ├── types/        # TypeScript types
│   ├── ui/           # Shared UI components
│   ├── vrm-utils/    # VRM/3D avatar utilities
│   ├── plugin-bnb-identity/   # BSC/BNB chain identity
│   ├── plugin-streaming-base/ # Streaming infrastructure
│   └── plugin-wechat/         # WeChat connector (custom)
├── plugins.json      # ElizaOS plugin registry (221KB, hundreds of plugins)
├── milady.mjs        # CLI entry point → dist/entry.js
└── deploy/           # Deployment configs
```

### 1.2 Runtime Architecture

**Entry flow:** `milady.mjs` → `dist/entry.js` → `packages/agent/src/runtime/eliza.ts`

The runtime (`eliza.ts`, 5,385 lines) handles:
1. Config loading from `~/.eliza/eliza.json`
2. First-time onboarding (interactive CLI or headless for GUI)
3. Connector secrets → `process.env` injection (`applyConnectorSecretsToEnv`)
4. Plugin resolution via `CHANNEL_PLUGIN_MAP` and `OPTIONAL_PLUGIN_MAP`
5. `AgentRuntime` creation from `@elizaos/core`
6. HTTP server start (`packages/agent/src/api/server.ts`, 19,964 lines)

**Headless mode exists** (`startEliza({ headless: true })`) — the runtime CAN run without UI. This is the critical foundation for connector-first design.

### 1.3 Connector State

**Supported connectors (CHANNEL_PLUGIN_MAP):**

| Connector | Plugin Package | Installed Locally | Status |
|-----------|---------------|-------------------|--------|
| Discord | `@elizaos/plugin-discord` | ✅ Yes | Ready to use |
| Telegram | `@elizaos/plugin-telegram` | ✅ Yes | Ready to use |
| WhatsApp | `@elizaos/plugin-whatsapp` | ✅ Yes | QR pairing built |
| Signal | `@elizaos/plugin-signal` | ❌ (internal, `@elizaos/signal-native`) | QR pairing built |
| Slack | `@elizaos/plugin-slack` | ❌ Not installed | Available in registry |
| Twitter/X | `@elizaos/plugin-twitter` | ❌ Not installed | Available in registry |
| iMessage | `@elizaos/plugin-imessage` | ❌ | macOS only |
| BlueBubbles | `@elizaos/plugin-bluebubbles` | ❌ | macOS only |
| Farcaster | `@elizaos/plugin-farcaster` | ❌ | Available |
| Lens | `@elizaos/plugin-lens` | ❌ | Available |
| MS Teams | `@elizaos/plugin-msteams` | ❌ | Available |
| Mattermost | `@elizaos/plugin-mattermost` | ❌ | Available |
| Google Chat | `@elizaos/plugin-google-chat` | ❌ | Available |
| Feishu/Lark | `@elizaos/plugin-feishu` | ❌ | Available |
| Matrix | `@elizaos/plugin-matrix` | ❌ | Available |
| Nostr | `@elizaos/plugin-nostr` | ❌ | Available |
| Twitch | `@elizaos/plugin-twitch` | ❌ | Available |

**Connector enablement mechanism:**
- Config at `config.connectors.<name>` (or legacy `config.channels.<name>`)
- Runtime iterates connectors config, maps to plugin via `CHANNEL_PLUGIN_MAP`
- Plugin dynamically loaded and added to `pluginsToLoad` set
- Secrets injected into `process.env` before plugin init

**Connector health monitoring:**
- `ConnectorHealthMonitor` class (`packages/agent/src/api/connector-health.ts`)
- Checks every 60s if configured connectors have their plugin loaded
- Broadcasts WebSocket warnings on status transitions
- Maps: discord, telegram, twitter, slack, farcaster

**Signal-specific infrastructure:**
- `packages/agent/src/services/signal-pairing.ts` — QR-based device linking
- `packages/agent/src/api/signal-routes.ts` — `/api/signal/pair`, `/api/signal/status`, `/api/signal/pair/stop`, `/api/signal/disconnect`
- Config auto-saved on successful pairing

**WhatsApp-specific infrastructure:**
- `packages/agent/src/services/whatsapp-pairing.ts` — QR-based linking
- `packages/agent/src/api/whatsapp-routes.ts` — pairing API routes

**Telegram-specific infrastructure:**
- `packages/agent/src/config/telegram-custom-commands.ts` — custom command registration
- Supports custom `/commands` with validation

### 1.4 API Surface

The API server (`packages/agent/src/api/server.ts`, ~20K lines) exposes:

**Core:**
- `/api/health`, `/api/status`, `/api/runtime` — health & status
- `/api/onboarding/status`, `/api/onboarding/options`, `/api/onboarding` — first-run setup

**Agent Management:**
- `/api/provider/switch` — switch LLM provider
- `/api/agent/reset` — reset agent
- `/api/secrets` (GET/PUT) — manage API keys

**Plugins & Skills:**
- `/api/plugins` — list plugins
- `/api/plugins/install`, `/api/plugins/uninstall` — manage plugins
- `/api/plugins/installed`, `/api/plugins/ejected` — plugin state
- `/api/plugins/core`, `/api/plugins/core/toggle` — core plugin management
- `/api/skills/catalog`, `/api/skills/catalog/search`, `/api/skills/catalog/install`, `/api/skills/catalog/uninstall`

**Knowledge:**
- `/api/memory/*`, `/api/context/quick` — memory/knowledge operations

**Wallet:**
- `/api/wallet/keys`, `/api/wallet/nfts`, `/api/wallet/os-store` (GET/POST)
- `/api/wallet/steward-status`, `/api/wallet/steward-policies` (GET/PUT)
- `/api/wallet/steward-tx-records`, `/api/wallet/steward-pending-approvals`
- `/api/wallet/steward-approve-tx`, `/api/wallet/steward-deny-tx`
- `/api/wallet/steward-webhook`, `/api/wallet/steward-webhook-events`
- `/api/wallet/steward-sign`, `/api/wallet/steward-addresses`, `/api/wallet/steward-balances`

**Character:**
- `/api/character/*` — character configuration routes (via `character-routes.ts`)

**Training:**
- `/api/training/*` — training/fine-tuning routes

**Signal/WhatsApp:**
- `/api/signal/*` — Signal pairing/management
- `/api/whatsapp/*` — WhatsApp pairing/management (inferred from route file)

**Other:**
- `/api/coding-agents/*` — coding agent integration
- `/api/cloud/*` — ElizaCloud integration
- Streaming, TTS, diagnostics routes

### 1.5 Plugin Ecosystem

**Installed ElizaOS plugins (root `package.json`):**
- `@elizaos/core` — runtime core
- `@elizaos/plugin-agent-orchestrator` — multi-agent
- `@elizaos/plugin-agent-skills` — skill system
- `@elizaos/plugin-anthropic` — Claude models
- `@elizaos/plugin-cron` — scheduled tasks
- `@elizaos/plugin-edge-tts` — TTS
- `@elizaos/plugin-elizacloud` — cloud integration
- `@elizaos/plugin-evm` — EVM wallet/tx
- `@elizaos/plugin-experience` — experience/learning
- `@elizaos/plugin-form` — form handling
- `@elizaos/plugin-google-genai` — Gemini
- `@elizaos/plugin-knowledge` — RAG/knowledge
- `@elizaos/plugin-local-embedding` — local embeddings
- `@elizaos/plugin-ollama` — local LLMs
- `@elizaos/plugin-openai` — OpenAI models
- `@elizaos/plugin-openrouter` — OpenRouter
- `@elizaos/plugin-pdf` — PDF ingestion
- `@elizaos/plugin-personality` — personality system
- `@elizaos/plugin-plugin-manager` — runtime plugin management
- `@elizaos/plugin-rolodex` — contacts
- `@elizaos/plugin-secrets-manager` — secrets
- `@elizaos/plugin-shell` — shell access
- `@elizaos/plugin-sql` — database
- `@elizaos/plugin-telegram` — Telegram connector
- `@elizaos/plugin-todo` — task management
- `@elizaos/plugin-trajectory-logger` — action logging
- `@elizaos/plugin-trust` — trust scoring
- `@elizaos/plugin-whatsapp` — WhatsApp connector
- `@elizaos/plugin-discord` — Discord connector
- `@stwd/eliza-plugin` — Steward wallet management
- `@stwd/sdk` — Steward SDK

### 1.6 Self-Awareness System

A layered awareness system exists (`packages/agent/src/contracts/awareness.ts`):
- `AwarenessContributor` interface with `summary()` (≤80 chars, injected every LLM turn) and `detail()` (brief/full)
- Contributors: runtime, permissions, wallet, provider, pluginHealth, **connectors**, cloud, features
- Connectors contributor (`packages/app-core/src/awareness/contributors/connectors.ts`) reports active channels
- Cache with TTL + event-based invalidation

### 1.7 Signing Policy / Steward

- `@stwd/eliza-plugin` — Steward wallet management plugin for ElizaOS
- `@stwd/sdk` — Steward SDK
- Full signing policy engine (`packages/agent/src/services/signing-policy.ts`):
  - Chain/contract/value/rate/method/replay rules
  - Human confirmation thresholds
  - Per-hour and per-day rate limits
- Full Steward API surface: policies, balances, addresses, tx approval/denial, webhooks

### 1.8 Character/VRM System

- VRM models: `apps/app/characters/` — Chen, Jin, Kei, Momo, Rin, Ryu, Satoshi, Yuki
- Character schema: `packages/agent/src/config/character-schema.ts`
- Character routes: `packages/agent/src/api/character-routes.ts`
- VRM utilities: `packages/vrm-utils/`
- Desktop 3D avatar with Three.js/Spark integration

### 1.9 What Works Today

✅ Agent runtime starts headless
✅ Discord, Telegram, WhatsApp connectors available via ElizaOS plugins
✅ Signal pairing via QR code with dedicated API routes
✅ Full wallet/Steward API
✅ Plugin install/uninstall at runtime
✅ Knowledge/memory management
✅ Connector health monitoring
✅ Self-awareness system with connector status
✅ Character configuration API
✅ Signing policy engine
✅ TTS/voice support
✅ Multi-model provider support

### 1.10 What's Missing for Connector-First

❌ **No command framework for connectors** — connectors are chat-only, no `/config`, `/balance`, `/learn` etc.
❌ **No connector-native admin interface** — all configuration requires the web UI
❌ **No headless-first deployment mode** — startup assumes UI will handle onboarding
❌ **No connector authentication/authorization** — who can run admin commands?
❌ **No cross-connector message routing** — messages stay in their connector silo
❌ **No connector-initiated wallet operations** — wallet ops only via API/UI
❌ **No connector-initiated knowledge management** — knowledge only via API/UI
❌ **No connector-initiated plugin management** — plugin ops only via API/UI
❌ **Server.ts is a 20K-line monolith** — hard to maintain, test, or extend
❌ **VRM companion tightly coupled to agent process** — can't run VRM viewer independently

---

## 2. Target Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────┐
│                   MILADY AGENT                       │
│                  (headless core)                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ ElizaOS  │  │ Plugin   │  │ Command Router   │  │
│  │ Runtime  │  │ Manager  │  │ (new)            │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                  │            │
│  ┌────┴──────────────┴──────────────────┴────────┐  │
│  │              Unified Message Bus               │  │
│  │         (events, commands, responses)          │  │
│  └────┬──────┬───────┬───────┬───────┬───────────┘  │
│       │      │       │       │       │              │
│  ┌────┴┐ ┌──┴──┐ ┌──┴──┐ ┌─┴───┐ ┌─┴──┐          │
│  │ API │ │ WS  │ │ DB  │ │Wallet│ │Know│          │
│  │ HTTP│ │     │ │     │ │/Stwd │ │ledge│          │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘          │
└───────────┬──────────┬──────────┬───────────────────┘
            │          │          │
     ┌──────┴──┐  ┌───┴────┐  ┌─┴────────┐
     │Connector│  │Connector│  │Connector │
     │ Discord │  │Telegram │  │ Signal   │
     │(ElizaOS)│  │(ElizaOS)│  │(ElizaOS) │
     └─────────┘  └────────┘  └──────────┘

     ┌──────────────────────┐
     │  VRM Companion App   │  ← Standalone Vite app
     │  (connects via WS)   │     No agent logic
     └──────────────────────┘

     ┌──────────────────────┐
     │  Admin Dashboard      │  ← Lightweight monitoring
     │  (connects via API)   │     Read-only + emergency controls
     └──────────────────────┘
```

### 2.2 Core Principles

1. **Agent runs headless by default** — no UI process required
2. **Connectors are first-class interaction surfaces** — not afterthoughts
3. **Command framework bridges connectors to API** — `/balance` in Discord calls the same logic as `GET /api/wallet/steward-balances`
4. **VRM is a display-only client** — connects to agent via WebSocket, receives state, renders avatar
5. **Web dashboard is admin/monitoring only** — not the primary interaction surface
6. **Config via connectors** — users can configure their agent from Discord/Telegram
7. **Auth per connector** — owner vs. user vs. public permissions

### 2.3 New Component: Command Router

The Command Router sits between connectors and the API layer:

```typescript
// packages/agent/src/commands/router.ts

interface CommandDefinition {
  name: string;           // e.g. "balance"
  aliases: string[];      // e.g. ["bal", "wallet"]
  description: string;
  category: CommandCategory;
  permission: PermissionLevel;
  args: CommandArgDef[];
  handler: (ctx: CommandContext) => Promise<CommandResult>;
}

type CommandCategory =
  | "wallet"      // /balance, /send, /approve, /deny
  | "config"      // /config, /character, /voice, /provider
  | "knowledge"   // /learn, /forget, /remember, /search
  | "plugins"     // /plugins, /install, /uninstall
  | "steward"     // /policies, /approve-tx, /deny-tx
  | "system"      // /status, /health, /restart
  | "chat";       // Default — pass through to LLM

type PermissionLevel =
  | "owner"       // Agent owner only
  | "admin"       // Owner + designated admins
  | "user"        // Any authenticated user
  | "public";     // Anyone

interface CommandContext {
  source: ConnectorSource;  // which connector
  userId: string;           // connector-specific user ID
  args: Record<string, unknown>;
  runtime: AgentRuntime;
  reply: (msg: string | RichMessage) => Promise<void>;
}
```

### 2.4 VRM Companion as Standalone Client

```
Current:  App process = Agent + API + VRM + Settings UI
Target:   Agent process = Agent + API (headless)
          VRM app = Lightweight Three.js viewer (connects to agent WS)
```

The VRM app needs:
- WebSocket connection to agent for state sync
- Agent expression/emotion events → VRM animation
- TTS audio stream → lip sync
- No direct database access
- No plugin management
- No config editing (or minimal)

---

## 3. Gap Analysis

### 3.1 Must Build

| Component | Effort | Description |
|-----------|--------|-------------|
| **Command Router** | Medium | Central command dispatch, parsing, permission checking |
| **Connector Command Adapters** | Medium | Discord slash commands, Telegram bot commands, Signal text commands |
| **Permission System** | Medium | Owner/admin/user/public per connector, per command |
| **Headless Startup Mode** | Small | CLI flag `--headless --connectors-only` that skips all UI concerns |
| **VRM WebSocket Protocol** | Medium | Define events: emotion, speech, gesture, state sync |
| **Admin Command Set** | Medium | /config, /status, /restart, /provider mapped to existing API |
| **Wallet Command Set** | Small | /balance, /send, /approve, /deny mapped to existing wallet API |
| **Knowledge Command Set** | Small | /learn, /forget, /search mapped to existing knowledge API |
| **Plugin Command Set** | Small | /plugins, /install, /uninstall mapped to existing plugin API |
| **Steward Command Set** | Small | /policies, /approve-tx, /deny-tx mapped to existing steward API |

### 3.2 Must Refactor

| Component | Effort | Description |
|-----------|--------|-------------|
| **server.ts decomposition** | Large | 20K line monolith → route modules (wallet, knowledge, plugins, etc.) |
| **VRM decoupling** | Medium | Extract VRM to standalone app that connects via WS |
| **Config persistence** | Small | Ensure headless config changes (via commands) are persisted correctly |

### 3.3 Can Reuse As-Is

- ✅ ElizaOS plugin-discord, plugin-telegram, plugin-whatsapp (just need command layer on top)
- ✅ Signal pairing infrastructure
- ✅ Connector health monitoring
- ✅ All wallet/steward API logic (just needs command mapping)
- ✅ Knowledge routes (just needs command mapping)
- ✅ Plugin management logic
- ✅ Self-awareness system
- ✅ Character configuration
- ✅ Signing policy engine
- ✅ Telegram custom commands infrastructure

---

## 4. Connector Capabilities Needed

### 4.1 Chat (Core — Already Works)

| Feature | Discord | Telegram | Signal | WhatsApp |
|---------|---------|----------|--------|----------|
| Text chat | ✅ via plugin | ✅ via plugin | ✅ via plugin | ✅ via plugin |
| Image send | ✅ | ✅ | ✅ | ✅ |
| Image receive | ✅ | ✅ | ✅ | ✅ |
| Voice (send) | ✅ (voice channel) | ✅ (voice msg) | ❌ | ✅ (voice msg) |
| Voice (receive) | ✅ | ✅ | ❌ | ✅ |
| Rich embeds | ✅ | ✅ (HTML) | ❌ | ❌ |
| Reactions | ✅ | ✅ | ✅ | ✅ |

### 4.2 Agent Configuration Commands

```
/config show                    → Show current config summary
/config provider <name>         → Switch LLM provider
/config model <model>           → Set model
/character show                 → Show character info
/character set <field> <value>  → Update character field
/voice <voice-name>             → Set TTS voice
/voice list                     → List available voices
```

**Implementation:** Map to existing `/api/provider/switch`, `/api/character/*`, `/api/tts/*`

### 4.3 Wallet Operations

```
/balance                        → Show all wallet balances
/balance <chain>                → Show specific chain balance
/send <amount> <token> to <addr> → Initiate transfer (requires Steward approval)
/approve <tx-id>                → Approve pending transaction
/deny <tx-id>                   → Deny pending transaction
/wallet addresses               → Show wallet addresses
/wallet nfts                    → Show NFTs
```

**Implementation:** Map to existing `/api/wallet/*` routes. Critical: only owner should be able to `/send`.

### 4.4 Knowledge Management

```
/learn <url>                    → Ingest URL into knowledge base
/learn <text>                   → Add text to knowledge
/forget <query>                 → Remove matching knowledge
/search <query>                 → Search knowledge base
/remember                       → Show recent memories
```

**Implementation:** Map to existing `/api/memory/*` and knowledge routes.

### 4.5 Plugin Management

```
/plugins                        → List installed plugins
/plugins available              → Search plugin catalog
/install <plugin-name>          → Install plugin
/uninstall <plugin-name>        → Uninstall plugin
/skills                         → List installed skills
/skills search <query>          → Search skill catalog
```

**Implementation:** Map to existing `/api/plugins/*` and `/api/skills/*` routes.

### 4.6 Steward Policy Management

```
/policies                       → Show signing policies
/policies set <rule> <value>    → Update policy
/steward status                 → Steward connection status
/steward approvals              → List pending approvals
/steward approve <id>           → Approve transaction
/steward deny <id>              → Deny transaction
```

**Implementation:** Map to existing `/api/wallet/steward-*` routes.

### 4.7 System Commands

```
/status                         → Agent health, uptime, connected services
/health                         → Detailed health check
/restart                        → Restart agent runtime
/logs [n]                       → Recent log entries
```

---

## 5. Migration Path

### Phase 0: Foundation (No Breaking Changes)

**Goal:** Add command infrastructure without touching existing code.

1. **Create `packages/agent/src/commands/` directory:**
   ```
   commands/
   ├── router.ts           # Command router + dispatcher
   ├── registry.ts         # Command registration
   ├── types.ts            # CommandDef, CommandContext, etc.
   ├── permissions.ts      # Permission checking
   ├── adapters/
   │   ├── discord.ts      # Discord slash command adapter
   │   ├── telegram.ts     # Telegram bot command adapter
   │   ├── signal.ts       # Signal text command adapter
   │   └── api.ts          # HTTP API command adapter
   └── handlers/
       ├── wallet.ts       # /balance, /send, etc.
       ├── config.ts       # /config, /character, /voice
       ├── knowledge.ts    # /learn, /forget, /search
       ├── plugins.ts      # /plugins, /install, /uninstall
       ├── steward.ts      # /policies, /approve, /deny
       └── system.ts       # /status, /health, /restart
   ```

2. **Wire command router into ElizaOS message pipeline:**
   - Intercept messages starting with `/` before they reach the LLM
   - If command matches, route to handler
   - If not, pass through to normal chat flow

3. **Add `--connectors-only` flag to startup:**
   - Skip UI asset serving
   - Skip onboarding wizard (use config file or env vars)
   - Start API on configured port
   - Load connector plugins
   - Start command router

### Phase 1: Discord Commands (Highest Impact)

**Goal:** Full agent control from Discord.

1. Register Discord slash commands via `@elizaos/plugin-discord`
2. Implement Discord command adapter that translates slash commands to `CommandContext`
3. Implement command handlers for wallet, config, system
4. Add owner authentication (Discord user ID → permission level)
5. Deploy and test with existing Discord bot

**Files to modify:**
- `packages/agent/src/runtime/eliza.ts` — inject command router into plugin pipeline
- New: `packages/agent/src/commands/*` — entire command framework

### Phase 2: Telegram + Signal Commands

**Goal:** Parity with Discord across other connectors.

1. Telegram: Use existing `telegram-custom-commands.ts` infrastructure + BotFather commands
2. Signal: Text-based command parsing (no slash commands in Signal)
3. Shared command handlers — same logic, different adapters

### Phase 3: VRM Decoupling

**Goal:** VRM runs as standalone app.

1. Define WebSocket protocol for VRM state sync:
   ```typescript
   type VrmEvent =
     | { type: "emotion"; value: string; intensity: number }
     | { type: "speech"; audio: ArrayBuffer; phonemes?: string[] }
     | { type: "gesture"; name: string }
     | { type: "state"; data: AgentStateSnapshot }
     | { type: "message"; text: string; from: string };
   ```
2. Add VRM WebSocket endpoint to agent API: `/ws/vrm`
3. Modify VRM app to connect to agent via WebSocket instead of direct runtime access
4. VRM app becomes deployable separately (CDN, Vercel, etc.)

### Phase 4: Server.ts Decomposition

**Goal:** Make the API maintainable.

1. Extract route groups into separate files (already partially done with `wallet-routes.ts`, `signal-routes.ts`, etc.)
2. Create route registration system
3. Reduce `server.ts` to router + middleware setup
4. Each route module self-registers

### Phase 5: Admin Dashboard

**Goal:** Lightweight monitoring web UI.

1. Separate from VRM companion
2. Read-only views of: agent status, connector health, recent conversations, wallet balances
3. Emergency controls: restart, disconnect connector, pause
4. No character editing, no onboarding — that's done via connectors or config files

---

## 6. Priority Order

| Priority | Task | Impact | Effort | Why First |
|----------|------|--------|--------|-----------|
| **P0** | Command Router framework | 🔴 Critical | Medium | Foundation for everything else |
| **P0** | Discord slash commands | 🔴 Critical | Medium | Most users are on Discord |
| **P0** | `--connectors-only` headless mode | 🔴 Critical | Small | Enables always-on deployment |
| **P1** | Wallet commands (/balance, /send) | 🟠 High | Small | Most requested feature |
| **P1** | System commands (/status, /health) | 🟠 High | Small | Essential for headless monitoring |
| **P1** | Owner authentication | 🟠 High | Medium | Security for admin commands |
| **P2** | Telegram commands | 🟡 Medium | Small | Second most popular connector |
| **P2** | Knowledge commands (/learn, /forget) | 🟡 Medium | Small | Users want to teach agent |
| **P2** | Config commands (/config, /voice) | 🟡 Medium | Small | Avoid web UI dependency |
| **P2** | Plugin commands (/install, /uninstall) | 🟡 Medium | Small | Power user feature |
| **P3** | Signal commands | 🟢 Low | Small | Privacy-focused users |
| **P3** | VRM WebSocket protocol | 🟢 Low | Medium | Decoupling, not new capability |
| **P3** | Server.ts decomposition | 🟢 Low | Large | Maintainability, not user-facing |
| **P4** | VRM standalone app | ⚪ Future | Medium | Nice to have |
| **P4** | Admin dashboard | ⚪ Future | Medium | Nice to have |
| **P4** | Steward policy commands | ⚪ Future | Small | Niche feature |

---

## 7. Comparison with OpenClaw

### 7.1 OpenClaw Architecture

OpenClaw is a **multi-channel AI gateway** with:
- **37+ extensions** (connectors): Discord, Telegram, Signal, WhatsApp, Slack, Matrix, IRC, Nostr, Twitch, Line, Feishu, Google Chat, MS Teams, Mattermost, BlueBubbles, iMessage, Tlon, Zalo, etc.
- **Headless-first design** — no UI required, agent runs as daemon
- **Extension model** — each connector is a self-contained extension in `extensions/<name>/`
- **Gateway architecture** — `openclaw gateway start/stop/restart/status`
- **Always-on** — runs as system service
- **Device pairing** — built-in for WhatsApp, Signal
- **ACP (Agent Client Protocol)** — standardized agent communication

**Key dependencies revealing architecture:**
- `grammy` — Telegram (lightweight, modern)
- `@buape/carbon` — Discord
- `@whiskeysockets/baileys` — WhatsApp
- `signal-utils` — Signal
- `@slack/bolt` + `@slack/web-api` — Slack
- `@larksuiteoapi/node-sdk` — Feishu/Lark
- `@line/bot-sdk` — Line
- `ws` — WebSocket for real-time
- `croner` — Cron scheduling (like heartbeats)
- `commander` — CLI framework
- `sqlite-vec` — Vector search for memory
- `sharp` — Image processing
- `node-edge-tts` — TTS
- `playwright-core` — Web automation
- `@lydell/node-pty` — PTY for terminal agents

### 7.2 What OpenClaw Does That Milady Should Learn From

| OpenClaw Pattern | Milady Current | Recommendation |
|-----------------|---------------|----------------|
| **Extensions are self-contained** — each in own dir with own `package.json` | Connectors are ElizaOS plugins (external npm packages) | Keep using ElizaOS plugins but add command adapter layer per connector |
| **Gateway daemon** — `openclaw gateway start`, runs as systemd service | No daemon mode, process must be manually managed | Add `milady daemon start/stop/status` or use existing deploy scripts |
| **Always-on by design** — heartbeat, cron, proactive | Can run headless but UI-first in practice | Make headless the primary documented mode |
| **Device pairing built-in** — WhatsApp QR, Signal linking | ✅ Already has this for Signal + WhatsApp | Good parity here |
| **Extension discovery** — extensions dir scanned at startup | Plugin registry in `plugins.json` (221KB) | ✅ Already better — runtime plugin install |
| **Memory extensions** — `memory-core`, `memory-lancedb` | `@elizaos/plugin-knowledge`, `@elizaos/plugin-local-embedding` | ✅ Comparable |
| **Lobster workflows** — deterministic task pipelines | `@elizaos/plugin-cron` for scheduling | Consider adding workflow/pipeline support |
| **CLI-first UX** — `openclaw` command for everything | `milady.mjs` entry point, but UI-centric | Add rich CLI: `milady status`, `milady connectors`, `milady plugins` |
| **Thread ownership** — extension for managing conversation threads | No equivalent | Add thread/conversation management |
| **Voice call extension** — dedicated voice calling | TTS/STT via plugins | Could add dedicated voice call support |

### 7.3 Key Architectural Differences

**OpenClaw advantage:** Unified extension interface. Every connector implements the same contract. Adding a new connector = adding a directory.

**Milady advantage:** ElizaOS plugin ecosystem. Hundreds of plugins available. Don't reinvent — leverage.

**Recommended hybrid approach:**
1. Keep ElizaOS plugins as connector implementations
2. Add a Milady-specific command adapter layer per connector
3. Command adapters translate connector-native interactions (slash commands, bot commands, text commands) into unified `CommandContext`
4. Command handlers are shared across all connectors

---

## 8. Concrete Implementation Plan

### 8.1 Step 1: Command Types (`packages/agent/src/commands/types.ts`)

```typescript
export type CommandCategory = "wallet" | "config" | "knowledge" | "plugins" | "steward" | "system" | "chat";
export type PermissionLevel = "owner" | "admin" | "user" | "public";
export type ConnectorType = "discord" | "telegram" | "signal" | "whatsapp" | "api" | "cli";

export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  category: CommandCategory;
  permission: PermissionLevel;
  args: CommandArgDef[];
  handler: (ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  command: string;
  args: Record<string, string>;
  rawArgs: string;
  source: { type: ConnectorType; userId: string; channelId?: string; guildId?: string };
  runtime: AgentRuntime;
  config: ElizaConfig;
  reply: (content: string | RichReply) => Promise<void>;
  replyEmbed?: (embed: EmbedLike) => Promise<void>;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface RichReply {
  text: string;
  embed?: EmbedLike;
  components?: ButtonLike[];
  ephemeral?: boolean;
}
```

### 8.2 Step 2: Permission Config

Add to `eliza.json` / `config.connectors`:
```json
{
  "connectors": {
    "discord": {
      "botToken": "...",
      "owners": ["discord-user-id-1"],
      "admins": ["discord-user-id-2"],
      "commandPrefix": "/"
    },
    "telegram": {
      "botToken": "...",
      "owners": ["telegram-user-id-1"],
      "commandPrefix": "/"
    }
  }
}
```

### 8.3 Step 3: Command Handler Example

```typescript
// packages/agent/src/commands/handlers/wallet.ts
import { fetchEvmBalances, getWalletAddresses } from "../../api/wallet";

export const balanceCommand: CommandDefinition = {
  name: "balance",
  aliases: ["bal", "wallet"],
  description: "Show wallet balances",
  category: "wallet",
  permission: "owner",
  args: [{ name: "chain", type: "string", required: false }],
  async handler(ctx) {
    const addresses = await getWalletAddresses(ctx.runtime);
    const balances = await fetchEvmBalances(addresses);
    await ctx.reply(formatBalances(balances));
    return { success: true };
  },
};
```

### 8.4 Step 4: Discord Adapter

```typescript
// packages/agent/src/commands/adapters/discord.ts
// Hook into @elizaos/plugin-discord's message handler
// Intercept messages starting with "/" 
// Parse into CommandContext
// Route to command router
// If no command match, pass to normal LLM flow
```

### 8.5 File Locations Summary

All new code goes in `packages/agent/src/commands/`:
```
packages/agent/src/commands/
├── types.ts              # Types and interfaces
├── router.ts             # Command dispatch + prefix detection
├── registry.ts           # Register all commands
├── permissions.ts        # Check user permissions per connector
├── formatter.ts          # Format responses for different connectors
├── adapters/
│   ├── discord.ts        # Discord slash command registration + handling
│   ├── telegram.ts       # Telegram BotFather command + text parsing
│   ├── signal.ts         # Signal text command parsing
│   ├── whatsapp.ts       # WhatsApp text command parsing
│   └── api.ts            # HTTP POST /api/command for programmatic access
└── handlers/
    ├── wallet.ts         # /balance, /send, /approve, /deny
    ├── config.ts         # /config, /character, /voice, /provider
    ├── knowledge.ts      # /learn, /forget, /search, /remember
    ├── plugins.ts        # /plugins, /install, /uninstall, /skills
    ├── steward.ts        # /policies, /steward
    ├── system.ts         # /status, /health, /restart, /logs
    └── help.ts           # /help, /commands
```

---

## 9. Deployment Architecture

### 9.1 Always-On Headless (Target)

```bash
# Start agent headless with connectors
milady start --headless --connectors discord,telegram,signal

# Or via systemd service
sudo systemctl start milady-agent

# Or via Docker
docker run -d \
  --name milady \
  -v ~/.eliza:/root/.eliza \
  -e DISCORD_API_TOKEN=... \
  -e ANTHROPIC_API_KEY=... \
  milady-ai/milady:latest \
  --headless --connectors discord,telegram
```

### 9.2 Environment Variables for Headless

```bash
# Required
ANTHROPIC_API_KEY=...          # or any model provider
MILADY_API_TOKEN=...           # API auth token

# Connectors (enable by providing token)
DISCORD_API_TOKEN=...
TELEGRAM_BOT_TOKEN=...

# Optional
MILADY_PORT=31337
MILADY_API_BIND=0.0.0.0
LOG_LEVEL=info
```

### 9.3 Docker Compose (Production)

```yaml
version: "3.8"
services:
  milady-agent:
    image: milady-ai/milady:latest
    command: ["--headless", "--connectors", "discord,telegram"]
    restart: unless-stopped
    volumes:
      - milady-data:/root/.eliza
    env_file: .env
    ports:
      - "31337:31337"  # API only, no UI needed

  # Optional: VRM companion (separate process)
  milady-vrm:
    image: milady-ai/milady-vrm:latest
    environment:
      - MILADY_API_URL=http://milady-agent:31337
    ports:
      - "2138:2138"  # VRM viewer

volumes:
  milady-data:
```

---

## 10. Success Criteria

The migration is complete when:

1. ✅ `milady start --headless` runs without any UI dependencies
2. ✅ Discord users can `/balance`, `/config`, `/learn`, `/status` from Discord
3. ✅ Telegram users can `/balance`, `/config`, `/learn`, `/status` from Telegram
4. ✅ Agent owner can fully configure the agent without ever opening a browser
5. ✅ VRM companion connects to agent via WebSocket and renders independently
6. ✅ New connector can be added by implementing only a command adapter (~100 lines)
7. ✅ All existing features (chat, wallet, knowledge, plugins) work through connectors
8. ✅ Permission system prevents unauthorized users from running admin commands
9. ✅ Agent runs 24/7 as a daemon/Docker container without human intervention
10. ✅ Connector health monitoring alerts via the connectors themselves (not just WebSocket)
