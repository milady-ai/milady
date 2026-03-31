# Discord ↔ OpenClaw Parity: Capability Audit & Integration Plan

**Date:** 2026-03-31
**Repo:** `milaidy-dev` (develop branch)
**ElizaOS version:** 2.0.0-alpha.116
**Auditor:** Sol (worker-discord-audit)

---

## 1. Audit: Existing Discord Plugin (`@elizaos/plugin-discord`)

### Status
- **Package:** `@elizaos/plugin-discord@1.3.8` (published on npm, upstream ElizaOS)
- **Install status:** Listed in `OPTIONAL_CORE_PLUGINS` but **NOT currently installed** in node_modules
- **Position:** Optional plugin — must be explicitly enabled via character config or admin panel

### What It Already Supports

**Actions (built-in):**

| Action | Description |
|--------|-------------|
| `chatWithAttachments` | Handle messages with Discord attachments |
| `createPoll` | Create a poll in a channel |
| `downloadMedia` | Download media files from messages |
| `getUserInfo` | Get user info |
| `joinVoice` | Join a voice channel |
| `leaveVoice` | Leave a voice channel |
| `listChannels` | List server channels |
| `pinMessage` / `unpinMessage` | Pin/unpin messages |
| `reactToMessage` | Add emoji reactions |
| `readChannel` | Read channel messages |
| `searchMessages` | Search messages |
| `sendDM` | Send direct messages |
| `serverInfo` | Server information |
| `summarize` | Summarize conversation |
| `transcribeMedia` | Transcribe audio/video |

**Providers:**
- `channelStateProvider` — channel state info
- `voiceStateProvider` — voice channel/connection state

**Slash Commands:**
- Supports registration via `DISCORD_REGISTER_COMMANDS` event
- Hybrid permission system: Discord native + ElizaOS channel whitelist + custom validators
- `guildOnly`, `bypassChannelWhitelist`, `requiredPermissions`, `contexts`, `guildIds`, `validator` options
- Modal submit handling (`DISCORD_MODAL_SUBMIT`)
- Component interactions bypass channel whitelists

**Events Emitted:**
- `DISCORD_MESSAGE_RECEIVED/SENT`
- `DISCORD_SLASH_COMMAND`
- `DISCORD_MODAL_SUBMIT`
- `DISCORD_REACTION_RECEIVED/REMOVED`
- `DISCORD_WORLD_JOINED`
- `DISCORD_SERVER_CONNECTED`
- `DISCORD_USER_JOINED/LEFT`
- `DISCORD_VOICE_STATE_CHANGED`
- Permission audit events (channel/role/member changes)

### How It Integrates
- Runs as an ElizaOS plugin, registers a `DiscordService` extending ElizaOS Service
- Messages flow through `MessageManager` → ElizaOS runtime → actions/providers
- The runtime's actions (from ALL loaded plugins) can be invoked in response to Discord messages
- Slash commands are dispatched via the `DISCORD_SLASH_COMMAND` event — other plugins can listen

### Key Insight
The Discord plugin is a **transport layer** — it brings messages in and sends responses out. The agent runtime's loaded actions (orchestrator, shell, skills, cron) are already theoretically available because they're registered as runtime actions. **The gap is not "wiring" — it's discoverability, explicit slash commands, and security gating.**

---

## 2. Audit: OpenClaw Capabilities vs Discord

### OpenClaw Capabilities (via tools/skills/direct agent access)

