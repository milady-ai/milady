# VPS Orchestrator Patches

Surgical patches to `@elizaos/plugin-agent-orchestrator`'s bundled `dist/index.js`
on the botdick VPS, addressing a class of "subagent spawns but produces no
deliverable" bugs.

## Problem

The orchestrator's `sendTaskWithRetry` (in `src/services/pty-spawn.ts`)
detects task acceptance by counting new lines appended to the session's
terminal output buffer:

```js
const accepted = loading || !promptNoiseOnly && (newLines >= minNewLines || ...);
```

But Claude Code's modern TUI (>= v2.1.x) uses **bracketed-paste mode**
for input and **in-place TUI updates** for the spinner/prompt. Pasted
task content does NOT generate visible new lines in the terminal output
buffer, even though claude IS actively processing it (proven by
`tool_running` hook events firing).

Result: orchestrator declares "task may not have been accepted" → "task
was not accepted after 3 attempts" → leaves task undelivered → reconciler
later observes stable idle prompt → "Reconciled busy → task_complete
using stable adapter output" → SIGKILL session. No deliverable produced.

## Fix

Trust `tool_running` hook events as evidence of task acceptance. If
claude has started using a tool since we sent the task, the task was
clearly received — regardless of whether the terminal output buffer
got new visible lines.

7 patches in one script (`apply-all.py`):

| # | What | Why |
|---|------|-----|
| P0 | `VERIFY_DELAY_MS` 5000 → 12000 ms | Modern claude can take ~10s to start tool output; old default gave up at 5s |
| P1 | Add module-level `__orchestratorSessionToolRanAt = new Map()` | Per-session "last tool ran at" timestamp |
| P2a | Update Map from `bunManager.on("tool_running")` | Covers bun worker path |
| P2b | Update Map from `nodeManager.on("tool_running")` | Covers node-pty path |
| P3 | Capture `taskSendStartedAt` at start of each `sendTaskWithRetry` | So we can check "did a tool run *since this send*" |
| P4 | Add `toolRanSinceBaseline` to the `accepted` check | THE acceptance fix |
| P6 | Update Map from `handleHookEvent` HTTP hook path | **The critical one** — Claude Code's tool events arrive via HTTP hooks (POST to a sidecar), NOT via bun/node manager `.on()`. Without this, P2a/P2b never fire and the fix is dead |
| P5 | Delete Map entry on `session_stopped` | Cleanup |

(P0 standalone is a partial mitigation; without P4+P6 the line count
still stays at 0 forever and we still time out.)

## Verification

Verified end-to-end on 2026-05-25:

1. `POST /api/coding-agents/spawn` with `{agentType:"claude", task:"create cheese.html"}` → 201 with sessionId
2. Journal showed `task accepted (0 new lines after 12000ms)` ← P4 fired
3. `task_complete {source:"hook"}` ← claude signalled done naturally
4. `cheese.html` actually written to disk

Live deliverable: <https://projects.botdick.com/cheese/>

## Apply

```bash
# Make a backup yourself first
ssh root@VPS 'cp /opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js{,.bak-$(date +%s)}'

# Then apply
scp apply-all.py root@VPS:/tmp/
ssh root@VPS 'python3 /tmp/apply-all.py'

# Hard restart (per CLAUDE.md "deactivating-forever trap")
ssh root@VPS 'systemctl kill botdick --signal=SIGKILL && sleep 2 && systemctl reset-failed botdick 2>/dev/null; systemctl start botdick'
```

The script exits non-zero if any needle fails to match exactly once
(idempotency guard + version-skew safety).

## Why these aren't upstreamed yet

The github develop branch (2.0.3 as of 2026-05-22) has commits with
titles suggesting upstream is working on the same class of bug:

```
May 22  fix(orchestrator): polish verified app completions
May 22  fix(orchestrator): require fresh routed artifacts by default
May 22  fix(orchestrator): preserve app route contracts across sub-agent retries
May 21  fix(orchestrator): stabilize sub-agent app build handoff
```

But pulling develop into our install is a structural reset — the dist
layout changed (`dist/node/index.node.js` vs our `dist/index.js`) and
the monorepo workspace install has dependency loops in the current
develop snapshot. These surgical patches give us the fix without that
risk while we decide whether to invest in a full reset.
