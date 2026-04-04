# Discord Tool Integration Audit

> Branch: `feat/autonomous-agent-tools`  
> Audited: 2026-03-30  
> Status: Pre-implementation — documentation only, no code changed

---

## 1. How ElizaOS's Action System Works with Discord

### Message Pipeline (end to end)

```
Discord messageCreate event
  └─► MessageManager.handleMessage()        [plugin-discord]
        ├─ DM access check / pairing check
        ├─ Build Memory from Discord message
        │    └─ Embeds, attachments, reply references, mention context
        ├─ Determine routing:
        │    ├─ messagingAPI.sendMessage()   [if ElizaCloud gateway]
        │    ├─ messageService.handleMessage()  [DefaultMessageService]
        │    └─ runtime.emitEvent(MESSAGE_RECEIVED)  [fallback]
        └─ callback = sendMessageInChunks (writes back to Discord channel)
```

### DefaultMessageService Pipeline (the brain)

```
handleMessage()
  └─► processMessage()
        ├─ Save incoming message to memory DB
        ├─ processAttachments() — auto-describes images via IMAGE_DESCRIPTION model
        │    └─ Discord image attachments get descriptions BEFORE LLM sees them ✓
        ├─ shouldRespond() check:
        │    ├─ DM/VOICE_DM/SELF/API → always respond (skip LLM eval)
        │    ├─ source="client_chat" → always respond
        │    ├─ Platform mention OR reply-to-bot → always respond
        │    └─ GROUP channel, no mention → LLM evaluates (RESPOND|IGNORE|STOP)
        └─ if shouldRespond:
             ├─ runSingleShotCore()  [default]
             │    ├─ composeState() with ["ACTIONS"] provider
             │    │    └─ ACTIONS provider: calls validate() on each action,
             │    │       only includes eligible actions in context
             │    │       → "AVAILABLE ACTIONS: ..." injected into LLM prompt
             │    ├─ LLM produces: <thought>, <actions>, <text>, <simple>
             │    └─ mode = "simple" (REPLY only) | "actions" (any other action)
             └─ runMultiStepCore()  [opt-in via USE_MULTI_STEP=true]
                  └─ Iterative: LLM picks provider + action per step, loops up to MAX_MULTISTEP_ITERATIONS
```

### How actions reach Discord users

When `mode = "actions"`:
```javascript
await runtime.processActions(message, responseMessages, state, callback, options)
// callback is the Discord sendMessageInChunks function
// Each action's handler calls: callback({ text: "...", ... })
// → These become Discord messages via sendMessageInChunks
```

**Action results ARE routed to Discord via the callback.** The `ACTION_STARTED` / `ACTION_COMPLETED` events only fire the `message-bus-service` notification when `source === "client_chat"` — Discord messages have `source: "discord"` so these internal bus notifications don't fire, but that's irrelevant for Discord. The callback mechanism works correctly.

---

## 2. Available Tools During Discord Conversations

### Always-loaded (CORE_PLUGINS)

| Plugin | Actions Available | Notes |
|--------|-------------------|-------|
| `basic-capabilities` | `REPLY`, `IGNORE`, `NONE`, `COMPACT_SESSION` | Always available |
| `plugin-knowledge` | `SEARCH_KNOWLEDGE`, `PROCESS_KNOWLEDGE` | RAG search + ingestion |
| `plugin-agent-orchestrator` | `START_CODING_TASK`, `SPAWN_CODING_AGENT`, `SEND_TO_CODING_AGENT`, `STOP_CODING_AGENT`, `FINALIZE_WORKSPACE`, `LIST_CODING_AGENTS`, `MANAGE_ISSUES`, `PROVISION_WORKSPACE` | Multi-agent coding |
| `plugin-agent-skills` | `GET_SKILL_DETAILS`, `GET_SKILL_GUIDANCE`, `RUN_SKILL_SCRIPT`, `SEARCH_SKILLS`, `SYNC_SKILL_CATALOG`, `INSTALL_SKILL`, `TOGGLE_SKILL`, `UNINSTALL_SKILL` | Skill marketplace |
| `plugin-shell` | `CLEAR_SHELL_HISTORY` (**only!**) | See §3 — this is a gap |
| `plugin-cron` | Cron/scheduling (task-based) | Not conversational actions |
| `plugin-commands` | Slash command handling | Discord `/commands` |
| `plugin-vision` | `DESCRIBE_SCENE`, `CAPTURE_IMAGE`, `SET_VISION_MODE`, `NAME_ENTITY`, `IDENTIFY_PERSON`, `TRACK_ENTITY`; provider: `VISION_PERCEPTION` | Vision actions available |
| `@miladyai/plugin-roles` | Role-based access | Admin/OWNER system |
| `@miladyai/plugin-discord-commands` | Discord slash commands | Wallet, status, admin |

