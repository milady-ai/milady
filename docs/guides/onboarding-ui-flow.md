---
title: Onboarding UI flow
sidebarTitle: Onboarding UI
summary: How the wizard’s step order, back/next, and sidebar stay in sync—and why the code is split between pure flow helpers and AppContext.
description: Architecture of Milady’s in-app onboarding wizard—flow.ts vs AppContext, custom vs cloud tracks, and safe ways to change steps.
---

# Onboarding UI: flow data and navigation

This guide describes how the **in-app onboarding wizard** (not the HTTP `/api/onboarding` contract) decides step order, forward/back motion, and the sidebar. It focuses on **why** the code is structured this way so future changes stay safe.

## Why split “data” and “motion”?

**Problem:** Step order and sidebar labels used to be duplicated in multiple places (`handleOnboardingNext`, `handleOnboardingBack`, `OnboardingStepNav`). That drifted easily and made “go back” behavior hard to reason about.

**Approach:**

- **`packages/app-core/src/onboarding/flow.ts`** — Pure functions only: given the current step, what is the linear order, the next/previous id, whether a jump is allowed, and which sidebar rows to show. No React, no API client, no `localStorage`. *Why pure:* easy to unit test and impossible to accidentally import UI side effects.
- **`AppProvider` (`advanceOnboarding`, `revertOnboarding`, `handleOnboardingJumpToStep`, `goToOnboardingStep`)** — All **side effects** live here: `handleCloudLogin`, `handleOnboardingFinish`, provider auto-fill, persisting the step, Flamina guide updates. *Why keep this in context:* those hooks close over dozens of pieces of state; extracting them prematurely into a separate module tends to produce huge dependency bags or stale closures.

## Tracks: custom vs cloud

**Why two tracks:** The product supports a full local setup path (`connection` → `rpc` → `senses` → `activate`) and a shorter cloud path (`welcome` → `cloudLogin` → finish). They are different linear sequences.

**How the active track is chosen:** If the current step id appears in `CUSTOM_ONBOARDING_STEPS` ([`types.ts`](../../packages/app-core/src/state/types.ts)), we treat the user as on the **custom** track; otherwise **cloud**. *Why infer from the current step instead of a separate `track` field:* it matches legacy behavior and avoids migrating persisted state. *Caveat:* `welcome` is **not** a custom step, so it resolves against the cloud order even when the user will soon click “Get Started” and land on `connection`.

**Why step lists live in `types.ts`:** Those arrays carry i18n keys for names/subtitles and are imported by `flow.ts`. Keeping them in `types` avoids a circular import (`types` ↔ `flow`) while still giving `flow.ts` a single mechanical source for **order** (array order = wizard order).

## Operators (what to call when)

| Mechanism | Use when | Why |
|-----------|----------|-----|
| `advanceOnboarding` / `handleOnboardingNext` | User presses Continue or an auto-advance (e.g. cloud connected) | Runs step-specific work **before** moving (cloud login on `welcome`, finish on `activate`, etc.), then uses `resolveOnboardingNextStep`. |
| `revertOnboarding` / `handleOnboardingBack` | User presses Back | Uses `resolveOnboardingPreviousStep`; from `connection` the previous step is **`welcome`** even though `welcome` is not in the custom sidebar list. |
| `handleOnboardingJumpToStep` | User clicks a **completed** sidebar row | Same backward guarantee as repeated Back, but only if `canRevertOnboardingTo` passes (strictly earlier index in the **current** track). *Why backward-only:* forward jumps would skip `handleOnboardingFinish`, cloud login, and validation. |
| `goToOnboardingStep` | Controlled transitions that are not “Next” (e.g. Welcome **Get Started** → `connection`) | Updates persisted step **and** Flamina guide in advanced mode. *Why not raw `setState("onboardingStep", …)` from UI:* one place to sync guide and avoid silent desync. |

**Administrative transitions** (resume from server, “Start Over”, URL overrides) still call `setOnboardingStep` / `setOnboardingStepRaw` directly in `AppContext`. *Why excluded:* they are not user “Next/Back” and should not run advance hooks.

## Sidebar and `cloudOnly`

`getOnboardingNavMetas` mirrors the old rules: on the cloud track with `branding.cloudOnly`, the **welcome** row is hidden so the list does not imply a step the product does not show. *Why `Math.max(0, currentIndex)` in the nav component:* when `welcome` is hidden but the step is still `welcome`, `findIndex` is `-1`; clamping avoids a broken CSS class for the progress line (the active row styling may still look odd—that edge case predates this refactor).

## Connection step subflow (inside `connection`)

The wizard step id stays **`connection`**; inside that step, users move through **hosting → remote or Eliza Cloud → neural link (provider grid) → provider detail**. That inner graph is separate from `flow.ts`.

**Why separate from `flow.ts`:** outer flow is “which step index”; connection is “which panel inside one step.” Mixing them would force `flow.ts` to import connection field types and would blur “linear wizard” vs “nested state machine.”

