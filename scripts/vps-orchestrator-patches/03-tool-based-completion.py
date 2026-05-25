#!/usr/bin/env python3
"""Patch: treat empty-response task_complete as REAL completion when tools ran.

When claude uses Write/Edit/Bash but doesn't print to chat (common case
for "create cheese.html and exit"-style tasks), the adapter's fast-path
fires task_complete with an empty response. The orchestrator currently
treats this as "blocked: returned to idle without substantive response"
and re-routes to the coordinator's decision loop — which then either
escalates to the user or eventually marks complete much later. Either
way, the auto-review/followup path is bypassed.

Fix: if __orchestratorSessionToolRanAt (the Map populated by our P6
patch — tool_running events from HTTP hooks) has a recent entry for
this session, the task IS done — emit task_complete instead of blocked.

The HOOK firing task_complete is claude's explicit "I'm done" signal.
If tools ran AND the hook fired, the work happened — just without
visible chat text. The current "empty = blocked" logic was a defensive
guess from an earlier era; in the modern Claude Code TUI with hooks,
we have real signal instead of guessing.

Affects both nodeManager (line ~1984) and bunManager (line ~1874).
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()


def apply(needle, replace, label):
    n = src.count(needle)
    print(f"  {label}: {n} match")
    if n != 1:
        raise SystemExit(f"FAIL: expected 1 match for {label}, got {n}")
    return src.replace(needle, replace)


# nodeManager.on("task_complete") empty-response handler
node_needle = (
    '  nodeManager.on("task_complete", (session) => {\n'
    "    const response = captureTaskResponse(session.id, ctx.sessionOutputBuffers, ctx.taskResponseMarkers);\n"
    "    if (!response.trim()) {\n"
    "      ctx.log(`Ignoring empty adapter fast-path completion for ${session.id}; keeping session available for continuation`);\n"
    '      ctx.emitEvent(session.id, "blocked", {\n'
    "        session,\n"
    "        promptInfo: {\n"
    '          type: "empty_completion",\n'
    '          prompt: "Adapter returned to idle without a substantive response. Continue the original task or report the exact blocker."\n'
    "        },\n"
    "        autoResponded: false,\n"
    '        source: "adapter_fast_path_empty"\n'
    "      });\n"
    "      return;\n"
    "    }"
)
node_replace = (
    '  nodeManager.on("task_complete", (session) => {\n'
    "    const response = captureTaskResponse(session.id, ctx.sessionOutputBuffers, ctx.taskResponseMarkers);\n"
    "    if (!response.trim()) {\n"
    "      // ─ Milady patch: if tools ran, the task IS complete even with no chat text ─\n"
    "      const toolRanAt = __orchestratorSessionToolRanAt.get(session.id);\n"
    "      if (toolRanAt) {\n"
    "        ctx.log(`Empty fast-path completion for ${session.id} but tools ran — treating as task_complete (tool-based work)`);\n"
    '        ctx.emitEvent(session.id, "task_complete", {\n'
    "          session,\n"
    '          response: "(tools used, no visible chat output)",\n'
    '          source: "adapter_fast_path_tool_based"\n'
    "        });\n"
    "        return;\n"
    "      }\n"
    "      ctx.log(`Ignoring empty adapter fast-path completion for ${session.id}; keeping session available for continuation`);\n"
    '      ctx.emitEvent(session.id, "blocked", {\n'
    "        session,\n"
    "        promptInfo: {\n"
    '          type: "empty_completion",\n'
    '          prompt: "Adapter returned to idle without a substantive response. Continue the original task or report the exact blocker."\n'
    "        },\n"
    "        autoResponded: false,\n"
    '        source: "adapter_fast_path_empty"\n'
    "      });\n"
    "      return;\n"
    "    }"
)
src = apply(node_needle, node_replace, "nodeManager empty-completion")

# bunManager.on("task_complete") empty-response handler — same shape, more indentation
bun_needle = (
    '    bunManager.on("task_complete", (session) => {\n'
    "      const response = captureTaskResponse(session.id, ctx.sessionOutputBuffers, ctx.taskResponseMarkers);\n"
    "      if (!response.trim()) {\n"
    "        ctx.log(`Ignoring empty adapter fast-path completion for ${session.id}; keeping session available for continuation`);\n"
    '        ctx.emitEvent(session.id, "blocked", {\n'
    "          session,\n"
    "          promptInfo: {\n"
    '            type: "empty_completion",\n'
    '            prompt: "Adapter returned to idle without a substantive response. Continue the original task or report the exact blocker."\n'
    "          },\n"
    "          autoResponded: false,\n"
    '          source: "adapter_fast_path_empty"\n'
    "        });\n"
    "        return;\n"
    "      }"
)
bun_replace = (
    '    bunManager.on("task_complete", (session) => {\n'
    "      const response = captureTaskResponse(session.id, ctx.sessionOutputBuffers, ctx.taskResponseMarkers);\n"
    "      if (!response.trim()) {\n"
    "        // ─ Milady patch: if tools ran, the task IS complete even with no chat text ─\n"
    "        const toolRanAt = __orchestratorSessionToolRanAt.get(session.id);\n"
    "        if (toolRanAt) {\n"
    "          ctx.log(`Empty fast-path completion for ${session.id} but tools ran — treating as task_complete (tool-based work)`);\n"
    '          ctx.emitEvent(session.id, "task_complete", {\n'
    "            session,\n"
    '            response: "(tools used, no visible chat output)",\n'
    '            source: "adapter_fast_path_tool_based"\n'
    "          });\n"
    "          return;\n"
    "        }\n"
    "        ctx.log(`Ignoring empty adapter fast-path completion for ${session.id}; keeping session available for continuation`);\n"
    '        ctx.emitEvent(session.id, "blocked", {\n'
    "          session,\n"
    "          promptInfo: {\n"
    '            type: "empty_completion",\n'
    '            prompt: "Adapter returned to idle without a substantive response. Continue the original task or report the exact blocker."\n'
    "          },\n"
    "          autoResponded: false,\n"
    '          source: "adapter_fast_path_empty"\n'
    "        });\n"
    "        return;\n"
    "      }"
)
src = apply(bun_needle, bun_replace, "bunManager empty-completion")

open(P, "w").write(src)
print("\n✓ Both manager paths now treat tool-based completions as real task_complete events.")