| Capability | Mechanism | Details |
|------------|-----------|---------|
| **Coding Agent Spawning** | `plugin-agent-orchestrator` actions | SPAWN_CODING_AGENT, START_CODING_TASK, SEND_TO_CODING_AGENT, STOP_CODING_AGENT, LIST_CODING_AGENTS |
| **Workspace Provisioning** | `plugin-agent-orchestrator` actions | PROVISION_WORKSPACE, FINALIZE_WORKSPACE (git worktrees, auto-PR) |
| **Issue Management** | `plugin-agent-orchestrator` actions | MANAGE_ISSUES (create/update/close GitHub issues) |
| **Shell Execution** | `plugin-shell` service | Runs shell commands with allowlist security + socket-based approval |
| **Skill Discovery** | `plugin-agent-skills` actions | SEARCH_SKILLS, GET_SKILL_DETAILS, GET_SKILL_GUIDANCE, INSTALL_SKILL, TOGGLE_SKILL, UNINSTALL_SKILL, RUN_SKILL_SCRIPT, SYNC_SKILL_CATALOG |
| **Cron/Scheduling** | `plugin-cron` actions | CREATE_CRON, DELETE_CRON, LIST_CRONS, RUN_CRON, UPDATE_CRON |
| **File Operations** | `plugin-code` (optional) | File read/write/edit operations |
| **Vision/Image** | `plugin-vision` (optional) | Image understanding and analysis |
| **Role-Based Access** | `@miladyai/plugin-roles` | OWNER/ADMIN/NONE hierarchy, connector admin whitelists |
| **Sub-agent Management** | OpenClaw native | sessions_spawn, sessions_send, sessions_history, sessions_list |
| **Background Processes** | OpenClaw exec/process tools | PTY allocation, background sessions, process monitoring |

### OpenClaw Discord Skill
OpenClaw has its own Discord skill (`skills/discord/SKILL.md`) that uses the `message` tool to interact with Discord — supporting send, react, read, edit, delete, poll, pin, thread-create, search, and set-presence actions. This is agent-initiated (outbound), not user-initiated (inbound slash commands).

---

## 3. Parity Gap Analysis

| Feature | OpenClaw (Agent) | Milady Discord Bot | Gap | Priority |
|---------|-----------------|-------------------|-----|----------|
| **Chat/Conversation** | ✅ Full conversational AI | ✅ MessageManager handles this | None — works when plugin loaded | — |
| **Coding Agent Spawn** | ✅ SPAWN_CODING_AGENT, START_CODING_TASK (Claude Code, Codex, Gemini, Aider, Pi) | ❌ No slash command or explicit trigger | **CRITICAL** — users can't kick off coding tasks from Discord | P0 |
| **Coding Agent Status** | ✅ LIST_CODING_AGENTS, session monitoring | ❌ No visibility from Discord | **HIGH** — users can't check agent progress | P0 |
| **Coding Agent Interaction** | ✅ SEND_TO_CODING_AGENT, STOP_CODING_AGENT | ❌ No way to send input or stop agents | **HIGH** — no agent management from Discord | P1 |
| **Workspace Provisioning** | ✅ PROVISION_WORKSPACE, FINALIZE_WORKSPACE | ❌ Not exposed | **MEDIUM** — typically automated, not user-triggered | P2 |
| **Shell Execution** | ✅ plugin-shell with allowlist | ❌ Not exposed | **HIGH** — power users need this, but security-critical | P1 |
| **Skill Search/Install** | ✅ Full skill lifecycle | ❌ Not exposed | **MEDIUM** — useful but not daily | P2 |
| **Skill Execution** | ✅ RUN_SKILL_SCRIPT | ❌ Not exposed | **MEDIUM** — useful for triggering specific skills | P2 |
| **Cron Management** | ✅ Full CRUD on cron jobs | ❌ Not exposed | **MEDIUM** — scheduling from Discord is convenient | P2 |
| **File Operations** | ✅ Read/write/edit via plugin-code | ❌ Not exposed | **LOW** — mostly agent-internal | P3 |
| **Vision/Image** | ✅ Image analysis via plugin-vision | ⚠️ Partial — Discord sends attachments, but no explicit "analyze this" | **LOW** — could auto-trigger on image attachments | P3 |
| **Role Management** | ✅ plugin-roles (OWNER/ADMIN/NONE) | ⚠️ Plugin exists but not wired to Discord permission checks | **HIGH** — security foundation | P0 |
| **Sub-agent Orchestration** | ✅ sessions_spawn/send/history | ❌ Not exposed | **MEDIUM** — overlaps with coding agent actions | P2 |
| **GitHub Issue Mgmt** | ✅ MANAGE_ISSUES | ❌ Not exposed | **LOW** — niche use case from Discord | P3 |
| **Voice Integration** | ✅ Discord plugin has joinVoice/leaveVoice | ✅ Already in plugin | None | — |
| **Reactions/Polls** | ✅ Discord plugin has these | ✅ Already in plugin | None | — |