### Optional (loaded when enabled in config)

| Plugin | How to Enable | Key Actions |
|--------|---------------|-------------|
| `plugin-browser` | Add to agent plugin config | Web browsing (requires stagehand-server) |
| `plugin-discord` | `DISCORD_API_TOKEN` configured | Discord connector itself |
| `plugin-code` | Listed in CORE_PLUGINS but **NOT INSTALLED** (see §3) | Code writing |
| `plugin-vision` (TF.js) | Requires `@tensorflow/tfjs-node` native addon | Computer vision |

### Advanced capabilities (if `ADVANCED_CAPABILITIES=true`)

| Feature | Actions/Providers |
|---------|-------------------|
| Advanced capabilities | `CHOICE`, follow/mute/unfollow room, image generation, settings management, onboarding |
| Autonomy | `SEND_TO_ADMIN`, autonomy status provider |

### Built-in attachment processing (not action-based)

The `processAttachments()` pipeline in `DefaultMessageService` **automatically** handles:
- **Images** → `ModelType.IMAGE_DESCRIPTION` (LLM describes image, injects description into context)
- **Audio** → `ModelType.TRANSCRIPTION` (transcribes before LLM sees the message)
- **Video** → `ModelType.TRANSCRIPTION`
- **Plain text documents** → reads text content

This happens BEFORE the LLM decides what to do — images are already described in context. `plugin-vision` actions are separate explicit actions the agent can choose; automatic description is a baseline already working.

---

## 3. What's Blocking Natural Tool Use

### 3a. `plugin-shell` has NO conversational exec action

**This is the biggest mismatch between expectation and reality.**

`plugin-shell` exposes:
- **Actions**: Only `CLEAR_SHELL_HISTORY`  
- **Providers**: `SHELL_HISTORY`, `TERMINAL_USAGE` (read-only context)
- **Services**: `ShellService`, `ExecApprovalService` (internal use only)

There is **no `RUN_SHELL`, `EXEC_COMMAND`, or `RUN_COMMAND` action**. The agent cannot execute arbitrary shell commands via conversation. `ShellService` is programmatically accessible (`runtime.getService('shell')`) but has no action handler routing conversational requests to it.

**Workaround**: Use `plugin-agent-orchestrator` actions (`START_CODING_TASK`) to spin up a coding agent that can execute code. Or write a custom action that wraps `ShellService.run()`.

### 3b. `plugin-code` is MISSING

`CORE_PLUGINS` in `packages/agent/src/runtime/core-plugins.ts` includes `@elizaos/plugin-code`, but:
```bash
ls node_modules/@elizaos/ | grep plugin-code
# → (no output)
```

The package is referenced but not installed. Any runtime that loads it would fail or silently skip it. Likely still in development / not yet published.

### 3c. Discord GROUP channels require mention (or LLM agree to respond)

The `shouldRespond()` logic:
- **DM / VOICE_DM**: Always respond ✓
- **Mentioned / reply to bot**: Always respond ✓  
- **GROUP channel, no mention**: LLM evaluates whether to RESPOND or IGNORE

In a busy Discord server, the agent running in a group channel may **silently ignore** most messages unless explicitly mentioned. The LLM evaluation (`shouldRespondTemplate`) asks "should I respond?" and will often say IGNORE to avoid being noisy.

This means tool use can't happen naturally — users have to @mention the bot every time.

### 3d. `plugin-browser` is OPTIONAL and not auto-loaded

