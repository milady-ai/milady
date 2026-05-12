# MASTER.md — Milady OOB & Architecture Plan

The single thread that ties together every tangent we've been pulling on:
the chat "provider issue" message, the port-shift renderer disconnect,
the Electrobun god module, the 24+ persistence layers, the vault →
PGlite migration, the wallet bridge, the cloud login race, and the
welcome redesign.

This document is the chain. Everything below is one ordered plan
toward: **brand-new install → `bun run dev:desktop` → click "Use
local" → say "hey" → get a real reply, every time.**

> **Companion: [AUDIT.md](./AUDIT.md)** — file-by-file coverage tracker
> across all ~4,500 TypeScript files in the repo, organized by
> dependency depth. MASTER.md is the *plan*; AUDIT.md is the
> *coverage*. The plan won't ship until the audit is exhaustive,
> because every uncovered file is a potential undo of the plan.

---

## 0. The trigger

User said "hey" → agent replied **"Sorry, I'm having a provider
issue."** Providers were registered and healthy. The renderer was
calling `http://127.0.0.1:31337/api/...` while the API was actually
listening on `31338` (orchestrator port-shifted because something
else was on 31337). 245 `Load failed` / 404 errors in the dev log.
The chat request never reached the API.

Cause: `RuntimeGate.tsx:67` had `LOCAL_AGENT_API_BASE = "http://127.0.0.1:31337"`
hardcoded. Once `client.setBaseUrl()` locks (`_userSetBase = true`),
it stops re-reading the boot config / window globals — so the
Electrobun-pushed `apiBaseUpdate` (which had the correct port) was
ignored.

**Hot fix already landed (this session):**
- `RuntimeGate.tsx` — `resolveLocalAgentApiBase()` now reads
  `getElizaApiBase()` at click time.
- `startup-phase-restore.ts` — `reconcilePersistedApiBaseWithLive()`
  rewrites a stale persisted loopback base to the live one on restore.

The hot fix unsticks the user. The rest of this document is *why
the bug existed in the first place* and how to make it impossible.

---

## 1. What the dependency graph showed

The Electrobun `index.ts` graph: one root with ~50 outbound edges,
two leaf-hubs everything re-converges on, mesh-style cross-edges
between leaves. Textbook god-module.

The bug class follows directly. `pushApiBaseToRenderer` is called
from **four** sites inside `index.ts` (lines 330, 1504, 1516, 1648),
each under a different lifecycle condition. Nobody owns "what is the
renderer's current API base." It's smeared. A port-shift can land the
renderer on stale 31337 because no single subsystem reconciles it.

The same disease is in three places:

| Surface              | Symptom                                    | Disease                          |
|----------------------|--------------------------------------------|----------------------------------|
| Electrobun main      | port-shift renderer disconnect             | God module, no API-base owner    |
| App-core persistence | "config came from where?" **60** keys across 29 files (Layer 8 audit, was estimated 24+) | No canonical merger     |
| Chat fallback        | "provider issue" misnames empty responses  | One string, four trigger paths   |

---

## 2. The chain

```
Phase 1 (DONE)  vault → PGlite                  single source for secrets/config
                                                17 parity tests passing
                                                ↓
Phase 2  OOB consolidation                      eliminate "config came from where?"
         (tasks 10-19)                          ↓
Phase 3  Electrobun decomposition               kill the god module, give every
         (extracted from this session)          lifecycle one owner
                                                ↓
Phase 4  Chat fallback honesty                  stop blaming providers when they
                                                're not the cause
                                                ↓
DONE     OOB smoke test (Phase 2 task 11)       enforces the contract forever
```

Each phase is a precondition for the next. Phase 2 needs Phase 1's
vault. Phase 3's API-base owner needs Phase 2's onboarding-flag-in-vault
to know what state to push. Phase 4 needs Phase 3's deterministic API
plumbing so we can trust which failures are actually provider failures.

---

## 3. The plan, ordered

### Phase 0 — Exhaustive file-by-file audit (the spine)

