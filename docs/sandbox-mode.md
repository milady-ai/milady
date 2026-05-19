# Sandbox Mode

Canonical reference for how Milady is distributed, sandboxed, and routed to a runtime
across desktop and mobile. Covers the build-variant axis, the hosting-target axis, the
per-platform availability matrix, and the runtime gating that ties them together.

> **User-facing summary**: see [desktop/build-variants.md](./desktop/build-variants.md)
> for the short "which download should I install?" guide. This document is
> for engineers maintaining the system.

## 1. Why this exists

Two pressures forced the split:

1. **Store distribution** — Mac App Store, Microsoft Store, and Flathub each impose
   an OS-native app sandbox (App Sandbox / AppContainer / bubblewrap-via-Flatpak)
   plus a review process that bans arbitrary host execution. We want Milady on
   those storefronts without losing the unsandboxed direct-download build that
   power users depend on.
2. **Ergonomic agent safety** — an LLM-driven agent that can `rm -rf` the user's
   home directory is a footgun, regardless of whether the user trusts the binary.
   The OS-native sandbox bounds the agent's filesystem reach to a scope the user
   explicitly granted. This is *ergonomic* safety, not adversarial isolation; we
   are not defending against a malicious Milady binary.

Cloud is the default hosting target because it is the easiest path: zero
filesystem questions, no per-OS sandbox surface to reason about, and identical
behavior on every device.

## 2. The three concepts

These are orthogonal. Don't conflate them.

- **On device** — the agent runtime runs locally as an unsandboxed Bun process
  with full host access: arbitrary filesystem reads/writes, host CLIs (`bun`,
  `node`, `git`, `claude`, `codex`, `opencode`, `ollama`), and direct network to
  any provider (Ollama, OpenRouter, Anthropic, OpenAI, etc.).
- **Sandbox** — the agent runtime runs locally inside the OS-native app sandbox.
  Filesystem access is limited to the app container plus user-granted scopes
  (security-scoped bookmarks on macOS, broadFileSystemAccess opt-in on Windows,
  XDG portals on Flatpak). Host CLI execution is blocked. Local LLM stacks are
  not bundleable, so sandbox builds force their *hosting target* to Cloud.
- **Cloud** — the agent runs in Eliza Cloud. The local app is a thin client
  talking to the Cloud BFF over HTTPS. Independent of which build variant is
  installed; always available.

The first two are **build variants** — chosen at signing time and baked into the
artifact. Cloud is a **hosting target** — chosen at runtime in the mode picker.
The mode picker greys options that the installed variant cannot satisfy.

## 3. Per-platform matrix

| Platform                                | On device | Sandbox      | Cloud |
|-----------------------------------------|:---------:|:------------:|:-----:|
| macOS direct (DMG, Homebrew)            |     ✅    | n/a (install MAS build) | ✅ |
| macOS App Store                         |     n/a (install direct) | ✅ | ✅ |
| Windows direct (EXE, winget)            |     ✅    | n/a (install Store build) | ✅ |
| Windows Microsoft Store (MSIX)          |     n/a (install direct) | ✅ | ✅ |
| Linux direct (AppImage, deb/rpm, AUR)   |     ✅    | n/a (install Flathub) | ✅ |
| Linux Flathub                           |     n/a (install direct) | ✅ | ✅ |
| Android sideload (privileged AOSP)      |     ✅ (AOSP *is* the on-device build) | hidden | ✅ |
| Google Play Android                     |     ❌    | ❌           | ✅ (only) |
| iOS App Store                           |     ❌    | ❌           | ✅ (only) |

`n/a` means the picker greys the option with a "Install the *direct* build" or
"Install the *store* build" hint. iOS and Play Android are Cloud-only because
JIT and arbitrary local code execution are forbidden by store policy.

## 4. Architecture

