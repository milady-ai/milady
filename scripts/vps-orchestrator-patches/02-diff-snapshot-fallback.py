#!/usr/bin/env python3
"""Patch: make collectDiffSnapshot also detect work in non-git workdirs.

The orchestrator's auto-review feature (which generates concerns,
suggestions, and especially the "next steps you can keep going with"
followUps shown after a task completes) is gated on having a non-empty
diff snapshot:

    if (!snapshot.stat && !snapshot.names) return null;

`collectDiffSnapshot` calls `git diff --stat HEAD` and `git diff
--name-only HEAD`. Both return empty when:
  * workdir isn't a git repo
  * workdir IS a git repo but all changes are untracked (fresh files
    created by the subagent — common case for scratch workspaces)

Either way → no review → no followups → no "open the same directory
and continue" suggestion ever appears to the user.

Fix: if git returns empty, fall back to listing files modified within
the last 30 minutes (typical task-agent runtime). Pass them as `names`
and synthesize a `stat`-like listing with file sizes. The review LLM
gets enough context to propose meaningful followups even without a
real diff.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-agent-orchestrator/dist/index.js"
src = open(P).read()

needle = (
    '  stat = (await run(["diff", "--stat", "HEAD"])).slice(0, 2000);\n'
    '  names = (await run(["diff", "--name-only", "HEAD"])).split(`\n'
    '`).filter(Boolean).slice(0, MAX_NAMES).join(`\n'
    '`);\n'
    '  const remotes = await run(["remote"]);\n'
    '  hasRemote = remotes.trim().length > 0;\n'
    "  return { stat, names, hasRemote };\n"
    "}"
)

replace = (
    '  stat = (await run(["diff", "--stat", "HEAD"])).slice(0, 2000);\n'
    '  names = (await run(["diff", "--name-only", "HEAD"])).split(`\n'
    '`).filter(Boolean).slice(0, MAX_NAMES).join(`\n'
    '`);\n'
    '  const remotes = await run(["remote"]);\n'
    "  hasRemote = remotes.trim().length > 0;\n"
    "  // ─ Milady patch: fall back to mtime scan when git diff is empty ─\n"
    "  // The auto-review feature is gated on !stat && !names; without this\n"
    "  // fallback it never fires for scratch workdirs or fresh-file tasks.\n"
    "  if (!stat && !names) {\n"
    "    try {\n"
    "      const { readdir, stat: fsStat } = await import('node:fs/promises');\n"
    "      const path_ = await import('node:path');\n"
    "      const cutoffMs = Date.now() - 30 * 60 * 1000;\n"
    "      const recent = [];\n"
    "      const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.turbo']);\n"
    "      const walk = async (dir, depth) => {\n"
    "        if (depth > 4 || recent.length >= 200) return;\n"
    "        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);\n"
    "        for (const e of entries) {\n"
    "          if (e.name.startsWith('.') && e.name !== '.env') continue;\n"
    "          if (SKIP.has(e.name)) continue;\n"
    "          const full = path_.join(dir, e.name);\n"
    "          if (e.isDirectory()) { await walk(full, depth + 1); continue; }\n"
    "          if (!e.isFile()) continue;\n"
    "          const s = await fsStat(full).catch(() => null);\n"
    "          if (s && s.mtimeMs >= cutoffMs) {\n"
    "            recent.push({ rel: path_.relative(workdir, full), size: s.size });\n"
    "          }\n"
    "        }\n"
    "      };\n"
    "      await walk(workdir, 0);\n"
    "      if (recent.length > 0) {\n"
    "        recent.sort((a, b) => a.rel.localeCompare(b.rel));\n"
    "        const sliced = recent.slice(0, MAX_NAMES);\n"
    "        names = sliced.map(f => f.rel).join('\\n');\n"
    "        stat = sliced.slice(0, 50).map(f => `  ${f.rel.padEnd(60)} | ${f.size} bytes`).join('\\n') +\n"
    "          (recent.length > 50 ? `\\n  …and ${recent.length - 50} more recently-modified files` : '');\n"
    "      }\n"
    "    } catch {}\n"
    "  }\n"
    "  return { stat, names, hasRemote };\n"
    "}"
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match for collectDiffSnapshot return, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ patch applied: collectDiffSnapshot now falls back to mtime scan")
