# UI Migration & Consolidation Audit

**Date**: 2026-03-22
**Scope**: `apps/app/src`, `packages/app-core`, `packages/ui`, `packages/agent`
**Goal**: Identify what generic UI code in `apps/app` should migrate to shared packages, what hacks/patches can be removed, and what can be deduplicated.

---

## TL;DR — What Stays vs What Moves

**Stays in `apps/app`** (Milady-specific):
- VRM character roster (Chen, Jin, Kei, Momo, Rin, Ryu, Satoshi, Yuki)
- Branding config (`MILADY_BRANDING`, logos, favicons, manifest)
- 3D assets (VRM models, FBX animations, world GLBs)
- `milady://` deep link protocol handling
- Platform lifecycle bootstrap (`main.tsx` — platform detection, Capacitor/Electrobun init)
- Electrobun native process code (`electrobun/src/native/`)
- Capacitor plugin implementations (`plugins/`)
- Character catalog files (`characters/`)

**Should migrate to shared packages or be cleaned up**:
Everything else listed below.

---

## 1. Window Global Injection System (HIGH PRIORITY)

`apps/app/src/main.tsx` injects 6+ globals that `packages/app-core` reads at runtime:

| Global | Purpose | Better Approach |
|--------|---------|-----------------|
| `window.__MILADY_CHARACTER_EDITOR__` | Lazy-loads CharacterEditor | Proper dynamic import or React.lazy |
| `window.__ELIZA_CLOUD_API_BASE__` | Cloud API URL | Pass via React context or config provider |
| `window.__APP_ONBOARDING_STYLES__` | Style presets | Export from app-core config, override via branding |
| `window.__APP_VRM_ASSETS__` | Character list | Pass via config provider, default in app-core |
| `window.__MILADY_API_BASE__` | API URL (desktop) | Already handled by bridge, remove duplicate |
| `window.__MILADY_API_TOKEN__` | Auth token | Already handled by bridge, remove duplicate |
| `window.__MILADY_SHARE_QUEUE__` | Share target queue | Event-based or context-based |

**Recommendation**: Replace with a typed `AppConfig` provider at the React root. `apps/app` passes its config, `app-core` consumes it via context. No globals needed.

---

## 2. Client Monkey-Patches (HIGH PRIORITY)

`apps/app/src/main.tsx` applies 4 patches to the API client after construction:

1. **`applyForceFreshOnboardingReset()`** — Dev-only hack to suppress stale backend resume config
2. **`installForceFreshOnboardingClientPatch(client)`** — Another dev onboarding workaround
3. **`installLocalProviderCloudPreferencePatch(client)`** — Overrides model provider selection for local-first
4. **`installDesktopPermissionsClientPatch(client)`** — Adds desktop permission checks

**Recommendation**: These should be proper configuration options or middleware in the API client, not post-construction patches. Move the logic into `app-core`'s client with boolean flags or a plugin system.

---

## 3. Milady-Specific Code in `app-core` (HIGH PRIORITY — Wrong Package)

These files in `packages/app-core` contain Milady-specific code that should be in `apps/app` or configured via branding:

| File | Issue |
|------|-------|
| `entry.ts` | `process.title = "milady"` hardcoded |
| `cli/cli-name.ts` | `CLI_NAME = "milady"` hardcoded |
| `config/brand-env.ts` | 15+ MILADY_* ↔ ELIZA_* env var aliases — Milady fork-specific |
| `api/server-html.ts` | Injects `window.__MILADY_API_BASE__` AND `window.__ELIZA_API_BASE__` |
| `api/server.ts` | HTTP header aliasing: `x-milady-token` → `x-eliza-token` |
| `api/server-startup.ts` | Accepts "milady", "miladyai" as valid package roots |
| `components/FlaminaGuide.tsx` | "If you skip, Milady uses the recommended route..." |
| `components/GameView.tsx` | "milady-gpu-diagnostics" ID, "Milady GPU Diagnostics" title |
| `components/release-center/shared.tsx` | Hardcoded "https://milady.ai/releases/" fallback |
| `state/vrm.ts` | Default VRM roster uses "milady-1", "milady-2" slugs |
| `events/` | `dispatchMiladyEvent()` function name |

**Recommendation**: All of these should read from the branding config or be moved to `apps/app`. `app-core` should be brand-agnostic — it's shared infrastructure.

---

## 4. Duplicated UI Components (MEDIUM PRIORITY)

**Already identified by the Dedup agent (in progress):**

| Component | In `app-core` | In `packages/ui` | Status |
|-----------|---------------|-------------------|--------|
| ErrorBoundary | Custom (reloads page) | Radix-based with fallback prop | Should consolidate |
| StatusBadge/StatusDot/StatCard | `ui-badges.tsx` (inline styles) | `status-badge.tsx` (Tailwind) | Should use `packages/ui` |
| Switch | `ui-switch.tsx` (custom) | Radix wrapper | Should use `packages/ui` |

**Additional duplicates found:**

| Pattern | In `app-core` | Better Approach |
|---------|---------------|-----------------|
| Confirm dialogs | `confirm-delete-control.tsx` | Use `packages/ui` ConfirmDelete/ConfirmDialog |
| Skeletons | Inline skeleton divs in many components | Use `packages/ui` Skeleton |
| Labels | Custom label components | Use `packages/ui` Label |
| Save footers | Custom save buttons per settings section | Use `packages/ui` SaveFooter |

---

## 5. API Server Monolith (HIGH PRIORITY)