Tracked in [AUDIT.md](./AUDIT.md). Walks every code file in dependency
order and applies the eight AGENTS.md axes (dedup, types, dead, cycles,
errors, legacy, slop, boundaries). 12 layers totaling ~4,500 files.

Until a layer is fully audited, every refactor in a higher layer is
provisional — a lower-layer change can still invalidate it. Phases 2,
3, and 4 below cannot complete without their dependent audit layers
being green.

| Phase | Depends on audit through |
|-------|--------------------------|
| 2     | Layers 0, 1, 5, 8, 9     |
| 3     | Layers 0, 1, 2           |
| 4     | Layers 0, 1, 6           |

### Phase 2 — OOB consolidation (existing tasks 10-19)

| #  | Task                                            | Why first                                                  |
|----|-------------------------------------------------|------------------------------------------------------------|
| 10 | Define & document OOB-correct end state         | Without this, every later task is undefined-done           |
| 11 | OOB smoke-test script                           | Lets every later task ship with proof                      |
| 15 | Delete `.vault-hydrated.json` marker            | Cheapest cleanup; one less special-case                    |
| 12 | Onboarding-complete flag into vault prefs       | Removes one persistence layer; unlocks 13 + 14             |
| 17 | Trim `cloud.apiKey` duplication                 | One place owns auth; unlocks clean reset                   |
| 13 | "Use local" atomic + actually disconnects cloud | Fixes the user's prior bug class (cloud bleeds into local) |
| 14 | Collapse reset cascade to one op                | Possible only after 12 + 17                                |
| 16 | Derive `SECRET_SALT` from master key            | Removes a sibling persistent file; vault is enough         |
| 18 | Run smoke test after each step + sign off       | Continuous; gates Phase 3                                  |
| 19 | ~~Welcome flow must configure a working LLM~~   | **Drop.** The "provider issue" wasn't a missing-provider — see Phase 4. |

### Phase 3 — Electrobun decomposition

Split the god module by lifecycle ownership. Each new module owns a
single concern with one source of truth and one push path.

| Module                      | Owns                                                                | Replaces in `index.ts`                          |
|-----------------------------|---------------------------------------------------------------------|-------------------------------------------------|
| `lifecycle/api-base-owner.ts`  | current API base, push to every window, listen to agent restarts    | 4 RPC push sites + 1 HTML-inject site (see ⚠ below) |
| `lifecycle/heartbeat-menu.ts`  | status tick, menu snapshot, permissions sync                        | the center-right hub in the graph               |
| `lifecycle/desktop-session.ts` | `loadOrCreateDesktopSession`, `primeDesktopSessionAuth`, cookie jar | session priming flow                            |
| `lifecycle/agent-supervisor.ts`| `getAgentManager`, restart, port resolution                         | agent lifecycle calls                           |

> ⚠ **Layer 9 audit caught a folder-name collision:** the originally-named
> `platforms/electrobun/src/bridge/` would clash with the existing
> `app-core/src/bridge/` (which owns the *renderer-side* RPC client and
> Capacitor wrappers — completely unrelated). New modules must live under
> `platforms/electrobun/src/lifecycle/` (or similar) to keep the two
> "bridges" distinguishable. Updated above.

> ⚠ **Layer 1 audit found a 5th API-base push surface** I missed in my
> first pass: `injectApiBaseIntoHtml` at `electrobun/src/index.ts:843-861`
> writes `window.__ELIZA_API_BASE__`, `__ELIZA_API_TOKEN__`, and **three
> parallel boot-config keys** (`__ELIZAOS_APP_BOOT_CONFIG__`,
> `__ELIZA_APP_BOOT_CONFIG__`, `Symbol.for("elizaos.app.boot-config")`)
> directly into the served HTML before renderer JS runs. This is the
> only surface that beats first-paint. The api-base-owner module **must
> own both the RPC push path and this HTML-inject path** — otherwise
> the renderer keeps reading two sources of truth even after Phase 3.