Web browsing (`@elizaos/plugin-browser`) is in `OPTIONAL_CORE_PLUGINS` and requires:
1. Explicit configuration in the agent config
2. `stagehand-server` binary running alongside the agent
3. Correct path setup via `prepareBrowserPlugin()`

Without this, there are **no web browsing actions** available.

### 3e. Multi-step mode is disabled by default

`USE_MULTI_STEP` defaults to `false`. With single-shot mode, the agent can only:
- Pick actions in one LLM call
- Execute them once
- Reply

This prevents iterative tool use like: "search knowledge → analyze result → run a skill → summarize". Multi-step would allow 6 iterations by default (`MAX_MULTISTEP_ITERATIONS=6`).

### 3f. `plugin-vision` camera actions won't work in Discord

Actions like `CAPTURE_IMAGE` assume a camera/webcam is available on the host. In a server deployment, these won't work unless there's physical hardware or a virtual camera. `DESCRIBE_SCENE` assumes a continuous vision feed, not a one-off image from Discord. 

The **automatic image description** (§2, built-in processing) already handles Discord image attachments correctly.

### 3g. Action notifications filtered to `client_chat` source

`ACTION_STARTED` and `ACTION_COMPLETED` events only trigger `message-bus-service` notifications when `content.source === "client_chat"`. Discord messages have `source: "discord"`. This means real-time action progress indicators (like "🔄 Running...") in the Discord UI won't fire through the bus. The final action output still goes to Discord via the callback — this only affects live progress indicators.

---

## 4. Character/System Prompt Changes to Enable More Autonomous Tool Use

### Setting: Disable shouldRespond check for Discord channels

```json
// In character settings or environment:
{
  "CHECK_SHOULD_RESPOND": false
}
```

This enables "ChatGPT mode" — the agent always responds to every message it receives. Eliminates the silent ignore problem in group channels. Set `DISCORD_SHOULD_RESPOND_ONLY_TO_MENTIONS=true` on the Discord plugin side if you want to filter at the connector level instead.

### Setting: Enable multi-step iterative tool use

```json
{
  "USE_MULTI_STEP": "true",
  "MAX_MULTISTEP_ITERATIONS": "6"
}
```

Enables the full agentic loop: the agent can research → execute → synthesize over multiple steps. This is what makes the agent feel truly autonomous rather than just single-shot.

### Setting: Enable advanced capabilities

```json
{
  "ADVANCED_CAPABILITIES": "true"
}
```

Unlocks `CHOICE` action (for structured multi-option responses), room follow/mute, image generation, and settings management. Needed for richer Discord interactions.

### System prompt additions for autonomous tool use

The `messageHandlerTemplate` already injects `AVAILABLE ACTIONS` into the LLM context. To make the agent more proactively reach for tools, the character's system prompt should explicitly instruct it:

```
You have access to powerful tools:
- SEARCH_KNOWLEDGE: Search your knowledge base for factual questions
- START_CODING_TASK: Launch a coding agent for software tasks
- RUN_SKILL_SCRIPT: Execute specific skill scripts
- DESCRIBE_SCENE / VISION_PERCEPTION: Analyze images (use when images are shared)

When users ask questions you can look up, USE SEARCH_KNOWLEDGE instead of guessing.
When users share images, USE the vision context that's already been injected.
When users ask you to build or code something, USE START_CODING_TASK.
```

Without explicit guidance, LLMs default to REPLY even when tools are available.

---

## 5. Configuration Changes Needed

### Enable browser plugin (required for web search)

```json
// In agent config plugins array or character config:
{
  "plugins": [
    "@elizaos/plugin-browser"
  ]
}
```

Plus: ensure `stagehand-server` binary is available at the expected path.

### Force Discord to always respond (remove silence)

Option A — agent level (applies everywhere):
```
CHECK_SHOULD_RESPOND=false
```

Option B — Discord connector level (only affects Discord):
Set `discordSettings.shouldRespondOnlyToMentions = false` (current default). This already allows responding to all messages, but the shouldRespond LLM check still filters.

Option C — whitelist the GROUP channel type:
```
ALWAYS_RESPOND_CHANNELS=group
```

This tells `shouldRespond()` to skip LLM evaluation and always respond in GROUP channels.

