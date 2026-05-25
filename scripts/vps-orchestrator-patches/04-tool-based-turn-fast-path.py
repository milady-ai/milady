#!/usr/bin/env python3
"""Patch: skip the brittle Turn-Complete LLM assessment when we have
hard evidence the task succeeded (tools ran + recent files in workdir).

After patches 01-03, task_complete events fire cleanly when claude
uses tools. But the orchestrator's "Turn-Complete" handler then runs
an LLM call (TEXT_SMALL model) to "assess whether the task is done":

    const result = await ctx.runtime.useModel(ModelType8.TEXT_SMALL, { prompt });
    decision = parseCoordinationResponse(result);
    if (!decision) {
      ctx.log(`Turn-complete for "${label}": all decision paths failed — escalating`);
      decision = { action: "escalate", ... };
    }

`parseCoordinationResponse` requires a JSON block with action in
`["respond","escalate","ignore","complete"]`. In practice the LLM
frequently returns malformed output OR runs into provider issues
(ELIZAOS_CLOUD timeouts, embedding failures cascading into bad context).
When that happens, the orchestrator escalates "for human review"
instead of completing → `runTaskReview` never runs → no auto-review,
no followups, no resume hint, no "next steps you can keep going with".

Two fast-paths already exist in this handler (verifyStaticDeployEvidence,
getWorkspaceCompletionEvidence) but require very specific evidence
(deployed URL, or a "variation lane" with index.html + VARIANT_REPORT.md).
Neither covers the common case: "I asked claude to create a single file
and it did exactly that."

Fix: add a THIRD fast-path before the LLM call. If
__orchestratorSessionToolRanAt has an entry for this session AND any
file in taskCtx.workdir has been modified since the task registered,
auto-complete with the reasoning "tools ran + recent files".

This bypasses the brittle LLM gate for the most common simple cases
and makes the downstream review/followup path actually fire.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()

# Insert the new fast-path right BEFORE the buildTurnCompletePrompt LLM call,
# but AFTER the existing workspaceEvidence check.
needle = (
    "    const workspaceEvidence = getWorkspaceCompletionEvidence(taskCtx);\n"
    "    if (workspaceEvidence) {\n"
    "      await executeDecision(ctx, sessionId, {\n"
    '        action: "complete",\n'
    "        reasoning: workspaceEvidence\n"
    "      });\n"
    "      return;\n"
    "    }\n"
    "    const prompt = buildTurnCompletePrompt("
)

replace = (
    "    const workspaceEvidence = getWorkspaceCompletionEvidence(taskCtx);\n"
    "    if (workspaceEvidence) {\n"
    "      await executeDecision(ctx, sessionId, {\n"
    '        action: "complete",\n'
    "        reasoning: workspaceEvidence\n"
    "      });\n"
    "      return;\n"
    "    }\n"
    "    // ─ Milady patch: tool-based fast-path completion ─\n"
    "    // If tools ran AND workdir has files modified since the task started,\n"
    "    // auto-complete instead of asking the brittle Turn-Complete LLM\n"
    "    // (which frequently returns invalid responses and escalates, which\n"
    "    // bypasses runTaskReview → no followups ever reach the user).\n"
    "    const __toolRanAt = __orchestratorSessionToolRanAt.get(sessionId);\n"
    "    if (__toolRanAt && taskCtx.workdir) {\n"
    "      try {\n"
    "        const { readdir: __readdir, stat: __fsStat } = await import('node:fs/promises');\n"
    "        const __path = await import('node:path');\n"
    "        const __startedAt = taskCtx.registeredAt || taskCtx.startedAt || (Date.now() - 30 * 60 * 1000);\n"
    "        const __SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache']);\n"
    "        let __hasRecentFile = false;\n"
    "        let __recentFileName = '';\n"
    "        const __walk = async (dir, depth) => {\n"
    "          if (depth > 3 || __hasRecentFile) return;\n"
    "          const entries = await __readdir(dir, { withFileTypes: true }).catch(() => []);\n"
    "          for (const e of entries) {\n"
    "            if (__hasRecentFile) return;\n"
    "            if (e.name.startsWith('.') && e.name !== '.env') continue;\n"
    "            if (__SKIP.has(e.name)) continue;\n"
    "            const full = __path.join(dir, e.name);\n"
    "            if (e.isDirectory()) { await __walk(full, depth + 1); continue; }\n"
    "            if (!e.isFile()) continue;\n"
    "            const s = await __fsStat(full).catch(() => null);\n"
    "            if (s && s.mtimeMs >= __startedAt) {\n"
    "              __hasRecentFile = true;\n"
    "              __recentFileName = __path.relative(taskCtx.workdir, full);\n"
    "              return;\n"
    "            }\n"
    "          }\n"
    "        };\n"
    "        await __walk(taskCtx.workdir, 0);\n"
    "        if (__hasRecentFile) {\n"
    "          ctx.log(`Tool-based fast-path completion for \"${taskCtx.label}\": tools ran and workdir has recent file ${__recentFileName}`);\n"
    "          await executeDecision(ctx, sessionId, {\n"
    '            action: "complete",\n'
    "            reasoning: `Tools ran during this session and the workspace has a recently-modified file (${__recentFileName}) — treating as complete without LLM assessment.`\n"
    "          });\n"
    "          return;\n"
    "        }\n"
    "      } catch (__err) {\n"
    "        ctx.log(`Tool-based fast-path scan failed for \"${taskCtx.label}\": ${__err}`);\n"
    "      }\n"
    "    }\n"
    "    const prompt = buildTurnCompletePrompt("
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")

open(P, "w").write(src.replace(needle, replace))
print("✓ Tool-based fast-path completion added before LLM call.")
print("Auto-complete now fires when tools ran + workdir has recent files.")
