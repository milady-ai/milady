# Milady LifeOps & Companion Plan

## Vision

A unified personal companion that knows what's going on everywhere — Discord, email, calendar, GitHub, the app — and helps you focus, remember, and get things done. One agent, fully aware, across all platforms. The end goal: be a better, more organized, more focused person.

Not multiple agents. Not siloed chat windows. One Milady that you can ask "what's happening on Discord?" from Electron and get a real answer.

---

## How The System Actually Works

### One Runtime, Many Connectors
There is ONE `AgentRuntime` instance. Discord, Electron, Telegram — these are I/O connectors, not separate agents. They all feed into and out of the same runtime with the same character, same memory, same database.

The "agent orchestrator" (`plugin-agent-orchestrator`) is a separate concept — it spawns coding CLIs (Claude Code, Codex) as work tools. Those are task executors the agent dispatches, not subagents.

### Unified Identity (Already Built)
The system already resolves "you on Discord" = "you in the app":
- One `Entity` per person with a stable UUID across all platforms
- Platform metadata: `entity.metadata.discord`, `.telegram`, `.app`, etc.
- `ensureConnection()` in each connector maps platform IDs to the canonical entity
- `RelationshipsGraphService` + `identity_links` table for cross-platform contact resolution
- **All memories from all connectors live in ONE shared database**

### Context Management (Odi's Segment System)
The prompt isn't a monolithic blob. It's managed through:
- **PromptSegments** — stable (cacheable) vs dynamic content
- **PromptBatcher** — independent sections with token budgets
- **PromptDispatcher** — packs sections into LLM calls respecting limits
- **Intent-aware compaction** — detects what you're asking about (coding? wallet? calendar?) and strips irrelevant action params (~34% savings)
- **Auto-compaction** — conversation > ~25k tokens gets summarized
- **Validation levels** (0-3) — checkpoint codes catch context window truncation

This handles prompts intelligently within budget. The segment/slot architecture means adding new context sources (like cross-platform data) is a matter of adding a new section, not redesigning the prompt.

---

## The Gap: Context Permeability

### What's Broken
The `recentMessages` provider queries ONLY the current `roomId`. Each Discord channel, each app chat session, each Telegram thread — separate rooms. When you switch platforms, recent conversation from the other platform isn't in the prompt. The data IS there (shared DB), it just doesn't get loaded.

### The Design Principle
Morrison: "Siloed by default, permeable on purpose." The siloing exists. The permeability controls don't.

You don't want everything dumped everywhere by default (that's noisy and wastes context budget). You want the agent to pull cross-platform context when it's relevant — either because you asked about another platform, or because something important happened there.

### The Fix
One new context provider. Not a rearchitecture. It hooks into the existing PromptBatcher pipeline:

1. **Intent detection** — recognizes "what's happening on Discord", "did anyone reply", "check my email" as cross-platform queries
2. **Cross-room query** — pulls recent memories from other platform rooms (shared DB, already indexed)
3. **Budget-aware injection** — adds as a new prompt section with its own token allocation
4. **Source attribution** — "Recent activity on Discord #general:" so the agent knows where info came from

**Key files:**
- `eliza/packages/typescript/src/features/basic-capabilities/providers/recentMessages.ts` — model for the new provider
- `eliza/packages/typescript/src/runtime.ts` — `composeState()` (lines 2778-3038)
- `eliza/packages/typescript/src/services/message.ts` — message handler

---

## Coding Subscriptions

### What Works Today
The orchestrator supports 1 Claude Code + 1 Codex running simultaneously. Auth is one file per CLI:
- Claude Code: `~/.claude/.credentials.json`
- Codex: `~/.codex/auth.json`

Capability scores make this the natural split:
| Agent | Planning | Coordination | Implementation | Fast Iteration | Repo Work |
|-------|----------|-------------|----------------|----------------|-----------|
| Claude Code | 1.0 | 1.0 | 0.95 | 0.85 | 0.9 |
| Codex | 0.85 | 0.7 | 1.0 | 0.95 | 1.0 |