### Shell execution (if you add a custom action for it)

```
SHELL_ALLOWED_DIRECTORY=/path/to/allowed/dir
SHELL_ALLOW_BACKGROUND=true
```

### Multi-step and iteration settings

```
USE_MULTI_STEP=true
MAX_MULTISTEP_ITERATIONS=8
PROVIDERS_TOTAL_TIMEOUT_MS=30000
```

The default `PROVIDERS_TOTAL_TIMEOUT_MS=1000ms` is too short for real tool calls — increase to at least 30 seconds.

---

## 6. Example Conversations: What SHOULD Happen

### Web browsing (requires `plugin-browser` enabled)

```
User: what's the latest on the solana ETF?

Agent thinks: BROWSE action available → should search web
Agent outputs: <actions>BROWSE_WEB</actions>
               <params><url>...</url><query>solana ETF news 2026</query></params>

Discord sees: Agent types... (typing indicator)
              "Just checked — here's what I found: [summary of search results]"
```

### Knowledge search (already available)

```
User: what's milady's total supply?

Agent thinks: SEARCH_KNOWLEDGE available → search knowledge base
Agent outputs: <actions>SEARCH_KNOWLEDGE</actions>
               <params><query>milady total supply tokenomics</query></params>

Discord sees: Agent replies with knowledge-grounded answer
```

### Coding task

```
User: build me a simple token price checker script

Agent thinks: START_CODING_TASK for coding request
Agent outputs: <actions>START_CODING_TASK</actions>
               <params><task>Write a Python script that fetches token price from CoinGecko...</task></params>

Discord sees: "🔎 Executing action: START_CODING_TASK"
              "Here's the script I built for you: [code block]"
              "I've also saved it in your workspace at..."
```

### Image description (ALREADY WORKS automatically)

```
User: [posts image of a chart]

Agent automatically: processAttachments() runs IMAGE_DESCRIPTION model
                     → description injected into LLM context

Agent responds naturally: "Looks like a price chart showing [description]..."
```

The `plugin-vision` actions (`DESCRIBE_SCENE` etc.) are for continuous camera feeds, not Discord image attachments. The existing auto-processing already handles Discord images.

### Shell status check (CURRENTLY BROKEN — no exec action)

```
User: what's the server CPU usage?

Agent thinks: No RUN_SHELL action available
              Falls back to REPLY

Discord sees: "I don't have direct access to system metrics right now"
              (or makes something up)
```

**Fix required**: Implement a custom action that calls `ShellService.run("top -bn1")` and returns the output.

### Skill execution

```
User: summarize this document [paste text]

Agent thinks: RUN_SKILL_SCRIPT available for summarization skill
Agent outputs: <actions>RUN_SKILL_SCRIPT</actions>
               <params><skill>summarize</skill><input>[text]</input></params>

Discord sees: Summarized output
```

---

## Summary: Current State vs. What's Needed

| Capability | Current State | What's Needed |
|------------|---------------|---------------|
| Image description | ✅ Auto-works via processAttachments | Nothing — works |
| Knowledge search | ✅ Action registered, LLM can pick it | System prompt to encourage usage |
| Coding agent | ✅ START_CODING_TASK available | System prompt + `USE_MULTI_STEP=true` |
| Skill execution | ✅ RUN_SKILL_SCRIPT available | System prompt guidance |
| Shell commands | ❌ No conversational action | Need custom action wrapping ShellService |
| Web browsing | ❌ plugin-browser not loaded | Enable optional plugin + stagehand-server |
| Vision (Discord images) | ✅ Auto-processed, works | Nothing — works |
| Vision (camera/scene) | ⚠️ Actions registered, no camera | N/A for Discord |
| Agent responds in GROUP | ⚠️ LLM decides, may IGNORE | `ALWAYS_RESPOND_CHANNELS=group` or `CHECK_SHOULD_RESPOND=false` |
| Multi-step tool chains | ❌ Disabled by default | `USE_MULTI_STEP=true` |
| Action progress in Discord | ⚠️ Final output works, no live updates | Acceptable, or add Discord-source to bus filter |
| `plugin-code` | ❌ Referenced but not installed | Install when available |