---

## 4. Discord Commands Integration Plan

### Architecture Approach

**Option A: Natural Language Routing (Recommended for MVP)**
The Discord plugin already routes messages through the ElizaOS runtime. When the orchestrator/shell/skills/cron plugins are loaded, the agent can already invoke their actions in response to natural language messages. The "gap" is really about:
1. Making users aware these capabilities exist
2. Providing explicit slash commands for discoverability
3. Adding security gating (who can trigger what)

**Option B: Explicit Slash Commands (Recommended for Production)**
Register Discord slash commands that map directly to plugin actions. Better UX, clearer security boundaries, command autocomplete.

**Recommendation: Hybrid — Option A immediately (it mostly works already), Option B for P0 items.**

### Phase 1: Foundation (P0) — Estimated: 2-3 days

#### 1.1 Install & Enable Discord Plugin
- Add `@elizaos/plugin-discord` to dependencies
- Configure `DISCORD_API_TOKEN`, `DISCORD_APPLICATION_ID`
- Wire into character config or auto-enable logic
- **Complexity:** Low (config only)

#### 1.2 Wire Role-Based Security
The `@miladyai/plugin-roles` already has `connectorAdmins` for Discord. Need to:
- Configure Discord user IDs in `milady.json` roles config
- Ensure role checks gate sensitive actions (shell, coding agents)
- Add role check middleware for slash commands
- **Complexity:** Low-Medium (plugin exists, need to wire validators)

#### 1.3 Register Core Slash Commands

**`/code` — Start a Coding Task**
```
/code agent:<claude|codex|gemini|aider> repo:<url-or-path> task:<description>
```
- Maps to: `START_CODING_TASK` or `SPAWN_CODING_AGENT`
- Security: ADMIN+ only
- Shows ephemeral confirmation, then posts progress to thread
- **Complexity:** Medium

**`/agents` — List/Manage Coding Agents**
```
/agents list
/agents status <agent-id>
/agents stop <agent-id>
/agents send <agent-id> message:<text>
```
- Maps to: `LIST_CODING_AGENTS`, `STOP_CODING_AGENT`, `SEND_TO_CODING_AGENT`
- Security: ADMIN+ only
- **Complexity:** Medium

**`/status` — System Status**
```
/status
```
- Shows: loaded plugins, active agents, cron jobs, system health
- Security: ADMIN+ only (or read-only for all)
- **Complexity:** Low

### Phase 2: Power User Commands (P1) — Estimated: 3-4 days

#### 2.1 Shell Command