> ⚠ **Layer 1 audit found 19 distinct concerns inside `index.ts`**
> (not 4). The 4 named modules above are the *highest-value* extracts;
> additional candidates surfaced: macOS window effects, window-state
> persistence (×2), the static renderer HTTP server with `/api` proxy,
> main-window lifecycle, menu config IO, menu reset reachability,
> updater + 200-LOC menu-action switch, deep-links, shutdown, env
> loading, WebGPU init, startup-crash-report, tray. After full split,
> `index.ts` target: 2587 → ≤300 LOC. Treat the 4 named extracts as
> Phase 3a-3d; the rest as Phase 3e (sweep).

### Phase 4 — Chat fallback honesty

The "provider issue" string is *misnamed*. It's the **generic
no-response fallback**, fired from four paths:

1. Planner picked `IGNORE` / `NONE` / empty `REPLY` (intentional
   no-response check missed it)
2. Action ran but emitted no text callback
3. Text normalized to a placeholder (`(no response)`, etc.)
4. Actual generation throw (the only real provider issue)

Changes:

- Rename `PROVIDER_ISSUE_CHAT_REPLY` → `NO_RESPONSE_FALLBACK_REPLY`
  in `eliza/packages/agent/src/api/chat-routes.ts`.
- Reserve "provider issue" wording for path #4 only (caught throw).
- For paths #1–#3, return a context-appropriate string ("Got that,
  no reply needed" for IGNORE; "(no response)" for empty action;
  etc.) — or surface the action result so the user sees what happened.
- Fix `isIntentionalNoResponseResult` so legitimate IGNOREs route to
  the silent path instead of the fallback string.

---

## 4. Sequencing graph

```
       Phase 1 (DONE: vault on PGlite)
                  │
                  ▼
        ┌───── Phase 2 ─────┐
        │                   │
       T10 ─ T11 ─ T15      │
        │     │             │
        ▼     ▼             │
       T12 ─ T17            │
        │     │             │
        ▼     ▼             │
       T13   T14 ── T16     │
        │     │     │       │
        └─────┴─────┴── T18 ┘
                  │
                  ▼
            Phase 3 (Electrobun split)
              api-base-owner first
              (unblocks T18 sign-off
               for port-shift case)
                  │
                  ▼
            Phase 4 (chat fallback rename)
                  │
                  ▼
              DONE — smoke
              test green on
              fresh install
```

Critical path: **T10 → T11 → T12 → T13 → api-base-owner → T18 → Phase 4.**
Everything else parallelizes onto that spine.

---

## 5. Definition of done

A fresh user, on a clean machine:

1. `git clone … && bun install`
2. `bun run dev:desktop`
3. Window opens. Splash → onboarding → "Use local" tile.
4. Click. Lands in chat. Composer is enabled (or shows "Set up an
   LLM provider" if no provider configured — never a "provider
   issue" lie).
5. Says "hey". Gets a real reply within 30s. Or, if no provider is
   configured, gets a clear "Set up a provider in Settings" message.
6. Closes app. Reopens. Lands in chat. "hey" still works.
7. Settings → Reset. Onboarding fresh. Repeat from step 3.

Smoke test (Phase 2 task 11) automates steps 1–6 and gates every
PR going forward. CI runs it on macOS/Linux/Windows.

---

## 6. Non-goals

- **No new abstractions** outside the four Phase 3 extractions.
  Resist the urge to "while we're at it."
- **No backwards-compat shims** for the renamed `PROVIDER_ISSUE_CHAT_REPLY`.
  It's an internal constant; rename and move on.
- **No grace periods** for the dropped Phase 2 task 19.
- **No fallback hydration** for the deleted `.vault-hydrated.json`.
  The vault either has the entry or it doesn't.

---

## 7. Where this lives

- **This file (`MASTER.md`)** — the plan, root-level so it's seen.
- **`AGENTS.md`** — the existing standing rules (architecture
  commandments, what to remove on sight). Still authoritative.
- **`CLAUDE.md`** — agent conventions and project layout. Still
  authoritative.
- **Tasks 10–19** — live in the task tracker, sequenced per §3 above.
  Phase 3 + Phase 4 will be added as tasks once Phase 2 sign-off lands.
