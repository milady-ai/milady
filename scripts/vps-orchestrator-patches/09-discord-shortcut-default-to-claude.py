#!/usr/bin/env python3
"""Patch: the Discord shortcut path defaults to claude instead of codex.

resolveTaskShortcutAgentType in @elizaos/plugin-discord/dist/index.js
checks the user's text for explicit framework keywords (\\bclaude\\b,
\\bgemini\\b, etc.) and falls back to "codex" if nothing matches. This
bypasses PARALLAX_DEFAULT_AGENT_TYPE entirely.

Codex CLI authentication on this VPS has been dead all session (the
OpenAI refresh token returns 401 every refresh). So when the shortcut
path falls through to "codex", every task spawn immediately blocks on
the Codex trust + update prompts and never makes progress.

Real-world failure: user asked "@botdick use a claude subagent to make
a site about [whatever]". The shortcut path's regex somehow didn't
match "claude" (the regex SHOULD match — possibly the text gets stripped
upstream) and fell back to "codex". Bot spawned codex. Codex stuck on
"Skip Codex CLI update prompt" + "Retry Codex workspace trust approval".
Session timed out without producing anything.

Fix: change the default fallback from "codex" to "claude". Claude
auth is working (CLAUDE_CODE_OAUTH_TOKEN), claude is what
PARALLAX_DEFAULT_AGENT_TYPE is set to anyway, and codex shouldn't
be the default for a Milady deployment with a working Claude sub.

When OpenAI subscription gets re-authed someday, this can be reverted
or made env-driven.
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-discord/dist/index.js"
src = open(P).read()

needle = (
    '  resolveTaskShortcutAgentType(text) {\n'
    '    if (/\\bclaude\\b/i.test(text))\n'
    '      return "claude";\n'
    '    if (/\\bgemini\\b/i.test(text))\n'
    '      return "gemini";\n'
    '    if (/\\baider\\b/i.test(text))\n'
    '      return "aider";\n'
    '    if (/\\bpi\\b/i.test(text))\n'
    '      return "pi";\n'
    '    if (/\\bshell\\b/i.test(text))\n'
    '      return "shell";\n'
    '    return "codex";\n'
    '  }'
)

replace = (
    '  resolveTaskShortcutAgentType(text) {\n'
    '    if (/\\bclaude\\b/i.test(text))\n'
    '      return "claude";\n'
    '    if (/\\bgemini\\b/i.test(text))\n'
    '      return "gemini";\n'
    '    if (/\\baider\\b/i.test(text))\n'
    '      return "aider";\n'
    '    if (/\\bpi\\b/i.test(text))\n'
    '      return "pi";\n'
    '    if (/\\bshell\\b/i.test(text))\n'
    '      return "shell";\n'
    '    if (/\\bcodex\\b/i.test(text))\n'
    '      return "codex";\n'
    '    // ─ Milady patch: default to claude, NOT codex ─\n'
    '    // Codex auth on this deployment is dead (OpenAI refresh token 401s).\n'
    '    // Defaulting to it makes every keyword-less Discord shortcut hang.\n'
    '    // Claude is what PARALLAX_DEFAULT_AGENT_TYPE is set to and has working auth.\n'
    '    return "claude";\n'
    '  }'
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Discord shortcut now defaults to claude (not codex) when no framework keyword matches.")