**`/shell` — Execute Shell Command**
```
/shell command:<string>
```
- Maps to: `plugin-shell` service
- Security: **OWNER ONLY** — this is the most dangerous command
- Shows output in ephemeral message or thread
- Respects existing shell allowlist from plugin-shell config
- **Complexity:** Medium-High (need to carefully bridge shell plugin's socket-based approval)

#### 2.2 Cron Management

**`/cron` — Manage Scheduled Jobs**
```
/cron list
/cron create schedule:<cron-expr> task:<description> [channel:<id>]
/cron delete <cron-id>
/cron run <cron-id>
```
- Maps to: `CREATE_CRON`, `DELETE_CRON`, `LIST_CRONS`, `RUN_CRON`
- Security: ADMIN+ only
- **Complexity:** Medium

### Phase 3: Skill & Utility Commands (P2) — Estimated: 2-3 days

#### 3.1 Skill Commands

**`/skill` — Skill Discovery & Management**
```
/skill search <query>
/skill install <name>
/skill list
/skill run <name> [args]
```
- Maps to: `SEARCH_SKILLS`, `INSTALL_SKILL`, `RUN_SKILL_SCRIPT`, etc.
- Security: ADMIN+ for install/uninstall, anyone for search/run
- **Complexity:** Medium

#### 3.2 Workspace Commands

**`/workspace` — Git Workspace Management**
```
/workspace provision repo:<url> [branch:<name>]
/workspace finalize <workspace-id> [pr-title:<text>]
```
- Maps to: `PROVISION_WORKSPACE`, `FINALIZE_WORKSPACE`
- Security: ADMIN+ only
- **Complexity:** Medium

### Phase 4: Polish (P3) — Estimated: 1-2 days

#### 4.1 Auto-Vision on Image Attachments
- When an image is attached to a message mentioning the bot, auto-trigger vision analysis
- Maps to: `plugin-vision`
- No slash command needed — automatic behavior
- **Complexity:** Low

#### 4.2 GitHub Issue Commands
```
/issue create repo:<url> title:<text> body:<text>
/issue list repo:<url>
```
- Maps to: `MANAGE_ISSUES`
- **Complexity:** Low

---

## 5. Security Model

### Permission Tiers

| Tier | Discord Mapping | Allowed Commands |
|------|----------------|-----------------|
| **OWNER** | Configured owner Discord ID(s) in `milady.json` | Everything including `/shell` |
| **ADMIN** | Discord IDs in `roles.connectorAdmins.discord` | `/code`, `/agents`, `/cron`, `/skill install`, `/workspace` |
| **USER** | Everyone else | Chat, `/skill search`, `/skill run` (safe skills), `/status` (read-only) |

### Security Implementation

1. **Slash command validators:** Each command registration includes a `validator` function that checks `plugin-roles` for the user's role
2. **Channel restrictions:** Use `CHANNEL_IDS` env var to limit bot to specific channels
3. **Shell allowlist:** `plugin-shell` already has an allowlist — `/shell` respects it
4. **Audit logging:** All privileged commands logged via `plugin-roles` + Discord audit events
5. **Ephemeral responses:** Sensitive output (shell, agent logs) sent as ephemeral messages

### Example Validator Pattern
```typescript
const adminValidator = async (interaction, runtime) => {
  const role = await checkSenderRole(runtime, interaction.user.id, 'discord');
  return role.isAdmin || role.isOwner;
};

const ownerValidator = async (interaction, runtime) => {
  const role = await checkSenderRole(runtime, interaction.user.id, 'discord');
  return role.isOwner;
};
```

---

## 6. Implementation Strategy

### What Needs Wiring vs New Code

| Item | Existing Plugin | Needs New Code? | Notes |
|------|----------------|-----------------|-------|
| Discord transport | `@elizaos/plugin-discord` | **No** — install & configure | Just not installed yet |
| Natural language → actions | ElizaOS runtime | **No** — works when plugins loaded | Agent already routes messages to actions |
| Slash command registration | `@elizaos/plugin-discord` event system | **Yes — thin glue layer** | ~50-100 lines per command to register + handle |
| Role-based gating | `@miladyai/plugin-roles` | **Minimal** — wire validators | Plugin exists, need to pass validators to commands |
| Shell bridging | `@elizaos/plugin-shell` | **Yes — medium** | Shell uses socket approval; need Discord-native approval flow |
| Progress reporting | `@elizaos/plugin-agent-orchestrator` | **Yes — medium** | Need to stream agent output to Discord threads |
| Thread-based agent output | New | **Yes** | Create Discord thread per coding task, post updates there |

### Recommended File Structure
```
packages/agent/src/discord-commands/
├── index.ts          # Register all commands on DISCORD_SERVER_CONNECTED
├── code.ts           # /code command handler
├── agents.ts         # /agents command handler
├── shell.ts          # /shell command handler
├── cron.ts           # /cron command handler
├── skill.ts          # /skill command handler
├── status.ts         # /status command handler
├── workspace.ts      # /workspace command handler
└── validators.ts     # Shared permission validators using plugin-roles
```

### Key Technical Decisions

1. **Where to register commands:** Listen for `DISCORD_SERVER_CONNECTED` event, then emit `DISCORD_REGISTER_COMMANDS` with all slash commands + validators

2. **How to handle long-running tasks (coding agents):** 
   - Defer reply immediately (`interaction.deferReply()`)
   - Create a thread under the interaction message
   - Stream agent output to thread as periodic updates
   - Final result posted to thread with summary

3. **How to bridge shell approval:**
   - Option A: Auto-approve if user is OWNER (simplest)
   - Option B: Discord button-based approval (better UX, more work)
   - Recommend Option A for MVP

4. **Where this code lives:**
   - Could be a new `@miladyai/plugin-discord-commands` package
   - Or integrated into the existing `packages/agent` setup
   - Recommend: new package for clean separation

---

## 7. Quick Win: Zero-Code Improvement

Before writing any new code, just **installing the Discord plugin** and loading it alongside the existing CORE plugins would give:
- Natural language access to ALL loaded actions (orchestrator, cron, skills, shell)
- The agent can already "spawn a coding agent" if asked in Discord — it just invokes the orchestrator action
- The gap becomes discoverability and explicit security, not capability

**Action item:** Add `@elizaos/plugin-discord` to deps, configure tokens, and test natural language access to existing actions. This validates the architecture before building slash commands.

---

## 8. Estimated Timeline

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|-------------|
| Phase 0 | Install Discord plugin + test NL routing | 0.5 days | Discord bot token |
| Phase 1 | /code, /agents, /status + role security | 2-3 days | Phase 0 |
| Phase 2 | /shell, /cron | 3-4 days | Phase 1 |
| Phase 3 | /skill, /workspace | 2-3 days | Phase 1 |
| Phase 4 | Auto-vision, /issue | 1-2 days | Phase 1 |
| **Total** | **Full parity** | **~9-12 days** | |

---

## Appendix A: Plugin Dependency Graph

```
@elizaos/plugin-discord (transport)
  ├── receives Discord messages
  ├── routes through ElizaOS runtime
  └── runtime has access to:
      ├── @elizaos/plugin-agent-orchestrator (CORE)
      │   └── SPAWN_CODING_AGENT, START_CODING_TASK, etc.
      ├── @elizaos/plugin-shell (CORE)
      │   └── shell command execution
      ├── @elizaos/plugin-agent-skills (CORE)
      │   └── SEARCH_SKILLS, INSTALL_SKILL, etc.
      ├── @elizaos/plugin-cron (CORE)
      │   └── CREATE_CRON, LIST_CRONS, etc.
      ├── @elizaos/plugin-commands (CORE)
      │   └── slash command handling
      ├── @miladyai/plugin-roles (CORE)
      │   └── OWNER/ADMIN/NONE gating
      ├── @elizaos/plugin-code (OPTIONAL)
      │   └── file operations
      └── @elizaos/plugin-vision (OPTIONAL)
          └── image analysis
```

## Appendix B: Existing Discord Workflow (from docs)

Per `docs/discord-workflow.md`, the current architecture is:
```
Shadow (Discord) → OpenClaw → Sol (main session)
                                  ├── spawns builder-1 (isolated)
                                  ├── spawns builder-2 (isolated)
                                  ├── spawns researcher (isolated)
                                  └── relays to Discord channels
```

The Milady Discord bot would run **alongside** this flow — it's not replacing OpenClaw, it's adding a direct Discord-native interface for capabilities that currently require going through OpenClaw's agent layer.
