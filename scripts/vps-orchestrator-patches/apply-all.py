#!/usr/bin/env python3
"""Apply ALL milady orchestrator dist patches to a fresh
@elizaos/plugin-agent-orchestrator install.

These patches address the "task agent spawned but session killed before
producing a deliverable" bug class, where Claude Code's modern TUI
(bracketed-paste mode + in-place updates) defeats the orchestrator's
line-count-based task acceptance detection.

Symptoms BEFORE patches:
  * orchestrator spawns claude PTY
  * sends task via paste mode
  * 0 new lines appear in terminal output buffer (TUI doesn't emit them)
  * orchestrator: "task may not have been accepted" → "task was not accepted"
  * reconciler: "Reconciled busy → task_complete using stable adapter output"
  * SIGKILL session
  * NO deliverable produced

Symptoms AFTER patches (verified working 2026-05-25):
  * "task accepted (0 new lines after 12000ms)"   ← lines=0 but accepted
  * tool_running events fire and are tracked
  * "task_complete {source: hook}"                ← natural completion
  * session ends cleanly without SIGKILL
  * deliverable produced (verified: cheese.html created end-to-end)

Patches applied:
  P0: VERIFY_DELAY_MS bump 5000 → 12000 ms (gives claude time to start)
  P1: module-level Map __orchestratorSessionToolRanAt
  P2a/2b: hook bun/node manager tool_running events into the Map
  P3: capture taskSendStartedAt at start of sendTaskWithRetry
  P4: extend `accepted` check with toolRanSinceBaseline (THE key fix)
  P5: cleanup Map on session_stopped
  P6: ALSO update Map from handleHookEvent (the HTTP hooks path —
       this is where Claude Code's tool_running events actually arrive)

Usage on VPS:
  scp scripts/vps-orchestrator-patches/apply-all.py root@<vps>:/tmp/
  ssh root@<vps> 'python3 /tmp/apply-all.py'
  # then SIGKILL+start botdick.service to pick up changes

Each patch checks for exactly 1 needle match and aborts if the file has
already been patched or the source is too different (e.g., a newer
@elizaos/plugin-agent-orchestrator release). Backups are NOT made by this
script — the operator should cp the file before running.
"""

import sys

P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()


def apply(needle, replace, label):
    n = src.count(needle)
    print(f"  {label}: {n} match")
    if n != 1:
        raise SystemExit(f"FAIL: expected 1 match for {label}, got {n}")
    return src.replace(needle, replace)


# ─── P0: bump VERIFY_DELAY_MS from 5s → 12s ────────────────────────────────
src = apply(
    "const VERIFY_DELAY_MS = 5000;",
    "const VERIFY_DELAY_MS = 12000;",
    "P0: VERIFY_DELAY_MS 5000→12000",
)

# ─── P1: module-level Map declaration ──────────────────────────────────────
src = apply(
    "// src/services/pty-spawn.ts\nfunction buildSanitizedBaseEnv()",
    "// src/services/pty-spawn.ts\n"
    "var __orchestratorSessionToolRanAt = new Map();\n"
    "function buildSanitizedBaseEnv()",
    "P1: Map declaration",
)

# ─── P2a: bun manager tool_running → Map ───────────────────────────────────
src = apply(
    '    bunManager.on("tool_running", (session, info) => {\n'
    '      ctx.log(`tool_running for ${session.id}: ${info.toolName}${info.description ? ` — ${info.description}` : ""}`);\n'
    '      ctx.emitEvent(session.id, "tool_running", {',
    '    bunManager.on("tool_running", (session, info) => {\n'
    '      __orchestratorSessionToolRanAt.set(session.id, Date.now());\n'
    '      ctx.log(`tool_running for ${session.id}: ${info.toolName}${info.description ? ` — ${info.description}` : ""}`);\n'
    '      ctx.emitEvent(session.id, "tool_running", {',
    "P2a: bunManager hook",
)

# ─── P2b: node manager tool_running → Map ──────────────────────────────────
src = apply(
    '  nodeManager.on("tool_running", (session, info) => {\n'
    '    ctx.log(`tool_running for ${session.id}: ${info.toolName}${info.description ? ` — ${info.description}` : ""}`);\n'
    '    ctx.emitEvent(session.id, "tool_running", {',
    '  nodeManager.on("tool_running", (session, info) => {\n'
    '    __orchestratorSessionToolRanAt.set(session.id, Date.now());\n'
    '    ctx.log(`tool_running for ${session.id}: ${info.toolName}${info.description ? ` — ${info.description}` : ""}`);\n'
    '    ctx.emitEvent(session.id, "tool_running", {',
    "P2b: nodeManager hook",
)

# ─── P3: capture taskSendStartedAt at start of each retry ──────────────────
src = apply(
    "  const sendTaskWithRetry = (attempt) => {\n"
    "    const buffer = ctx.sessionOutputBuffers.get(sid);\n"
    "    const baselineLength = buffer?.length ?? 0;",
    "  const sendTaskWithRetry = (attempt) => {\n"
    "    const buffer = ctx.sessionOutputBuffers.get(sid);\n"
    "    const baselineLength = buffer?.length ?? 0;\n"
    "    const taskSendStartedAt = Date.now();",
    "P3: timestamp capture",
)

# ─── P4: THE key fix — accept if tool_running fired since send ─────────────
src = apply(
    "      const accepted = loading || !promptNoiseOnly && "
    "(newLines >= minNewLines || cleanedNewOutput.length >= 96);",
    "      const toolRanAt = __orchestratorSessionToolRanAt.get(sid);\n"
    "      const toolRanSinceBaseline = toolRanAt && toolRanAt >= taskSendStartedAt;\n"
    "      const accepted = loading || toolRanSinceBaseline || !promptNoiseOnly && "
    "(newLines >= minNewLines || cleanedNewOutput.length >= 96);",
    "P4: accept check extension",
)

# ─── P5: cleanup Map when session stops ────────────────────────────────────
src = apply(
    '  nodeManager.on("session_stopped", (session, reason) => {\n'
    '    ctx.emitEvent(session.id, "stopped", { reason, source: "pty_manager" });',
    '  nodeManager.on("session_stopped", (session, reason) => {\n'
    "    __orchestratorSessionToolRanAt.delete(session.id);\n"
    '    ctx.emitEvent(session.id, "stopped", { reason, source: "pty_manager" });',
    "P5: cleanup on session_stopped",
)

# ─── P6: also update Map from HTTP hooks path (handleHookEvent) ────────────
# Claude Code's tool_running events arrive via HTTP hooks → this method,
# NOT via bun/node manager events. Without this, P2a/P2b never fire and
# P4 stays false. THIS IS THE ONE THAT MAKES THE FIX ACTUALLY WORK.
src = apply(
    "      switch (event) {\n"
    '        case "tool_running":\n'
    '          this.emitEvent(sessionId, "tool_running", { ...data, source: "hook" });\n'
    "          break;",
    "      switch (event) {\n"
    '        case "tool_running":\n'
    "          __orchestratorSessionToolRanAt.set(sessionId, Date.now());\n"
    '          this.emitEvent(sessionId, "tool_running", { ...data, source: "hook" });\n'
    "          break;",
    "P6: HTTP hooks → Map update",
)

open(P, "w").write(src)
print("\n✓ All 7 patches written cleanly.")
print("Next: SIGKILL botdick.service then start it to pick up changes.")