```text
DIRECT BUILD (DMG / EXE / AppImage / AUR / Homebrew)
┌──────────────────────────┐
│  Electrobun shell        │
│  └─ Bun (unsandboxed)    │──► host fs (any path)
│     └─ Eliza runtime     │──► host CLIs (claude/codex/opencode/git/ollama)
│        └─ plugins        │──► local providers (Ollama / OpenRouter / etc.)
└──────────────────────────┘──► Eliza Cloud (optional, when "Cloud" picked)

STORE BUILD (MAS / MS Store / Flathub)
┌──────────────────────────┐
│  OS app sandbox          │
│  └─ Bun (sandboxed)      │──► app container + user-granted scopes only
│     └─ Eliza runtime     │      (no host CLIs, no Ollama dial-out)
│        └─ plugins (gated)│
└──────────────────────────┘──► Eliza Cloud (forced — only hosting target)

MOBILE THIN CLIENT (iOS App Store / Play Android)
┌──────────────────────────┐
│  Capacitor WebView       │──► Eliza Cloud BFF (HTTPS only)
└──────────────────────────┘

AOSP PRIVILEGED BUILD (sideload, platform-signed)
┌──────────────────────────┐
│  ElizaAgentService       │
│  └─ Bun (priv_app SELinux)│─► /data/data/<pkg> + bundled tools
│     └─ Eliza runtime     │──► libllama.so via bun:ffi (BuildConfig.AOSP_BUILD)
│        └─ plugins        │──► system services via @elizaos/app-{wifi,contacts,phone}
└──────────────────────────┘──► Eliza Cloud (optional)
```

Direct, sandbox, and AOSP all run the same `runtime/eliza.ts` boot path. They
differ only in (a) what the OS lets the process do and (b) which plugins the
runtime collector seeds.

## 5. Build pipeline

The single switch is `MILADY_BUILD_VARIANT` (values: `direct` | `store`,
default `direct`). It is read at build time only; runtime code never branches
on it directly — runtime gating uses `sandbox-policy.ts` (§6).

STATUS: in flight — `MILADY_BUILD_VARIANT` is being introduced by the
"Foundation" agent. The build-variant resolver lands at
`eliza/packages/app-core/src/runtime/build-variant.ts` (in flight in worktrees
`agent-aa50e600288c7ca28` and `agent-a1f87ef7040519635`). Until that lands,
existing builds default to `direct` semantics.

Per-OS build artifacts (sandbox-relevant entries only):

- **macOS direct** — Electrobun universal2 DMG. No entitlements file. Code
  signed with Developer ID; notarized.
- **macOS store** — same source, packaged with `mas.entitlements`
  (`com.apple.security.app-sandbox`, JIT entitlement explanation, security-scoped
  bookmarks). Post-package codesign via
  [`scripts/codesign-mas.mjs`](../eliza/packages/app-core/scripts/codesign-mas.mjs)
  walks the bundle bottom-up applying `mas-child.entitlements` (sandbox +
  `cs.inherit`) to nested binaries, then signs the outer `.app` with
  `mas.entitlements`. Requires `MILADY_MAS_SIGNING_IDENTITY` env;
  `MILADY_MAS_INSTALLER_IDENTITY` (optional) triggers `productbuild` of a
  MAS-submittable `.pkg`. Submitted to MAS.
- **Windows direct** — EXE installer. `runFullTrust` capability.
- **Windows store** — MSIX. `AppxManifest.xml` strips `runFullTrust`,
  retains `broadFileSystemAccess` opt-in. STATUS: in flight (Windows MSIX agent).
- **Linux direct** — AppImage / deb / rpm / AUR. No bubblewrap.
- **Linux Flathub** — `org.flatpak.Builder` with tightened `finish-args`
  (no `--filesystem=home`; XDG portals only). STATUS: in flight (Linux Flatpak agent).
- **iOS App Store** — Capacitor build, `PrivacyInfo.xcprivacy`,
  `LlamaCppCapacitor` excluded. STATUS: in flight (iOS store agent).
- **Play Android (`build:android:cloud`)** — Capacitor build, no
  `MANAGE_EXTERNAL_STORAGE`, no privileged perms, `LlamaCppCapacitor` excluded.
  STATUS: new target in flight (Android cloud agent), additive to existing
  `build:android` and `build:android:system` targets in
  `eliza/packages/app-core/scripts/run-mobile-build.mjs`.
- **AOSP `build:android:system`** — privileged platform-signed APK with
  `BuildConfig.AOSP_BUILD=true`, libllama.so vendored under `agent/{abi}/`,
  full system overlay plugins. Untouched by the cloud-target work.

The store-vs-direct artifact split is enforced at packaging only — both consume
the same source tree.

## 6. Runtime gating

`eliza/packages/app-core/src/runtime/sandbox-policy.ts` is the single source of
truth for "is this dangerous capability allowed in this build". STATUS: file is
being introduced by the Coding-agent gating agent.

