#!/usr/bin/env python3
"""Patch: don't let the reconciler kill a session that has a tool
running recently.

The orchestrator's reconcileBusySessionFromOutput method polls every
1s. When it sees an idle prompt + meaningful response that have been
stable for 30s, it declares task_complete and SIGKILLs the session.

This is wrong for the modern Claude Code TUI: between tool calls,
claude shows a thinking-verb spinner ("Lollygagging…", "Cogitating…")
that doesn't add new lines to the output buffer. The reconciler sees
"output buffer hasn't changed" and treats that as stability, ignoring
the fact that claude IS still working (proven by tool_running hook
events).

Real-world failure example:
  02:58:20 tool_running tool=Bash
  02:58:38 Reconciled busy → task_complete (only 18s later)
  02:58:38 SIGKILL

Fix: before reconciling to task_complete, check if a tool ran for
this session in the last 60 seconds. If yes, claude is still working
between tool calls → reset the completionSignalSince timer and let
claude continue.

This uses __orchestratorSessionToolRanAt from patch 01.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()

# The reconciler waits 30s of stability before marking complete. We add a
# tool-recency check right before the "set completionSignalSince" assignment.
# If a tool ran in the last 60s, treat that as "still working" — clear the
# timer and return.
needle = (
    "      const firstSeenAt = this.completionSignalSince.get(sessionId);\n"
    "      if (firstSeenAt === undefined) {\n"
    "        this.completionSignalSince.set(sessionId, Date.now());\n"
    "        return;\n"
    "      }\n"
    "      if (Date.now() - firstSeenAt < 30000) {\n"
    "        return;\n"
    "      }"
)

replace = (
    "      // ─ Milady patch: don't reconcile to task_complete if a tool ran recently ─\n"
    "      // Between tool calls, claude shows a thinking-spinner that doesn't add\n"
    "      // new lines to the output buffer — the reconciler treats this as stable\n"
    "      // output and kills the session mid-work. Tool activity in the last 60s\n"
    "      // is strong evidence claude is still working — reset the stability timer.\n"
    "      const __lastToolRanAt = __orchestratorSessionToolRanAt.get(sessionId);\n"
    "      if (__lastToolRanAt && Date.now() - __lastToolRanAt < 60000) {\n"
    "        this.completionSignalSince.delete(sessionId);\n"
    "        return;\n"
    "      }\n"
    "      const firstSeenAt = this.completionSignalSince.get(sessionId);\n"
    "      if (firstSeenAt === undefined) {\n"
    "        this.completionSignalSince.set(sessionId, Date.now());\n"
    "        return;\n"
    "      }\n"
    "      if (Date.now() - firstSeenAt < 30000) {\n"
    "        return;\n"
    "      }"
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Reconciler now trusts recent tool activity as 'still working' signal.")
