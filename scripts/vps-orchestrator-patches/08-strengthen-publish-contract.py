#!/usr/bin/env python3
"""Patch: strengthen the Discord execution contract about publishing.

The current contract says "Project publishing is mandatory" + "task is
not complete until the Discord completion includes that live URL", but
claude still routinely skips the publish step and declares task_complete
after just creating the static files. (Why? Probably because the contract
appears once near the bottom of a long system prompt and the model
optimizes for finishing quickly.)

Fix: add a single LEAD line at the top of the publish-block that's
short, imperative, and emphasizes the failure cost. The orchestrator
also has an auto-publish backstop (patch 07) but we still want claude
to handle it itself when possible (control of slug, title, etc.).

Edits the @elizaos/plugin-discord/dist/index.js task-prompt builder.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-discord/dist/index.js"
src = open(P).read()

needle = '        "- Project publishing is mandatory for site/app/game/dashboard/page requests:",'

replace = (
    '        "- Project publishing is mandatory for site/app/game/dashboard/page requests:",\n'
    '        "  ⚠ CRITICAL: Running the publish script is the LAST thing you do BEFORE you declare task_complete. If you finish writing files and stop without running it, the user gets a useless \\"completed the task\\" ping with no URL — the orchestrator will auto-publish as a backstop but you lose control over the slug and title. Always publish yourself.",'
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Discord execution contract now leads with a CRITICAL publish reminder.")
