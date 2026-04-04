# Agent Capabilities Audit

> Branch: `feat/autonomous-agent-tools`
> Audited: 2026-03-30

This document maps what the Milady agent can actually *do*, what's enabled vs disabled, what needs wiring up, and how capabilities compare to OpenClaw.

---

## 1. Plugin Inventory

### CORE_PLUGINS (always loaded)

| Plugin | Status | What it does |
|--------|--------|--------------|
| `@elizaos/plugin-sql` | ✅ Installed | SQLite/Postgres database adapter — memory, messages, embeddings |
| `@elizaos/plugin-local-embedding` | ✅ Installed | Local ONNX/llama.cpp embeddings — no external API needed |
| `@elizaos/plugin-form` | ✅ Installed | Guided multi-turn form workflows |
| `@elizaos/plugin-knowledge` | ✅ Installed | RAG knowledge management (Knowledge tab in UI) |
| `@elizaos/plugin-trajectory-logger` | ✅ Installed | Logs full action trajectories for debugging + RL training |
| `@elizaos/plugin-agent-orchestrator` | ✅ Installed | **Spawn/manage CLI coding agents via PTY** (Claude Code, Codex, Gemini CLI, Aider, Pi, etc.) + SwarmCoordinator + git workspace provisioning + GitHub issue management |
| `@elizaos/plugin-cron` | ✅ Installed | Cron-scheduled background jobs |
| `@elizaos/plugin-shell` | ✅ Installed | Shell command execution with allowlist/approval system (ExecApprovalService), PTY sessions, process registry |
| `@elizaos/plugin-agent-skills` | ✅ Installed | Skill marketplace — search, auto-install, and run skills from registry |
| `@elizaos/plugin-commands` | ✅ Installed | Slash command handling — skills auto-register as /commands |
| `@elizaos/plugin-code` | ⚠️ **Moved to CORE** — pkg not yet installed | Code writing/file operations. Package not in package.json deps, no dist/ in node_modules. Will log an error on load but won't crash. **Needs `pnpm add @elizaos/plugin-code` to activate.** |
| `@elizaos/plugin-vision` | ✅ **Moved to CORE** — installed | Camera integration + visual awareness. Actions: `DESCRIBE_SCENE`, `CAPTURE_IMAGE`, `VISION_ANALYSIS`. Requires `@tensorflow/tfjs-node` (**installed** ✅). Previously feature-gated behind `media.vision.provider` config. |
| `@miladyai/plugin-roles` | ✅ Installed | RBAC — OWNER/ADMIN/NONE roles |
| `@miladyai/plugin-discord-commands` | ✅ Installed | Discord slash commands for wallet, status, admin |

### OPTIONAL_CORE_PLUGINS (user-enabled from admin panel)

| Plugin | Status | What it does | Dependencies |
|--------|--------|--------------|--------------|
| `@elizaos/plugin-pdf` | ⚠️ Bundle broken (alpha.15) | PDF text extraction | — |
| `@elizaos/plugin-cua` | Unknown | Cloud sandbox computer-use agent | Cloud sandbox service |
| `@elizaos/plugin-obsidian` | Unknown | Obsidian vault CLI integration | Obsidian + CLI |
| `@elizaos/plugin-repoprompt` | Unknown | RepoPrompt CLI integration | RepoPrompt binary |
| `@elizaos/plugin-claude-code-workbench` | Unknown | Claude Code companion workflows | Claude Code |
| `@elizaos/plugin-computeruse` | Unknown | Computer-use automation | Platform-specific binaries (Playwright) |
| `@elizaos/plugin-browser` | ✅ Installed | Web browsing + element interaction + data extraction | stagehand-server binary — **not auto-started** |
| `@elizaos/plugin-cli` | Unknown | CLI interface | — |
| `@elizaos/plugin-discord` | ✅ Installed | Discord bot connector | `DISCORD_BOT_TOKEN` |
| `@elizaos/plugin-telegram` | Unknown | Telegram bot connector | `TELEGRAM_BOT_TOKEN` |
| `@elizaos/plugin-twitch` | Unknown | Twitch connector | Twitch credentials |
| `@elizaos/plugin-edge-tts` | Unknown | TTS via Microsoft Edge TTS | — |
| `@elizaos/plugin-elevenlabs` | Unknown | TTS via ElevenLabs API | `ELEVENLABS_API_KEY` |

---

## 2. Deep-Dive: Key Autonomous Plugins

### plugin-agent-orchestrator (`@elizaos/plugin-agent-orchestrator`)

**The crown jewel.** Fully installed and in CORE.