Expected exports:

- `isSandboxBuild()` — true when `MILADY_BUILD_VARIANT === "store"`.
- `isLocalCodeExecutionAllowed()` — false in store builds; gates `EXECUTE_CODE`,
  `plugin-shell`, `plugin-coding-tools`, and the spawn paths in
  `plugin-agent-orchestrator`.
- `forceCloudHosting()` — true in store builds; the mode picker reads this and
  hides "On device" for the running variant.

The gating is enforced at action registration time (action is not added to the
runtime catalog) rather than at action invocation time, so the planner never
sees a disabled action and cannot try to call it.

`MILADY_PLATFORM`, `ELIZA_PLATFORM`, and the existing
`MOBILE_CORE_PLUGINS` / `ELIZAOS_ANDROID_CORE_PLUGINS` lists in
`eliza/packages/agent/src/runtime/core-plugins.ts` continue to drive
platform-level inclusion. The sandbox policy layers on top — store-variant
desktop builds get a curated subset that excludes shell/code-exec even though
the platform would otherwise allow them.

## 7. Workspace folder

The agent needs a writable workspace for project files, scratch space, and
coding-agent scaffolds.

- **macOS sandbox** — first-run prompt picks a folder; the resulting URL is
  persisted as a security-scoped bookmark and re-resolved at every boot via
  `NSURL bookmarkDataWithOptions:`. The bookmark lives next to the state dir.
- **Windows MSIX** — first-run picker; Windows persists capability via
  `broadFileSystemAccess` (user-toggled) and the path is saved in app config.
- **Linux Flatpak** — XDG document portal: each open uses
  `org.freedesktop.portal.FileChooser` and the resulting handle is persisted.
- **Direct builds** — defaults to `~/Milady` (or `MILADY_WORKSPACE_DIR` /
  `ELIZA_WORKSPACE_DIR` when set). No bookmark machinery.
