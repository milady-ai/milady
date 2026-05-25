#!/usr/bin/env python3
"""Patch: include the published URL in the task-complete callback message.

When a task agent (via START_CODING_TASK) finishes, the orchestrator
fires a callback to Discord with the format:

    Agent "X" [session: Y] completed the task.

That's it. No URL. No file list. No followups. Even when the subagent
DID successfully build and publish a site, the bot just says "completed
the task" with nothing actionable. User-visible result: user gets a
useless completion ping and has to dig through logs to find their URL.

This is in the registerSessionEvents path, specifically the
"if (!coordinatorActive)" branch — which is what fires for
Discord-triggered START_CODING_TASK runs. The coordinator-managed
path (line ~8449) has a full finalizeBotdickTaskCompletion → URL →
review pipeline, but THIS path doesn't.

The publish-botdick-project.mjs script writes a botdick-project.json
file in /opt/botdick/milady-fisbat/published-projects/<slug>/ with
the URL. We scan for recently-modified ones.

Sync fs calls only — the enclosing handler is a sync arrow function
passed to ptyService.onSessionEvent(...).
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()

needle = (
      '      if (event === "task_complete") {\n'
      '        if (callback) {\n'
      '          const response = data.response ?? "";\n'
      '          const preview = response.length > 500 ? `${response.slice(0, 500)}...` : response;\n'
      '          callback({\n'
      "            text: preview ? `Agent \"${label}\" [session: ${sessionId}] completed the task.\n"
      "\n"
      '${preview}` : `Agent "${label}" [session: ${sessionId}] completed the task.`\n'
      "          });\n"
      "        }"
)

replace = (
      '      if (event === "task_complete") {\n'
      '        if (callback) {\n'
      '          const response = data.response ?? "";\n'
      '          const preview = response.length > 500 ? `${response.slice(0, 500)}...` : response;\n'
      "          // ─ Milady patch: scan for recently-published projects and append URL ─\n"
      "          // The orchestrator's non-coordinator completion path only posts\n"
      "          // 'Agent X completed the task.' to Discord — with no URL even when\n"
      "          // the subagent did publish a site. Scan the published-projects\n"
      "          // directory for botdick-project.json files written in the last\n"
      "          // 10 minutes and append their URLs to the message.\n"
      "          let __publishedBlock = '';\n"
      "          try {\n"
      "            const __nodeFs = require('node:fs');\n"
      "            const __pubRoot = '/opt/botdick/milady-fisbat/published-projects';\n"
      "            const __cutoff = Date.now() - 10 * 60 * 1000;\n"
      "            const __urls = [];\n"
      "            for (const __slug of __nodeFs.readdirSync(__pubRoot)) {\n"
      "              const __metaPath = __pubRoot + '/' + __slug + '/botdick-project.json';\n"
      "              try {\n"
      "                const __s = __nodeFs.statSync(__metaPath);\n"
      "                if (__s.mtimeMs < __cutoff) continue;\n"
      "                const __meta = JSON.parse(__nodeFs.readFileSync(__metaPath, 'utf8'));\n"
      "                if (__meta && __meta.url) __urls.push(__meta.url);\n"
      "              } catch {}\n"
      "            }\n"
      "            if (__urls.length > 0) {\n"
      "              __publishedBlock = '\\n\\nPublished: ' + __urls.join(', ');\n"
      "            }\n"
      "          } catch {}\n"
      "          callback({\n"
      "            text: (preview ? `Agent \"${label}\" [session: ${sessionId}] completed the task.\n"
      "\n"
      '${preview}` : `Agent "${label}" [session: ${sessionId}] completed the task.`) + __publishedBlock\n'
      "          });\n"
      "        }"
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Completion callback now appends recently-published URLs (sync fs scan).")