### Plan
- 1 Claude sub → orchestrator (planning, architecture, coordination)
- 1 Codex sub → orchestrator (implementation, fast iteration, repo work)
- 2nd Codex sub → direct CLI use, separate worktrees, or your own terminal
- Future: multi-account support is an enhancement to `task-agent-frameworks.ts` (currently boolean auth check, could become array)

### Setup
```bash
claude auth status          # verify logged in
codex login status          # verify logged in
```
```env
PARALLAX_LLM_PROVIDER=subscription
```

**Key files:**
- `eliza/plugins/plugin-agent-orchestrator/src/services/task-agent-frameworks.ts`
- `eliza/plugins/plugin-agent-orchestrator/src/services/agent-credentials.ts`
- `eliza/plugins/plugin-agent-orchestrator/src/services/task-agent-auth.ts`

---

## What's Already Built

### Heartbeat & Scheduling
| What | Where | Status |
|------|-------|--------|
| Heartbeat worker | `plugin-cron/.../heartbeat/` | Configurable interval, active hours, HEARTBEAT.md prompt, delivery targets, event queue |
| Cron service | `plugin-cron/.../cron-service.ts` | CRUD for scheduled jobs, cron/interval/one-shot, natural language creation |
| Proactive agent | `activity-profile/proactive-planner.ts` | GM/GN, pre-activity nudges, downtime task nudges, goal check-ins |
| Activity profiler | `activity-profile/service.ts` | Learns active hours, sleep patterns, screen focus |
| Activity signals | `app-core/.../useLifeOpsActivitySignals.ts` | Page visibility, app lifecycle, power state, health data |

### Discord
| What | Where | Status |
|------|-------|--------|
| Discord service | `plugin-discord/typescript/service.ts` | Multi-channel, multi-account, events, 5000+ lines |
| Listen channels | `DISCORD_LISTEN_CHANNEL_IDS` | Monitor without responding (surveillance) |
| Summarize | `actions/summarizeConversation.ts` | Date-range, per-channel or cross-channel, LLM-powered |
| Proactive send | `sendMessage` / `sendDM` actions | Agent-initiated messages |

### GitHub & Coding
| What | Where | Status |
|------|-------|--------|
| GitHub plugin | `@elizaos/plugin-github` | Issues, PRs, code search, file access |
| Agent orchestrator | `plugin-agent-orchestrator/` | Claude Code + Codex + Gemini + Aider, PTY, ranked selection |
| Swarm coordinator | `.../swarm-coordinator.ts` | Multi-task monitoring, stall detection, completion |
| Workspace service | `.../workspace-service.ts` | Git ops, GitHub auth, issue lifecycle, PR creation |

### LifeOps (Email, Calendar, Tasks)
| What | Where | Status |
|------|-------|--------|
| Gmail | `app-lifeops/.../gmail.ts` | 8 subactions: triage, search, read, draft, send, batch |
| Calendar | `app-lifeops/.../calendar.ts` | 8 subactions: feed, next_event, search, create, update, delete |
| Google OAuth | `app-lifeops/.../google-oauth.ts` | 3 modes (local/remote/cloud), capability scopes, token persistence |
| LifeOps scheduler | `app-lifeops/.../runtime.ts` | Runs every 60-70s, reminders, habits, goals, routines |
| LifeOps dashboard | `app-lifeops/.../{PageView,WorkspaceView}.tsx` | Agenda + week + email panes |
| Task management | `agent/.../manage-tasks.ts` | CRUD, completion tracking |
| Follow-ups | `typescript/.../followUp.ts` | Contact follow-ups, suggestions, snooze |
| Inbox triage | `app-lifeops/.../inbox/repository.ts` | Unified inbox classification |
| Browser companion | `app-lifeops/` | Chrome/Safari, website blocking, screen time |

### Self-Configuration
| What | Where | Status |
|------|-------|--------|
| Character self-edit | `agent/.../character-persistence.ts` | Agent modifies own personality, style, settings |
| Config system | `agent/.../config.ts` | Atomic writes, persisted config merging |
| Plugin auto-enable | `agent/.../plugin-auto-enable.ts` | 90+ plugins auto-enable from env vars |
| Trajectory logging | `agent/.../trajectory-persistence.ts` | Records interactions for learning |