- **AOSP** — `/data/data/<pkg>/files/` (the service's `getFilesDir()`),
  same writable container the agent already uses.

Resolution order at runtime (first non-empty wins): `MILADY_WORKSPACE_DIR`,
`ELIZA_WORKSPACE_DIR`, persisted bookmark/handle (sandbox builds), repo `cwd`
when it looks like a project workspace (see CLAUDE.md), state dir fallback.

## 8. State dir

`MILADY_STATE_DIR` / `ELIZA_STATE_DIR` is the per-user state root (PGlite,
trajectories, optimized prompts, curated skills, auth tokens). Default
`~/.milady`. STATUS: state-dir resolver consolidation in flight (State dir
agent) — single resolver, no per-call ad-hoc paths.

In sandbox builds the state dir lives inside the OS app container
(`~/Library/Containers/<bundle-id>/Data/.milady` on macOS,
`%LOCALAPPDATA%\Packages\<pkg>\LocalState\.milady` on Windows,
`~/.var/app/<flatpak-id>/.milady` on Flatpak). It is invisible from Finder /
Explorer / Files outside that container — see §12.

The AOSP runtime sets `ELIZA_STATE_DIR` to the service's `.eliza` subdirectory
under `getFilesDir()` (see `ElizaAgentService.java` line 760).

## 9. Coding agents under sandbox

`plugin-shell`, `plugin-coding-tools`, the `EXECUTE_CODE` action, and the
PTY-spawning side of `plugin-agent-orchestrator` are gated OFF in store
builds. The user-visible effect:

- The Skills surface still lists `coding-agent`, but invoking it returns a
  one-line explanation that the privileged surface is not available in the
  sandbox build, with a link to install the direct build.
- The mode picker tile for "On device" is greyed with the same hint.
- Direct builds keep the full surface unchanged.

The reason these are off is not adversarial — it's that store policy bans
shipping `claude`, `codex`, `opencode`, and a launchable `bun` inside the
sandbox container without re-signing them with the host app's identity, and
that re-signing dance is not a constraint we want to take on for the first
sandbox release. See §13.

## 10. What store reviewers see

- **MAS** — `mas.entitlements` enables App Sandbox; JIT entitlement
  (`com.apple.security.cs.allow-jit`) ships with a written explanation in the
  App Review notes ("Bun runtime requires JIT for the agent's V8/JSC layer";
  expect a back-and-forth on the first submission).
- **MS Store** — MSIX without `runFullTrust`; `broadFileSystemAccess` declared
  as a restricted capability with a justification.
- **Flathub** — manifest with no `--filesystem=home`, no `--share=network`
  beyond what the API client needs, all extra access via XDG portals.
- **App Store (iOS)** — `PrivacyInfo.xcprivacy` declares the API access types
  used; LlamaCppCapacitor stripped from the iOS-cloud target so no JIT path
  ships.
- **Play (Android cloud target)** — no `QUERY_ALL_PACKAGES`, no
  `MANAGE_EXTERNAL_STORAGE`, no foreground-service abuse; the agent runtime is
  not bundled into the APK in the cloud target.

## 11. Migration: direct ↔ store

The state dir paths differ between variants (system home vs. container path),
so a switch is not transparent.

- **Direct → store** — copy `~/.milady` into the new sandbox container path on
  first run of the store build. A one-shot importer ("Import from direct
  install?") detects the legacy path and offers the copy.
- **Store → direct** — symmetric. The direct build offers to import from the
  container path it can detect. STATUS: importer UI in flight as part of the
  state-dir consolidation work.

Both directions copy; neither moves. The user can keep both installed
simultaneously without conflict because the state dirs do not overlap.

## 12. Limitations and trade-offs

- **No GPU passthrough issue.** Sandbox here is OS app sandbox, not a VM —
  the GPU is the host GPU, used by the WebView and by any local LLM the
  direct build dials.
- **Local LLM only on direct builds.** Ollama/llama.cpp dial-out and bundled
  llama.cpp are direct-only; store builds always go to Cloud for inference.
- **Coding agents only on direct builds.** See §9.
- **State dir invisible in Finder/Explorer/Files for store builds.** Users
  who expect to inspect `~/.milady` find an empty path — the actual store
  data is under `~/Library/Containers/...` (or the OS-equivalent). The mode
  picker explains this; the importer (§11) eases the transition.
- **MAS first-submission timing.** The JIT entitlement explanation usually
  triggers App Review questions — budget a review cycle for the first MAS
  submission.
- **Third-party provider keys in store builds do not reach the cloud agent.**
  A user who enters `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` etc. via the
  Settings UI in a store build writes the value through the *local* secrets
  API (`/api/secrets/manager/*`). The local agent runtime is not running —
  store builds route to Eliza Cloud — so those keys never reach the agent
  that actually performs inference. The cloud agent uses Eliza Cloud's
  managed inference (billed through the user's Cloud account). BYOK for
  store-build users routes through the Eliza Cloud dashboard (per-agent
  character secrets), not the local Settings UI. Verified 2026-05-14: only
  `ELIZAOS_CLOUD_API_KEY` / `ELIZAOS_CLOUD_ENABLED` are forwarded into
  `runtime.character.secrets` via `plugins/plugin-elizacloud/src/routes/cloud-routes.ts`;
  third-party provider keys are not.

## 13. Out of scope (future work)

- **Bundling and re-signing `claude` / `codex` / `opencode` for store builds.**
  Each binary would have to be embedded under the app bundle, signed with the
  host identity, and exempted (or re-allowed) by entitlements. There is also a
  policy question about whether the storefront accepts shipping a third-party
  AI CLI inside another AI app. Tracked as a separate project; sandbox builds
  currently disable the surface entirely.
- **Sandboxed Ollama bridge.** A Cloud-routed local-inference shim that lets
  store builds reach a host Ollama via a user-explicit bridge would lift the
  Cloud-forced rule for some users. Not in scope.
- **AOSP terminal-surface plugin pinning.** See § AOSP audit (below) for
  the plugin-list gap and the path to closing it.

## AOSP audit (terminal-access surface)

The AOSP build (`bun run build:android:system`,
`eliza/packages/app-core/scripts/aosp/`) is the privileged platform-signed APK.
It is not a sandbox variant — it is the on-device build for AOSP. The agent
runs as `priv_app` SELinux domain, with `BuildConfig.AOSP_BUILD=true` flipping
on `ELIZA_LOCAL_LLAMA=1` and the bundled libllama.so under `agent/{abi}/`.

**The host capability is present.** `ElizaAgentService` (see
`apps/app/android/app/src/main/java/ai/milady/milady/ElizaAgentService.java`
lines 700–900) launches bun via `ProcessBuilder` from the priv_app data dir.
Android's seccomp filter blocks `io_uring` / `pidfd_open` / `preadv2` (worked
around by the `BUN_FEATURE_FLAG_*` knobs at lines 898–900) but does **not**
block `fork`, `execve`, `posix_openpt`, or `/dev/ptmx`. AOSP's `system/sepolicy`
allows `priv_app privapp_data_file:file execute`. So a child `sh` and a PTY
master/slave pair are reachable in principle.

**The runtime gap.** `eliza/packages/agent/src/runtime/core-plugins.ts`
defines `MOBILE_CORE_PLUGINS = ["@elizaos/plugin-sql"]` and
`ELIZAOS_ANDROID_CORE_PLUGINS = ["@elizaos/app-wifi", "@elizaos/app-contacts",
"@elizaos/app-phone"]`. `plugin-collector.ts` (line 338) seeds with
`MOBILE_CORE_PLUGINS` whenever `isMobilePlatform()` is true — and AOSP sets
`ELIZA_PLATFORM=android` (`ElizaAgentService.java` line 761), so AOSP gets the
mobile-curated set. **`plugin-shell` and `plugin-coding-tools` are excluded**,
so the agent has no exposed shell/PTY action even though the host process
could spawn one.

**RESOLVED.** `ELIZAOS_ANDROID_TERMINAL_PLUGINS = ["@elizaos/plugin-shell",
"@elizaos/plugin-coding-tools"]` is now seeded by `plugin-collector.ts` when
`isElizaOsAndroidRuntime()` is true (i.e. `ELIZA_PLATFORM=android` +
`ELIZA_LOCAL_LLAMA=1`). The mobile allowlist filter at the end of
`collectPluginNames` was extended to admit them on AOSP only. Stock Play
Android still excludes them — verified in
`packages/agent/src/runtime/plugin-collector-aosp.test.ts` (5 cases:
AOSP includes them, stock Android excludes them, iOS excludes them,
ELIZAOS_ANDROID_CORE_PLUGINS still load alongside, `features.shellEnabled=false`
still removes plugin-shell).

**Remaining (optional, lower priority)**:

1. Verify `@lydell/node-pty` resolves under the bundled bun runtime on AOSP —
   it ships a prebuilt binary per arch and the AOSP agent-bundle staging in
   `run-mobile-build.mjs` needs to include the matching `.node`. If the
   native module is missing, `plugin-shell` falls back to the non-PTY
   `cross-spawn` path, which is still a usable shell — PTY is the upgrade.
   **Status (2026-05-14):** `stage-android-agent.mjs` does not currently
   bundle `@lydell/node-pty`, so AOSP runs the non-PTY shell path
   (`plugins/plugin-shell/services/shellService.ts:1372-1374` is the
   graceful fallback). Functional, just no terminal-control sequences. To
   upgrade, add the arm64 prebuilt to the agent bundle staging step.
2. Optional: stage a terminal-emulator UI surface in the WebView. The agent's
   action is what the user really needs ("the agent runs `sh` and reads
   output"), so this is purely UX.

The Capacitor/Play target is not affected — `build:android` (the regular
Capacitor APK) and the new `build:android:cloud` (in flight) are stock
Android, run unprivileged, and should remain shell-less. The privileged AOSP
target is the one that should expose the surface.

**Verified untouched.** The Android-cloud agent is adding a *new* target;
existing `android` and `android-system` targets in `run-mobile-build.mjs`
(lines 2931, 3050) keep their current behavior. The privileged AOSP build is
not at risk of inheriting Play-Store gating.

## See also

- `eliza/packages/app-core/scripts/aosp/README.md` — AOSP toolkit reference.
- `apps/app/android/app/src/main/java/ai/milady/milady/ElizaAgentService.java`
  — privileged Android service, agent process launcher, seccomp workarounds.
- `eliza/packages/agent/src/runtime/core-plugins.ts` and
  `eliza/packages/agent/src/runtime/plugin-collector.ts` — plugin-set selection.
- `eliza/plugins/plugin-shell/services/shellService.ts` — shell + PTY surface.
- `eliza/packages/app-core/src/runtime/sandbox-policy.ts` (in flight) —
  runtime gating for store builds.
- `eliza/packages/app-core/src/runtime/build-variant.ts` (in flight) —
  build-variant resolver.
