#!/usr/bin/env python3
"""Patch: fix two visible bugs that pile up in Discord output.

ISSUE A — "stopped before completion" posted after "completed the task"
=======================================================================

When a session emits task_complete via the HTTP hook, the orchestrator's
SwarmCoordinator runs this:

  case "task_complete": {
    this.broadcast({ type: "turn_complete", ... });
    this.sendVerboseProgress(taskCtx, "turn finished; ...");
    // schedule coalesce timer (~1500ms) → handleTurnComplete runs THEN
    setTimeout(() => handleTurnComplete(...), TURN_COMPLETE_COALESCE_MS);
  }

handleTurnComplete is the function that sets taskCtx.status = "completed".
But the START_CODING_TASK callback (in registerSessionEvents) ALSO fires
on task_complete and IMMEDIATELY kills the session with
ptyService.stopSession(sessionId, true).

The PTY kill produces a "stopped" event that fires BEFORE the coalesce
timer's handleTurnComplete runs. The "stopped" case sees taskCtx.status
is still "active" (NOT "completed"), so it posts:

    "${label}" stopped before completion.

Net result: user sees both "completed the task" AND "stopped before
completion" for a perfectly successful task.

Fix: set taskCtx.status = "completed" IMMEDIATELY at the start of the
task_complete case (before the coalesce timer). Then when "stopped"
fires from the kill, it sees taskCtx.status === "completed" and
suppresses the bogus message.


ISSUE B — Workspace shown is bot's repo, not a scratch dir
===========================================================

The Discord-triggered shortcut path correctly omits workdir (patch 10).
But CREATE_TASK has a 6-step fallback chain to RESOLVE a workdir if
none was provided:

  1. params.workdir / text-extracted workdir          ← (none for fresh request)
  2. state.codingWorkspace.path                       ← (none)
  3. state.codingSession.workdir                      ← (none)
  4. coordinator.listTaskThreads() → latestWorkdir    ← PICKS UP OLD THREAD'S WORKDIR
  5. wsService.listWorkspaces() last                  ← (or this)
  6. process.cwd() = /opt/botdick/milady-fisbat-integration ← final fallback

For fresh site requests, step 4 grabs the workdir of a PRIOR completed
task. If any prior task ran in the bot's repo (which most did before
patch 10), every subsequent task inherits that path. Workspace never
gets to be a scratch dir, so:
  - no Browse URL appears
  - work piles up in bot's repo
  - files from different tasks collide

Fix: gate steps 4 and 5 on the candidate workdir actually being under
~/.eliza/workspaces/ or ~/.milady/workspaces/. If it's anywhere else
(like the bot's repo), skip it and let CREATE_TASK create a fresh
scratch dir.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()


def apply(needle, replace, label):
    n = src.count(needle)
    print(f"  {label}: {n} match")
    if n != 1:
        raise SystemExit(f"FAIL: expected 1 match for {label}, got {n}")
    return src.replace(needle, replace)


# ─── A: set taskCtx.status = "completed" immediately on task_complete ─────
src = apply(
    '      case "task_complete": {\n'
    '        this.broadcast({\n'
    '          type: "turn_complete",\n'
    "          sessionId,\n"
    "          timestamp: Date.now(),\n"
    "          data\n"
    "        });\n"
    '        this.sendVerboseProgress(taskCtx, "turn finished; validating whether this is complete or needs the next iteration.");',
    '      case "task_complete": {\n'
    "        // ─ Milady patch: mark taskCtx completed immediately so the \"stopped\"\n"
    "        // event that fires when the PTY is killed doesn't post the bogus\n"
    '        // "stopped before completion." message. The coalesce timer below still\n'
    "        // runs handleTurnComplete for the full review/followup pipeline.\n"
    "        if (taskCtx.status !== \"completed\" && taskCtx.status !== \"error\") {\n"
    "          taskCtx.status = \"completed\";\n"
    "          taskCtx.completedAt = Date.now();\n"
    "        }\n"
    '        this.broadcast({\n'
    '          type: "turn_complete",\n'
    "          sessionId,\n"
    "          timestamp: Date.now(),\n"
    "          data\n"
    "        });\n"
    '        this.sendVerboseProgress(taskCtx, "turn finished; validating whether this is complete or needs the next iteration.");',
    "A: task_complete sets status immediately",
)

# ─── B: gate steps 4-5 of workdir fallback chain on workspace dir match ───
src = apply(
    '    if (!workdir && coordinator) {\n'
    '      const roomId = messageField(message, "roomId");\n'
    "      const scoped = roomId ? await coordinator.listTaskThreads({\n"
    "        includeArchived: false,\n"
    "        roomId,\n"
    "        statuses: [...ACTIVE_THREAD_STATUSES2],\n"
    "        limit: 10\n"
    "      }) : [];\n"
    "      const recent = scoped.length > 0 ? scoped : await coordinator.listTaskThreads({\n"
    "        includeArchived: false,\n"
    "        statuses: [...ACTIVE_THREAD_STATUSES2],\n"
    "        limit: 10\n"
    "      });\n"
    '      workdir = recent.find((thread) => thread.latestWorkdir)?.latestWorkdir ?? "";\n'
    "    }\n"
    "    if (!workdir) {\n"
    '      const wsService = runtime.getService("CODING_WORKSPACE_SERVICE");\n'
    "      if (wsService) {\n"
    "        const workspaces = wsService.listWorkspaces();\n"
    "        if (workspaces.length > 0) {\n"
    "          workdir = workspaces[workspaces.length - 1].path;\n"
    "        }\n"
    "      }\n"
    "    }",
    "    // ─ Milady patch: only reuse prior workdir if it's a scratch workspace ─\n"
    "    // Otherwise CREATE_TASK inherits the bot's repo path from earlier tasks\n"
    "    // and every fresh site request runs in /opt/botdick/milady-fisbat-integration\n"
    "    // with no Browse URL.\n"
    "    const __isScratchWorkdir = (p) => typeof p === \"string\" && /\\/(?:\\.milady|\\.eliza|\\.elizaai)\\/workspaces\\//.test(p);\n"
    '    if (!workdir && coordinator) {\n'
    '      const roomId = messageField(message, "roomId");\n'
    "      const scoped = roomId ? await coordinator.listTaskThreads({\n"
    "        includeArchived: false,\n"
    "        roomId,\n"
    "        statuses: [...ACTIVE_THREAD_STATUSES2],\n"
    "        limit: 10\n"
    "      }) : [];\n"
    "      const recent = scoped.length > 0 ? scoped : await coordinator.listTaskThreads({\n"
    "        includeArchived: false,\n"
    "        statuses: [...ACTIVE_THREAD_STATUSES2],\n"
    "        limit: 10\n"
    "      });\n"
    "      const __cand = recent.find((thread) => thread.latestWorkdir && __isScratchWorkdir(thread.latestWorkdir))?.latestWorkdir;\n"
    '      workdir = __cand ?? "";\n'
    "    }\n"
    "    if (!workdir) {\n"
    '      const wsService = runtime.getService("CODING_WORKSPACE_SERVICE");\n'
    "      if (wsService) {\n"
    "        const workspaces = wsService.listWorkspaces();\n"
    "        const __scratchEntry = [...workspaces].reverse().find((ws) => __isScratchWorkdir(ws.path));\n"
    "        if (__scratchEntry) {\n"
    "          workdir = __scratchEntry.path;\n"
    "        }\n"
    "      }\n"
    "    }",
    "B: workdir fallback only reuses scratch paths",
)

open(P, "w").write(src)
print("\n✓ Both patches written.")
