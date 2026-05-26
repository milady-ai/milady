#!/usr/bin/env python3
"""Patch: Discord shortcut path uses scratch workspaces, not bot's cwd.

shouldUseLocalWorkdirForTaskShortcut currently matches generic words
like "site", "page", "build", "project" — so ANY website request goes
into `workdir: process.cwd()` (= /opt/botdick/milady-fisbat-integration).

That breaks the "Browse files" caddy link because buildWorkspaceBrowseUrl
only emits a URL when workdir matches /.(milady|eliza|elizaai)/workspaces/.
The bot's repo path doesn't match, so:
  - Discord spawn message lacks the `• Browse files: ...` line
  - Users can't inspect work in progress via the caddy mount
  - Files pile up in the bot's repo instead of isolated scratch dirs

Caddy is mounted at projects.botdick.com/workspaces/* → ~/.eliza/workspaces/
so scratch dirs are AUTOMATICALLY browseable via the web. We should
default to that.

Fix: tighten shouldUseLocalWorkdirForTaskShortcut to only return true
when the user EXPLICITLY invokes the bot's own repo ("in this repo",
"the codebase", "current folder", "local cwd"). Otherwise return false
so CREATE_TASK falls through to a fresh scratch workspace.

Net result:
  - "@botdick make a site about cheese"
      → scratch dir ~/.eliza/workspaces/<uuid>/
      → Browse URL https://projects.botdick.com/workspaces/<uuid>/
      → published URL still posted on completion (patches 06/07)
  - "@botdick fix the typecheck error in this repo"
      → still uses /opt/botdick/milady-fisbat-integration (the bot's cwd)
"""
P = "/opt/botdick/milady-fisbat-integration/eliza/plugins/plugin-discord/dist/index.js"
src = open(P).read()

needle = (
    "  shouldUseLocalWorkdirForTaskShortcut(text) {\n"
    "    const cleaned = this.extractActionableTaskShortcutText(this.stripAddressingSyntax(this.extractDirectUserText(text)));\n"
    "    return /\\b(site|page|homepage|project|folder|subfolder|scaffold|build|deploy|host|wrangler|cloudflare|codebase|dashboard|dash|game|local|new\\s+folder)\\b/i.test(cleaned);\n"
    "  }"
)

replace = (
    "  shouldUseLocalWorkdirForTaskShortcut(text) {\n"
    "    const cleaned = this.extractActionableTaskShortcutText(this.stripAddressingSyntax(this.extractDirectUserText(text)));\n"
    "    // ─ Milady patch: only use bot's cwd for EXPLICIT local-repo requests ─\n"
    "    // The previous regex matched generic 'site|page|build|project|game' words,\n"
    "    // forcing every Discord-triggered task into /opt/botdick/milady-fisbat-integration.\n"
    "    // That broke the caddy 'Browse files' URL (which only resolves for paths\n"
    "    // under ~/.eliza/workspaces/<uuid>/). Now only match phrases that clearly\n"
    "    // mean 'work inside the bot's source repo'.\n"
    "    return /\\b(this\\s+repo|this\\s+codebase|current\\s+folder|local\\s+cwd|in\\s+place|in\\s+this\\s+(?:project|directory|workspace))\\b/i.test(cleaned);\n"
    "  }"
)

n = src.count(needle)
print(f"matches: {n}")
if n != 1:
    raise SystemExit(f"FAIL: expected 1 match, got {n}")
open(P, "w").write(src.replace(needle, replace))
print("✓ Discord shortcut now uses scratch dir by default; bot cwd only on explicit request.")