**Actions registered:**
- `START_CODING_TASK` — high-level: provisions workspace + spawns agent + begins task
- `SPAWN_CODING_AGENT` — low-level: launch a specific CLI coding agent (Claude Code, Codex, Gemini CLI, Aider, Pi, etc.)
- `SEND_TO_CODING_AGENT` — send a message/command to a running agent's PTY
- `LIST_CODING_AGENTS` — list active agent sessions
- `STOP_AGENT` — kill an agent session
- `PROVISION_WORKSPACE` — clone repo + create branch (git workspace setup)
- `FINALIZE_WORKSPACE` — commit, push, open PR
- `MANAGE_ISSUES` — create/list/update/close GitHub issues

**Services:**
- `PTYService` — manages pseudo-TTY sessions; supports Claude Code, Codex, Gemini CLI, Aider, Pi
- `SwarmCoordinator` — multi-agent coordination: supervises agents, makes routing decisions, handles stalls/blocks
- `CodingWorkspaceService` — git ops: clone, branch, commit, push, PR creation

**UI surfaces:**
- `PtyConsoleSidePanel` / `PtyConsoleDrawer` / `PtyConsoleBase` — live PTY output in the app
- `CodingAgentSettingsSection` — configure adapter type (Claude Code, Codex, etc.)
- `ChatView` shows `codingAgentsAvailable` flag and filters routine coding-agent messages

**API:** `createCodingAgentRouteHandler` — REST routes for coding agent sessions (mounted in `server.ts`)

---

### plugin-shell (`@elizaos/plugin-shell`)

Shell execution with a full safety model.

**Safety system:**
- `ExecApprovalService` — approvals file + socket; tracks per-command allow/deny decisions
- `DEFAULT_SAFE_BINS` — pre-approved safe binaries
- `EXEC_APPROVAL_DEFAULTS` — default allow/ask/deny per command pattern
- `evaluateExecAllowlist` / `requiresExecApproval` — per-command safety checks
- Approval levels: `security: deny|allowlist|full` and `ask: off|on-miss|always`

**Providers:**
- `terminalUsageProvider` — injects terminal context into prompts
- `shellHistoryProvider` — recent command history in context

**Services:** `ShellService` + PTY key encoding, process registry

---

### plugin-agent-skills (`@elizaos/plugin-agent-skills`)

Skill marketplace runtime.

**Actions:**
- `GET_SKILL_GUIDANCE` — checks if a skill is installed, searches registry, auto-installs best match, returns instructions
- `GET_SKILL_DETAILS` — get info about a specific skill
- `RUN_SKILL_SCRIPT` — execute a skill's bundled bash script
- `SEARCH_SKILLS` — search the registry
- `SYNC_CATALOG` — manual registry sync

The key one is `GET_SKILL_GUIDANCE` — gives the agent on-demand access to the full skill library without manual install steps.

---

### plugin-vision (`@elizaos/plugin-vision`)

**Now in CORE.** Previously guarded by `media.vision.provider` config.

**Actions:** `DESCRIBE_SCENE`, `CAPTURE_IMAGE`, `VISION_ANALYSIS`
**Service:** `VisionService` (type: `"VISION"`)
**Dependencies:** `@tensorflow/tfjs-node` ✅ installed

The plugin connects to camera hardware and uses TF.js for local processing. With vision in CORE, the agent can see and describe scenes without any configuration toggle.

---

### plugin-code (`@elizaos/plugin-code`)

**In CORE but package not installed.** Listed in `OPTIONAL_CORE_PLUGINS` originally and in CORE_PLUGINS now, but `@elizaos/plugin-code` has no dist in node_modules and is not in `packages/agent/package.json` dependencies.

**To activate:**
```bash
pnpm add @elizaos/plugin-code --filter @miladyai/agent
pnpm install
```

Expected capabilities (based on name/description): code writing, file read/write operations, likely wraps shell + structured code generation workflows.

---

### plugin-browser (`@elizaos/plugin-browser`)

Stays OPTIONAL — requires `stagehand-server` binary running separately.

**Actions** (from dist/): browse URLs, interact with elements, extract data
**Dependencies:** stagehand-server must be running (separate process)
**To enable:** Start stagehand-server, then enable plugin via admin panel

---

## 3. What's Enabled vs Disabled

### Fully Operational (CORE, installed, no extra config)
- ✅ SQL / Memory / Embeddings
- ✅ Knowledge (RAG)
- ✅ Shell execution (with approval system)
- ✅ Coding agent orchestration (PTY + SwarmCoordinator)
- ✅ Cron scheduling
- ✅ Skill marketplace
- ✅ Slash commands
- ✅ RBAC (roles)
- ✅ Vision (after this PR)

