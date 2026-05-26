#!/usr/bin/env python3
"""Patch: Discord execution contract uses the ACTUAL workdir, not process.cwd().

The Discord task contract template is built with a hardcoded
`${workspaceRoot}` = process.cwd() = /opt/botdick/milady-fisbat-integration:

    `- If a local project/folder is needed and no path was supplied,
       create it under ${workspaceRoot}.`

After patches 10 and 11, scratch dirs under ~/.eliza/workspaces/<uuid>/
are properly created — so the workdir Claude sees is a scratch dir.
But the contract STILL says "create it under /opt/botdick/milady-fisbat-integration".
Claude reads that and tries to write outside its allowed workspace
(via mkdir + write), gets blocked by --dangerously-skip-permissions
boundary, returns empty-handed. Discord shows
"completed the task" with no deliverable.

Real failure (verified 2026-05-26):
  user: "build a dog website using a claude subagent"
  workdir: ~/.eliza/workspaces/2140c1a7-bc18-4a88-8b49-83e1df09035d/
  contract said: "create under /opt/botdick/milady-fisbat-integration"
  workspace post-completion: just .claude/ and .gitignore — no html, no css

Fix: change the contract to "create files in your current working
directory". Claude already KNOWS its cwd (via the PTY environment),
so an unqualified instruction works for both scratch and local-repo
workdirs without leaking the wrong path.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-discord/dist/index.js"
src = open(P).read()

needle = "`- If a local project/folder is needed and no path was supplied, create it under ${workspaceRoot}.`,"
replace = '"- If a local project/folder is needed and no path was supplied, create it as a subdirectory of your current working directory. Use `pwd` if you are unsure where you are.",'

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Discord contract now says 'current working directory' instead of hardcoded path.")