`packages/app-core/src/api/server.ts` is **3,730 lines** — a monolithic file that:
- Re-exports all of `@miladyai/agent/api/server`
- Overrides 6 upstream functions
- Adds 30+ Milady-specific endpoint handlers
- Contains ElevenLabs API key aliasing
- Contains cloud TTS workarounds
- Contains hardened wallet export guard with rate limiting

**Note**: The Code Quality agent is **already splitting this file** into focused modules. Coordinate with them.

**Additional server files already extracted but could be consolidated further:**
- `server-cloud-tts.ts` — Cloud TTS provider setup
- `server-config-filter.ts` — Config filtering
- `server-html.ts` — HTML injection
- `server-onboarding-compat.ts` — Onboarding compatibility
- `server-security.ts` — Security middleware
- `server-startup.ts` — Startup helpers
- `server-wallet-trade.ts` — Wallet/trade endpoints

---

## 6. API Client Size (MEDIUM PRIORITY)

`packages/app-core/src/api/client.ts` is **2,100+ lines**. It:
- Reads `window.__MILADY_API_BASE__` and `window.__MILADY_API_TOKEN__`
- Contains WebSocket management
- Contains all API method implementations inline
- Mixes transport concerns with domain logic

**Recommendation**: Split into:
- `client-transport.ts` — fetch wrapper, WebSocket, reconnection
- `client-agents.ts` — agent CRUD methods
- `client-chat.ts` — message/conversation methods
- `client-wallet.ts` — wallet/trade methods
- `client-cloud.ts` — cloud/billing methods

---

## 7. Cross-Package Filesystem Import (CRITICAL)

`packages/app-core/src/character-catalog.ts` contains:
```typescript
import catalog from "../../../apps/app/characters/catalog.json" assert { type: "json" }
```

This is a **direct filesystem dependency** across package boundaries. It breaks if packages are published or used independently.

**Recommendation**: Move the catalog to `app-core` or inject it via config at runtime.

---

## 8. Environment Variable Aliasing Layer (MEDIUM PRIORITY)

`packages/app-core/src/config/brand-env.ts` maintains a bidirectional sync of 15+ env vars:
- `MILADY_API_TOKEN` ↔ `ELIZA_API_TOKEN`
- `MILADY_STATE_DIR` ↔ `ELIZA_STATE_DIR`
- `MILADY_CLOUD_TTS_DISABLED` ↔ `ELIZA_CLOUD_TTS_DISABLED`
- etc.

This is a Milady fork concern, not shared infrastructure.

**Recommendation**: Move to `apps/app` or a `milady-compat` package. `app-core` should only use one set of env var names.

---

## 9. Platform Init Code Split (LOW PRIORITY)

Platform initialization is split between two locations:
- `apps/app/src/main.tsx` — Capacitor bridge init, status bar, keyboard, lifecycle
- `packages/app-core/src/platform/init.ts` — Extracted from main.tsx (comment says so)

The split is reasonable (app-core has the reusable parts), but the migration comments suggest this was a recent partial extraction. Some init code may still be duplicated.

---

## 10. Bridge Implementation Split (LOW PRIORITY — Intentional)

- `packages/app-core/src/bridge/` — Abstract interfaces (capacitor-bridge, electrobun-rpc, storage-bridge)
- `apps/app/electrobun/src/bridge/` — Concrete Electrobun implementation

This split is **correct by design** (abstract vs. concrete). No action needed.

---

## 11. RPC Schema Duplication (LOW PRIORITY — Necessary)

- `apps/app/electrobun/src/rpc-schema.ts` — Full 1000+ line schema definition (main process)
- `apps/app/electrobun/src/bridge/electrobun-bridge.ts` — CHANNEL_TO_RPC mapping (renderer process)

Duplication exists because renderer can't import main-process modules. This is a build-boundary constraint.

**Possible improvement**: Generate the CHANNEL_TO_RPC mapping from rpc-schema at build time.

---

## 12. `packages/agent` — No Action Needed

`packages/agent/src/` is effectively empty (just type stubs). The real code is in `/dist/` as a compiled artifact from elizaOS. This is a re-published upstream package — no migration needed.

---

## Priority Summary

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| CRITICAL | Fix cross-package filesystem import (#7) | Low | Prevents breakage |
| HIGH | Replace window globals with config provider (#1) | Medium | Removes hack pattern |
| HIGH | Replace client monkey-patches with config (#2) | Medium | Removes hack pattern |
| HIGH | Move Milady-specific code out of app-core (#3) | High | Makes app-core reusable |
| HIGH | Server.ts split (#5) | High | Already in progress by another agent |
| MEDIUM | Consolidate duplicated UI components (#4) | Medium | Already in progress by dedup agent |
| MEDIUM | Split client.ts (#6) | Medium | Improves maintainability |
| MEDIUM | Move env var aliasing (#8) | Low | Cleaner separation |
| LOW | Platform init cleanup (#9) | Low | Minor cleanup |
| LOW | RPC schema codegen (#11) | Medium | Nice-to-have |

---

## Coordination Notes

**Active agents working on related tasks (see docs/collaboration.md):**
1. **AppContext Decomposition agent** — Breaking up the 6,951-line AppContext.tsx god object
2. **Dedup & UI Migration agent** — Already migrating inline UI patterns to `@miladyai/ui`, created `packages/vrm-utils`
3. **Code Quality agent** — Splitting server.ts, removing dead code, fixing bugs
4. **Test Cleanup agent** — Removing dead/stub tests

Items #4 and #5 overlap with agents 2 and 3 respectively. New work should focus on items #1, #2, #3, #7, and #8 which no agent is currently handling.
