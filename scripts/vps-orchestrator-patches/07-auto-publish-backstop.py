#!/usr/bin/env python3
"""Patch: auto-publish backstop in the orchestrator task_complete handler.

The Discord execution contract tells claude to run publish-botdick-project.mjs
as the LAST step before declaring task_complete. In practice claude
often skips this — builds the site files in a project subdir under the
workdir, declares task_complete, then exits. Result: deliverable exists
on disk but is NOT served at projects.botdick.com, and patch 06 finds
no botdick-project.json to extract a URL from.

Fix: in the same task_complete callback patched by 06, BEFORE the
existing URL scan, sync-scan the workdir for newly-modified directories
containing index.html that aren't already in published-projects/. For
each, exec publish-botdick-project.mjs synchronously. Then the existing
URL scan (patch 06) finds the just-created botdick-project.json and
appends the URL to the discord message.

Uses execFileSync — blocks the event handler for ~1-2s per project, but
the publish script is fast (it just copies files + writes metadata).
Timeout 15s as a safety guard.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()

# Hook in BEFORE the patch-06 URL scan block.
needle = (
    "          // ─ Milady patch: scan for recently-published projects and append URL ─\n"
    "          // The orchestrator's non-coordinator completion path only posts"
)

replace = (
    "          // ─ Milady patch: auto-publish backstop ─\n"
    "          // If the subagent created a project dir with index.html under the\n"
    "          // workdir but didn't run publish-botdick-project.mjs, the orchestrator\n"
    "          // does it instead. Slug = dirname. Title = dirname with hyphens → spaces.\n"
    "          try {\n"
    "            const __apFs = require('node:fs');\n"
    "            const __apCp = require('node:child_process');\n"
    "            const __apRoot = workdir || '/opt/botdick/milady-fisbat-integration';\n"
    "            const __apPubRoot = '/opt/botdick/milady-fisbat/published-projects';\n"
    "            const __apCutoff = Date.now() - 15 * 60 * 1000;\n"
    "            const __apEntries = __apFs.readdirSync(__apRoot, { withFileTypes: true });\n"
    "            for (const __apE of __apEntries) {\n"
    "              if (!__apE.isDirectory()) continue;\n"
    "              if (__apE.name.startsWith('.') || __apE.name === 'node_modules' || __apE.name === 'eliza' || __apE.name === 'packages' || __apE.name === 'plugins' || __apE.name === 'published-projects') continue;\n"
    "              const __apProjDir = __apRoot + '/' + __apE.name;\n"
    "              const __apIdx = __apProjDir + '/index.html';\n"
    "              let __apStat;\n"
    "              try { __apStat = __apFs.statSync(__apIdx); } catch { continue; }\n"
    "              if (__apStat.mtimeMs < __apCutoff) continue;\n"
    "              const __apSlug = __apE.name;\n"
    "              if (__apFs.existsSync(__apPubRoot + '/' + __apSlug + '/botdick-project.json')) continue;\n"
    "              try {\n"
    "                __apCp.execFileSync('node', [\n"
    "                  '/opt/botdick/milady-fisbat/scripts/publish-botdick-project.mjs',\n"
    "                  '--input-dir', __apProjDir,\n"
    "                  '--title', __apSlug.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase()),\n"
    "                  '--slug', __apSlug\n"
    "                ], { timeout: 15000, stdio: 'pipe', uid: undefined });\n"
    "              } catch (__apErr) {\n"
    "                // publish failed — log to ctx.log if available, but continue\n"
    "                try { (ctx && ctx.log) ? ctx.log(`[auto-publish] failed for ${__apSlug}: ${__apErr && __apErr.message || __apErr}`) : null; } catch {}\n"
    "              }\n"
    "            }\n"
    "          } catch {}\n"
    "          // ─ Milady patch: scan for recently-published projects and append URL ─\n"
    "          // The orchestrator's non-coordinator completion path only posts"
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Auto-publish backstop added (runs publish-botdick-project.mjs for unpublished project dirs).")