---

## Phases

### Phase 0: Connect Coding Subscriptions
**Config only. Verify the orchestrator works.**

- [ ] `claude auth status` — verify Claude Code logged in
- [ ] `codex login status` — verify Codex logged in
- [ ] Add to `~/.milady/.env`: `PARALLAX_LLM_PROVIDER=subscription`
- [ ] Test: spawn a task through the app, confirm PTY + orchestrator work
- [ ] Confirm: Claude gets planning tasks, Codex gets implementation tasks

### Phase 1: Connect Google (Email + Calendar)
**Config + OAuth flow. Gets LifeOps online.**

- [ ] GCP project with Gmail API + Calendar API enabled
- [ ] OAuth 2.0 credentials (Desktop type for local mode)
- [ ] Add to `~/.milady/.env`:
  ```
  ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID=<id>
  ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_SECRET=<secret>
  ```
- [ ] Launch Milady → LifeOps tab → complete OAuth
- [ ] Grant: `google.calendar.read`, `google.calendar.write`, `google.gmail.triage`, `google.gmail.send`
- [ ] Test: "what's on my calendar today", "check my email"
- [ ] Verify dashboard shows agenda + email panes
- [ ] Verify LifeOps UI is wired in boot config (may need `lifeOpsPageView` injection in app shell)

### Phase 2: Connect Discord
**Config only. Monitoring + summaries + proactive messaging.**

- [ ] Discord bot token → `DISCORD_API_TOKEN`
- [ ] ALL channels to monitor → `DISCORD_LISTEN_CHANNEL_IDS`
- [ ] Channels where Milady responds → `CHANNEL_IDS`
- [ ] Ensure DMs enabled (no `DISCORD_SHOULD_IGNORE_DIRECT_MESSAGES`)
- [ ] Test: Milady sees messages in listen channels
- [ ] Test: "summarize what happened in #general today"
- [ ] Test: proactive DM delivery

### Phase 3: Connect GitHub
**Config only. Repo awareness + coding dispatch.**

- [ ] `GITHUB_TOKEN` (PAT with repo scope)
- [ ] `GITHUB_OWNER` / `GITHUB_REPO`
- [ ] Test: "what PRs are open?"
- [ ] Test: "create an issue for..."
- [ ] Test: spawn coding task via orchestrator

### Phase 4: Cross-Platform Context Provider
**The engineering task. Makes everything feel unified.**

Build a new provider that makes Milady aware across platforms:
- Intent detection for cross-platform queries
- Cross-room memory query (shared DB)
- Budget-aware prompt section injection
- Source attribution per platform

Approach: "siloed by default, permeable on purpose" — don't load everything always, load cross-platform context when there's a signal it's needed.

### Phase 5: Heartbeats & Morning Briefing
**The daily loop. Proactive check-ins start.**

- Configure heartbeat: every 1h, active hours 7am-10pm
- Write HEARTBEAT.md prompt: Discord recap, GitHub activity, email flags, calendar, tasks
- Morning cron (7am): comprehensive daily briefing → app + Discord DM
- Enable proactive agent: GM/GN messages, pre-meeting nudges

### Phase 6: Escalation Learning
**Gets smarter over time.**

- Feedback on heartbeat messages (reactions, engagement tracking)
- Priority model: channels, topics, people ranked by engagement
- Escalation tiers:
  - **Immediate**: @mentions, CI failures, urgent email → DM + app
  - **Hourly**: notable activity, new issues → heartbeat
  - **Morning**: full recap → daily briefing
  - **Weekly**: trends, goals → weekly digest

### Phase 7: Focus & Productivity
**Full companion behavior.**

- Calendar → proactive planner: pre-meeting nudges
- Email → proactive planner: response reminders in downtime
- Tasks → heartbeat: overdue surfacing
- Focus mode: batch non-urgent during coding sessions
- Self-tuning: weekly review of engagement → adjust priorities