### Needs Package Install
- ⚠️ plugin-code — add to package.json deps + pnpm install

### Needs Binary/Server
- 🔧 plugin-browser — needs stagehand-server
- 🔧 plugin-computeruse — needs Playwright binaries
- 🔧 plugin-cua — needs cloud sandbox service

### Needs Credentials/Config
- 🔑 plugin-discord — `DISCORD_BOT_TOKEN`
- 🔑 plugin-telegram — `TELEGRAM_BOT_TOKEN`
- 🔑 plugin-elevenlabs — `ELEVENLABS_API_KEY`

---

## 4. Configuration Reference

### Vision (`plugin-vision`)
Previously required:
```json
{ "media": { "vision": { "enabled": true, "provider": "..." } } }
```
Now loaded unconditionally. Will gracefully skip if no camera hardware detected.

### Shell Safety (`plugin-shell`)
The ExecApprovalService reads from an approvals file. Key env vars:
- `EXEC_ASK` — default ask mode (`off`, `on-miss`, `always`)
- `EXEC_SECURITY` — default security level (`deny`, `allowlist`, `full`)

### Coding Agent (`plugin-agent-orchestrator`)
- `GITHUB_TOKEN` — for git workspace provisioning + PR creation
- `GITHUB_OWNER`, `GITHUB_REPO` — default repository
- Adapter selection configured via `CodingAgentSettingsSection` in UI

---

## 5. How Capabilities Surface

### In the Chat UI
- **Shell commands** — agent can run shell commands inline; terminal history shows in context
- **Coding agents** — spawn button in chat; PTY console panel shows live output; routine messages filtered from main thread
- **Skills** — agent auto-installs and invokes skills during conversation
- **Vision** — agent can describe camera scenes when asked

### Via Discord Connector
- All core actions available through natural language in Discord
- `@miladyai/plugin-discord-commands` adds slash commands: `/wallet`, `/status`, admin commands
- Coding agent sessions can be started via chat; updates stream back to Discord channel

### Via REST API
- `/api/agents/:id/coding-agent/*` — coding agent routes (PTY sessions, status, I/O)
- Plugin actions exposed via standard action invocation API

---

## 6. Gaps vs OpenClaw

| Capability | OpenClaw | Milady Agent |
|-----------|---------|-------------|
| Shell execution | ✅ Full PTY | ✅ plugin-shell (with approval model) |
| File read/write | ✅ Read/Write/Edit tools | ⚠️ plugin-code (not yet installed) |
| Web browsing | ✅ Via exec (curl, playwright) | ⚠️ plugin-browser (needs stagehand-server) |
| Image analysis | ✅ image() tool | ✅ plugin-vision (now CORE) |
| Spawn sub-agents | ✅ subagents tool | ✅ plugin-agent-orchestrator (PTY-based) |
| Memory/RAG | ✅ File-based | ✅ plugin-knowledge (vector DB) |
| Cron scheduling | ✅ openclaw cron | ✅ plugin-cron |
| Skill system | ✅ SKILL.md pattern | ✅ plugin-agent-skills (marketplace) |
| Background processes | ✅ exec(background) | ✅ ShellService PTY sessions |
| MCP support | N/A | ⚠️ plugin-mcp (not yet ready) |
| Computer use | ❌ | ⚠️ plugin-computeruse (needs binaries) |

**Key gaps to close:**
1. **plugin-code** — install the package to unlock structured file/code operations
2. **plugin-browser** — wire up stagehand-server for web browsing
3. **plugin-mcp** — when ready, enables MCP tool calls (huge capability expansion)
4. **plugin-secrets-manager** — consider enabling for secure credential management

---

## 7. Changes Made in This PR

**`packages/agent/src/runtime/core-plugins.ts`:**
- Moved `@elizaos/plugin-code` from `OPTIONAL_CORE_PLUGINS` → `CORE_PLUGINS`
- Moved `@elizaos/plugin-vision` from `OPTIONAL_CORE_PLUGINS` → `CORE_PLUGINS`
- `plugin-browser` and `plugin-computeruse` remain OPTIONAL (require external binaries)

**Note:** plugin-code will fail to load until installed (`pnpm add @elizaos/plugin-code`). The load failure is non-fatal — eliza.ts catches the error and logs it at ERROR level then continues. Vision loads successfully — `@tensorflow/tfjs-node` is present in node_modules.
