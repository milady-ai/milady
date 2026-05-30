# Desktop build variants — which Milady should I install?

Milady ships in **two flavors per desktop OS**. They run the same agent
underneath, but differ in how much of your computer they can touch.

## TL;DR

- **Want maximum flexibility?** → install the **Direct download** (DMG, NSIS,
  AppImage, Homebrew, AUR). Power-user mode. Full host access. All local AI
  tooling works.
- **Want the safer, store-trusted version?** → install the **Store download**
  (Mac App Store, Microsoft Store, Flathub). Auto-updates from the store,
  sandboxed at the OS level, can't read files outside the workspace folder
  you pick.

If you don't have a strong reason to pick one, start with the Store download
and switch later if you need the extra power. You can move your settings
between them at any time via **Settings → Import**.

## Comparison

| Feature                                                    | Direct download                              | Store download                                        |
|------------------------------------------------------------|----------------------------------------------|-------------------------------------------------------|
| File system access                                         | Full home directory                          | Only the workspace folder you grant                   |
| Local AI tools (Ollama, llama.cpp, etc.)                   | ✅ runs directly on your machine             | ✅ via `localhost` to a separately-installed Ollama   |
| Coding agents (Claude Code, Codex, opencode)               | ✅ full local CLI integration                | Cloud-hosted via Eliza Cloud                          |
| Cloud hosting (agent runs on Eliza Cloud)                  | ✅                                           | ✅                                                    |
| Auto-updates                                               | App's own updater (Homebrew/AUR)             | Handled by the store                                  |
| Distribution                                               | milady.so, Homebrew, AUR, deb/rpm, AppImage  | Mac App Store, Microsoft Store, Flathub               |
| Cost                                                       | Free                                         | Free (the app itself; LLM/cloud costs apply either way) |

## Why is "Local" mode disabled in my install?

You're running the **Store download**. Store builds are sandboxed by the
operating system — that's part of the trust contract with Apple, Microsoft, or
Flathub. Inside that sandbox, the agent can't fork arbitrary host binaries
(which is how `claude`, `codex`, and `opencode` work today), so we disable
"Local" mode rather than pretend it works.

You have two ways forward:

1. **Use Cloud mode** — the agent runs on Eliza Cloud and you keep using the
   Store build. This is the path most people pick.
2. **Switch to the Direct download** — full local power, but you give up the
   store's auto-update path and OS-level sandbox.

## How do I switch builds?

1. Install the other build (Direct from milady.so, or Store from your OS's
   store).
2. Open it and you'll be greeted by onboarding.
3. Pick **"Import settings from existing Milady installation"** and point it
   at your existing `~/.local/state/milady` (or whichever folder your other build uses).

The import is non-destructive — it copies your settings, agents, and skills
into the new install without overwriting anything you've already created
there.

## Trust + safety, briefly

Store builds run inside the OS's native app sandbox:

- **macOS App Sandbox** — no access to `~/.ssh`, browser cookies, Keychain,
  other apps' data, or anywhere outside the workspace folder you explicitly
  pick.
- **Windows AppContainer** — same shape: only the app's local folder + the
  workspace folder you pick.
- **Flatpak bubblewrap** — only the workspace folder you grant via the file
  picker. No `--filesystem=home`, no `--filesystem=host`.

Direct builds skip all of that. You get full host access — that's the point.
Use Direct when you trust the agent to work in your real home directory; use
Store when you want a clear blast radius.

## Mobile is different

The iOS App Store and Google Play apps are **always** thin clients that talk
to Eliza Cloud — Apple and Google policy disallow shipping a runtime that
executes downloaded code, so there's no "Local" or "Sandbox" choice on
phones. The agent always runs in the cloud.

The privileged AOSP build (sideloaded onto Milady-OS hardware) is the one
mobile-class build with full local capability — terminal, shell, the whole
agent. That's a separate distribution channel.

## More

- **Engineering details** — see [docs/sandbox-mode.md](../sandbox-mode.md) for
  the architectural design (entitlements, manifests, runtime gating, signing).
- **Install instructions** — see the project [README](../../README.md).
- **Eliza Cloud signup** — [elizacloud.ai](https://www.elizacloud.ai).