### Phase 8: Stretch
- Voice check-ins (TTS built)
- Telegram connector (same permeability)
- Browser companion (screen time, website blocking)
- Relationship tracking + follow-up scheduling
- Long-term goal tracking + weekly progress
- External task sources (Things, Todoist, Linear)

---

## Sequencing

```
Phase 0  Connect subs              config only     ← foundation check
Phase 1  Google OAuth               config + flow   ← email + calendar live
Phase 2  Discord                    config only     ← monitoring + summaries
Phase 3  GitHub                     config only     ← repo awareness
  ---- everything above is config, no code ----
Phase 4  Cross-platform context     engineering     ← unified awareness
Phase 5  Heartbeats + briefing      config + prompt ← daily loop starts
Phase 6  Escalation learning        engineering     ← adaptive priorities
Phase 7  Focus + productivity       wiring          ← full companion
Phase 8  Stretch                    ongoing         ← expanded reach
```

---

## 2026-04-14 Reality Check (Today)

### What We Confirmed
- The app/runtime is up and connectors are active, but chat inference intermittently routes through a cloud path returning Vercel-style `insufficient funds` errors.
- Your Eliza Cloud billing UI shows a positive balance, so this looks like **routing/account mismatch**, not "you didn't pay."
- Discord "stuck typing" was a real failure mode when provider errors looped.
- Coding-agent lane (Claude/Codex orchestrator) is separate from chat lane, but preflight auth checks were noisy due to spawn/path instability and a Claude token refresh issue.

### What Was Implemented Today
- Hybrid chat routing guardrails were added in runtime message service:
  - Ollama primary
  - Eliza Cloud fallback
  - billing/provider error classification
  - fallback diagnostics in `/api/status`
  - cooldown + fallback-attempt logging
- Discord no-hang behavior was added:
  - timeout around generation while typing
  - guaranteed typing clear on success/error/timeout
  - explicit failure message instead of infinite typing
- Provider ID normalization fix:
  - normalized `eliza-cloud` -> `elizacloud` to avoid fallback misrouting.

### Remaining Live Issues
- Chat can still surface cloud billing mismatch events if backend/account route is wrong upstream.
- Claude auth file exists but prior logs showed refresh token invalid/revoked; may require re-auth.
- Coding preflight can report `uv_spawn ENOENT` even when binaries exist, indicating environment/path inconsistency in the spawned process context.
- Separate machine stability symptoms (GPU/audio/device-level errors) can amplify app instability and should be treated as infra health, not only app logic.

---

## Phase S0: Stabilize Runtime Before Feature Expansion

Do this before new LifeOps features.

- [ ] Hard-pin chat to Ollama-only temporarily (disable cloud chat route) until account-route mapping is verified.
- [ ] Verify no stuck-typing regression in Discord with forced provider failures.
- [ ] Confirm `/api/status` chatRouting diagnostics stay on expected provider path.
- [ ] Re-verify Claude + Codex preflight in-app after PATH/spawn stabilization.
- [ ] Re-auth Claude only if preflight still reports invalid/revoked token after spawn issue is fixed.
- [ ] Only then re-enable cloud fallback for chat.

Exit criteria for S0:
- 20+ consecutive Discord/app replies with no hangs
- no false `insufficient funds` while Ollama is primary
- coding task spawn succeeds for at least one Codex task and one Claude task

---

## Open Questions

- [ ] For S0, do you want cloud chat fallback disabled completely until route mapping is verified?
- [ ] Do we keep coding lane default to Codex first until Claude preflight is stable?
- [ ] Discord: which server(s) and channels are day-1 priority for recap/escalation?
- [ ] Google: GCP project ready now, or include project creation in Phase 1 checklist?
- [ ] GitHub: PAT ready now, or include PAT creation in Phase 3 checklist?
- [ ] Preferred morning briefing time and timezone for heartbeat/cron?
- [ ] Cross-platform provider change: upstream to elizaOS or Milady-only first?