| Piece | Role |
|-------|------|
| [`packages/app-core/src/onboarding/types.ts`](../../packages/app-core/src/onboarding/types.ts) | **Types only** for the connection subflow (`ConnectionScreen`, `ConnectionEvent`, `ConnectionFlowSnapshot`, etc.). **Why split:** consumers can depend on types without importing transition code. |
| [`packages/app-core/src/onboarding/connection-flow.ts`](../../packages/app-core/src/onboarding/connection-flow.ts) | **Pure:** `deriveConnectionScreen`, `applyConnectionTransition`, `resolveConnectionUiSpec`, `CONNECTION_TRANSITIONS`. Re-exports types. No React. **Why pure:** unit-test routing without jsdom; forbid accidental `client.*` in the same function as branch logic. |
| [`packages/app-core/src/onboarding/tests/connection-flow.test.ts`](../../packages/app-core/src/onboarding/tests/connection-flow.test.ts) | Table tests for screens, patches, and `forceCloud` steady routing. **Why table tests:** many snapshots × events; one row per edge case catches precedence bugs. |
| [`packages/app-core/src/components/onboarding/ConnectionStep.tsx`](../../packages/app-core/src/components/onboarding/ConnectionStep.tsx) | **Shell:** builds `ConnectionFlowSnapshot`, runs `forceCloudBootstrap` via the reducer, dispatches transitions, applies patches with `setState`. **Why a shell:** only here do we have stable `setState` and `useApp` handlers; the pure module stays ignorant of React. |
| [`packages/app-core/src/components/onboarding/connection/`](../../packages/app-core/src/components/onboarding/connection/) | **Views:** `ConnectionUiRoot` + one component per `ConnectionScreen`. See [`connection/README.md`](../../packages/app-core/src/components/onboarding/connection/README.md) for file map and tradeoffs. |

**Effectful transitions:** `backRemoteOrGrid` / grid back while `onboardingRemoteConnected` returns `{ kind: "effect", effect: "useLocalBackend" }`. The shell calls `handleOnboardingUseLocalBackend()` (API client + `retryStartup`). **Why not in the reducer:** those calls are not deterministic pure functions and would make tests depend on network/mocks.

**OAuth / subscription UI state** (OpenAI redirect flow, Anthropic code entry) lives in **`ConnectionProviderDetailScreen`** as local `useState`, not in the reducer. **Why:** reducer patches only **persisted** onboarding fields; OAuth wizards are ephemeral UI. **Caveat:** backing out of provider detail **unmounts** that screen, so in-progress OAuth UI resets—acceptable unless product requires otherwise (then lift state to `ConnectionStep`).

**Steady `forceCloud` routing:** When `forceCloud && onboardingRunMode === ""`, derivation treats effective run mode as `"local"` so the described screen matches the post-`useEffect` UI (provider grid), not a one-frame hosting state. **Why:** tests and mental model should match what users see after `useEffect` runs; the first paint may still differ for a frame.

**Do not** merge this graph into [`onboarding-config.ts`](../../packages/app-core/src/onboarding-config.ts) — that module builds the **submit/API payload**, not which panel to show. **Why keep apart:** submit shape can change for the REST contract without rewriting UI routing, and vice versa.

## Changing the flow safely

1. Reorder or add steps in **`CUSTOM_ONBOARDING_STEPS` / `CLOUD_ONBOARDING_STEPS`** in [`types.ts`](../../packages/app-core/src/state/types.ts) (and add a wizard `case` in `OnboardingWizard` if it is a new screen).
2. Run / extend [`tests/flow.test.ts`](../../packages/app-core/src/onboarding/tests/flow.test.ts).
3. If “Next” does new work, extend **`advanceOnboarding`** in `AppContext`—do **not** paste new step arrays there.
4. Do **not** refactor `handleOnboardingFinish` in the same change as flow tweaks unless you are prepared for a large, risky diff.

### Changing the **connection** subflow safely

1. Update **`deriveConnectionScreen`** branch order only to match the real UI in `ConnectionUiRoot` / screens; add a **`tests/connection-flow.test.ts`** fixture for every new edge case.
2. Add **`ConnectionEvent`** variants and **`applyConnectionTransition`** arms together; after `mergeConnectionSnapshot`, assert **`deriveConnectionScreen`** matches the expected screen.
3. Add or adjust a screen component under **`components/onboarding/connection/`** and register it in **`ConnectionUiRoot`**.

## Branding: `{{appName}}` in copy

Some strings use **`{{appName}}`** (welcome title, hosting question, pairing hints, etc.). **Why not hardcode “Milady”:** the same `app-core` build ships in white-label shells; the display name comes from **`BrandingContext`**.

**Contract:** pass **`appNameInterpolationVars(branding)`** (from `@miladyai/app-core/config`) as the second argument to **`t()`** whenever the locale value contains `{{appName}}`. **Why a helper:** avoids mismatched keys (e.g. `name` vs `appName`) and centralizes the default (**`DEFAULT_APP_DISPLAY_NAME`**, currently `"Eliza"`).

## System access (`senses`) — permissions UI

The permissions step shows **one Continue** control. **Why:** “Skip” vs “Continue” duplicated a single user intent (“proceed”) and confused people; permission rows still show granted vs not. Advance always uses the normal next step (no bypass from this screen).

## Eliza Cloud in the **connection** step — OAuth auto-advance

When the user connects via **Login** (OAuth) on Eliza Cloud panels inside **`connection`**, the wizard advances as soon as **`elizaCloudConnected`** becomes true—no second Confirm. **Why:** parity with **`CloudLoginStep`**; the connected badge is sufficient feedback. **Not** auto-advanced on the **API key** tab: the user may still be editing the field.

Hook: **`useAdvanceOnboardingWhenElizaCloudOAuthConnected`** next to the connection screens; see [`connection/README.md`](../../packages/app-core/src/components/onboarding/connection/README.md).

## Related docs

- [Onboarding REST API](../rest/onboarding.md) — server-side status, options, and submit.
- [Plugin resolution / NODE_PATH](../plugin-resolution-and-node-path.md) — unrelated to onboarding UI but often touched in the same repo.
