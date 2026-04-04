# Startup & Onboarding Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "Backend Unreachable" blocking desktop users, fix broken permissions in onboarding, fix all pre-existing test failures, and simplify the startup flow.

**Architecture:** The startup coordinator manages splash -> onboarding -> runtime lifecycle. Recent refactors (commits `808213341`, `d72c8bc25`) removed the onboarding compat layer and canonicalized config, breaking the "previously onboarded but backend gone" path. The fix makes `resolveStartupWithoutRestoredConnection()` offer re-onboarding instead of a dead-end error, adds missing source code (security tab, i18n keys, memory monitor, skills filter), and fixes test expectations.

**Tech Stack:** TypeScript, React, Vitest, Bun

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/app-core/src/state/onboarding-bootstrap.ts` | Modify | Fix backend-unreachable to allow re-onboarding |
| `packages/app-core/src/state/onboarding-bootstrap.test.ts` | Modify | Update test expectation |
| `packages/app-core/src/navigation/index.ts` | Modify | Add "security" tab |
| `packages/app-core/src/i18n/locales/en.json` | Modify | Add missing translation keys |
| `packages/app-core/src/i18n/locales/*.json` | Modify | Add missing keys to all locales |
| `scripts/ensure-skills.mjs` | Modify | Filter hidden directories |
| `packages/app-core/src/hooks/useMemoryMonitor.ts` | Create | Implement `startMemoryLeakDetector` |
| `packages/app-core/src/hooks/index.ts` | Modify | Export new hook |
| `apps/app/electrobun/src/__tests__/startup-bootstrap.test.ts` | Modify | Fix string pattern match |
| `packages/app-core/src/platform/cloud-preference-patch.ts` | Modify | Fix service normalization |
| `vitest.config.ts` | Modify | Add `apps/app/test/` to include paths |

---

### Task 1: Fix "Backend Unreachable" Dead-End

The critical production bug. When a previously-onboarded user's backend is unreachable, the app shows an unrecoverable error. Fix: allow re-onboarding with a retry option instead of a dead-end error.

**Files:**
- Modify: `packages/app-core/src/state/onboarding-bootstrap.ts:110-128`
- Modify: `packages/app-core/src/state/onboarding-bootstrap.test.ts:156-171`

- [ ] **Step 1: Update `resolveStartupWithoutRestoredConnection()` to allow re-onboarding**

In `packages/app-core/src/state/onboarding-bootstrap.ts`, replace lines 110-128:

```typescript
export function resolveStartupWithoutRestoredConnection(args: {
  hadPersistedOnboardingCompletion: boolean;
}): StartupWithoutConnectionResolution {
  // Always allow re-onboarding. Even if the user previously completed setup,
  // a missing backend means we should let them reconnect rather than showing
  // a dead-end error screen.
  return { kind: "onboarding" };
}
```

- [ ] **Step 2: Update the test expectation**

In `packages/app-core/src/state/onboarding-bootstrap.test.ts`, replace the test at lines 156-171:

```typescript
  it("allows re-onboarding for previously onboarded users when backend is gone", () => {
    expect(
      resolveStartupWithoutRestoredConnection({
        hadPersistedOnboardingCompletion: true,
      }),
    ).toEqual({ kind: "onboarding" });
  });
```

- [ ] **Step 3: Run the test**

Run: `bunx vitest run packages/app-core/src/state/onboarding-bootstrap.test.ts --reporter verbose`
Expected: All tests pass

- [ ] **Step 4: Also update the startup coordinator test**

In `packages/app-core/src/state/startup-coordinator.test.ts`, find the test at line 130 ("goes to error with backend-unreachable") and update it:

```typescript
    it("allows re-onboarding when backend is gone after prior onboarding", () => {
      let state: StartupState = { phase: "restoring-session" };
      state = startupReducer(state, {
        type: "NO_SESSION",
        hadPriorOnboarding: true,
      });
      // After the fix, prior-onboarding users should be able to re-onboard
      // instead of being stuck on an error screen.
      expect(state).toEqual({
        phase: "onboarding-required",
        serverReachable: false,
      });
    });
```

- [ ] **Step 5: Update startup-phase-restore.ts to dispatch correctly**

In `packages/app-core/src/state/startup-phase-restore.ts`, find the block around line 140-148 where `resolveStartupWithoutRestoredConnection` is called. Since it now always returns `{ kind: "onboarding" }`, the `startup-error` branch is dead code. Simplify:

```typescript
    if (!restoredActiveServer) {
      // No saved backend found. Let the user (re-)onboard.
      deps.setOnboardingLoading(false);
      dispatch({ type: "NO_SESSION", hadPriorOnboarding: hadPrior });
      return;
    }
```

- [ ] **Step 6: Update the coordinator reducer to handle NO_SESSION uniformly**

In `packages/app-core/src/state/startup-coordinator.ts`, find the `NO_SESSION` case (around line 140). Change:

```typescript
        case "NO_SESSION":
          return { phase: "onboarding-required", serverReachable: false };
```

Remove the `hadPriorOnboarding` branch entirely — users always get the onboarding flow regardless.

- [ ] **Step 7: Run all startup tests**

Run: `bunx vitest run packages/app-core/src/state/ --reporter verbose`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add packages/app-core/src/state/onboarding-bootstrap.ts \
  packages/app-core/src/state/onboarding-bootstrap.test.ts \
  packages/app-core/src/state/startup-coordinator.ts \
  packages/app-core/src/state/startup-coordinator.test.ts \
  packages/app-core/src/state/startup-phase-restore.ts
git commit -m "fix: allow re-onboarding when backend unreachable instead of dead-end error"
```

---

### Task 2: Add Missing "security" Tab to Navigation

**Files:**
- Modify: `packages/app-core/src/navigation/index.ts:29-50, 111-120, 135-157, 245-289`

- [ ] **Step 1: Add "security" to the Tab type**

In `packages/app-core/src/navigation/index.ts`, add `"security"` to the `Tab` union type (after `"database"`):

```typescript
export type Tab =
  | "chat"
  | "companion"
  | "stream"
  | "apps"
  | "character"
  | "character-select"
  | "wallets"
  | "knowledge"
  | "connectors"
  | "triggers"
  | "plugins"
  | "skills"
  | "advanced"
  | "fine-tuning"
  | "trajectories"
  | "voice"
  | "runtime"
  | "database"
  | "security"
  | "desktop"
  | "settings"
  | "logs";
```

- [ ] **Step 2: Add to TAB_PATHS**

Add to the `TAB_PATHS` record:

```typescript
  security: "/security",
```

- [ ] **Step 3: Add to Advanced tab group**

Add `"security"` to the `ALL_TAB_GROUPS` Advanced entry's `tabs` array:

```typescript
  {
    label: "Advanced",
    tabs: [
      "advanced",
      "plugins",
      "skills",
      "fine-tuning",
      "trajectories",
      "runtime",
      "database",
      "security",
      "logs",
    ],
    icon: Sparkles,
    description: "Developer and power user tools",
  },
```

- [ ] **Step 4: Add to titleForTab switch**

Add a case to `titleForTab()`:

```typescript
    case "security":
      return "Security";
```

- [ ] **Step 5: Run navigation tests**

Run: `bunx vitest run packages/app-core/test/app/navigation.test.tsx --reporter verbose`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/navigation/index.ts
git commit -m "feat: add security tab to navigation"
```

---

### Task 3: Add Missing i18n Translation Keys

**Files:**
- Modify: `packages/app-core/src/i18n/locales/en.json`
- Modify: All other locale files (`es.json`, `ko.json`, `pt.json`, `tl.json`, `vi.json`, `zh-CN.json`)

- [ ] **Step 1: Add keys to en.json**

Add these entries to the English locale (alphabetically near other `codingagentsettingssection.*` keys):

```json
  "codingagentsettingssection.ScratchRetention": "Scratch Retention",
  "codingagentsettingssection.ScratchRetentionDesc": "What happens to scratch workspace code when a task finishes.",
```

- [ ] **Step 2: Add same keys to all other locale files**

Add the same English strings to `es.json`, `ko.json`, `pt.json`, `tl.json`, `vi.json`, `zh-CN.json`. Use the English defaultValue as the initial value (translation follows later).

- [ ] **Step 3: Run i18n tests**

Run: `bunx vitest run packages/app-core/test/app/i18n.test.ts --reporter verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/i18n/locales/
git commit -m "fix: add missing ScratchRetention translation keys to all locales"
```

---

### Task 4: Filter Hidden Directories in ensure-skills.mjs

**Files:**
- Modify: `scripts/ensure-skills.mjs:47-57`

- [ ] **Step 1: Add hidden directory filter**

In `scripts/ensure-skills.mjs`, update `shippedSkillIds()` to filter entries starting with `.`:

```javascript
function shippedSkillIds(assetsDir = SHIPPED_SKILLS_DIR) {
  return readdirSync(assetsDir)
    .filter((entry) => {
      if (entry.startsWith(".")) return false;
      try {
        return statSync(join(assetsDir, entry)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}
```

- [ ] **Step 2: Also add MILADY_STATE_DIR support to resolveStateDir**

```javascript
export function resolveStateDir(env = process.env, home = homedir) {
  const override = env.MILADY_STATE_DIR?.trim() || env.ELIZA_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, home);
  }
  const namespace = env.ELIZA_NAMESPACE?.trim();
  return join(home(), `.${namespace || "eliza"}`);
}
```

- [ ] **Step 3: Run ensure-skills tests**

Run: `bunx vitest run scripts/ensure-skills.test.ts --reporter verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add scripts/ensure-skills.mjs
git commit -m "fix: filter hidden dirs in ensure-skills and support MILADY_STATE_DIR"
```

---

### Task 5: Implement startMemoryLeakDetector

**Files:**
- Create: `packages/app-core/src/hooks/useMemoryMonitor.ts`
- Modify: `packages/app-core/src/hooks/index.ts`

- [ ] **Step 1: Create the implementation**

Create `packages/app-core/src/hooks/useMemoryMonitor.ts`:

```typescript
/**
 * Standalone memory leak detection — no React dependency.
 * Monitors `performance.memory.usedJSHeapSize` and fires `onLeak`
 * when the growth rate exceeds a threshold.
 */

interface MemoryLeakInfo {
  mbPerMinute: number;
  currentMb: number;
}

interface MemoryLeakDetectorOptions {
  intervalMs?: number;
  thresholdMbPerMin?: number;
  onLeak?: (info: MemoryLeakInfo) => void;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

const MIN_SAMPLES = 6;
const BYTES_PER_MB = 1024 * 1024;

export function startMemoryLeakDetector(
  options: MemoryLeakDetectorOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 5_000;
  const thresholdMbPerMin = options.thresholdMbPerMin ?? 10;
  const onLeak = options.onLeak;

  const memory = (
    globalThis.performance as typeof globalThis.performance & {
      memory?: PerformanceMemory;
    }
  )?.memory;

  if (!memory) {
    return () => {};
  }

  const samples: { time: number; bytes: number }[] = [];

  const id = setInterval(() => {
    const now = Date.now();
    const bytes = memory.usedJSHeapSize;
    samples.push({ time: now, bytes });

    if (samples.length < MIN_SAMPLES) return;

    const oldest = samples[0];
    const elapsedMin = (now - oldest.time) / 60_000;
    if (elapsedMin <= 0) return;

    const growthMb = (bytes - oldest.bytes) / BYTES_PER_MB;
    const mbPerMinute = growthMb / elapsedMin;

    if (mbPerMinute > thresholdMbPerMin) {
      onLeak?.({
        mbPerMinute,
        currentMb: bytes / BYTES_PER_MB,
      });
    }
  }, intervalMs);

  return () => clearInterval(id);
}
```

- [ ] **Step 2: Export from hooks/index.ts**

Add to `packages/app-core/src/hooks/index.ts`:

```typescript
export * from "./useMemoryMonitor";
```

- [ ] **Step 3: Run memory monitor tests**

Run: `bunx vitest run packages/app-core/test/app/memory-monitor.test.ts --reporter verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/hooks/useMemoryMonitor.ts packages/app-core/src/hooks/index.ts
git commit -m "feat: add startMemoryLeakDetector for runtime memory monitoring"
```

---

### Task 6: Fix cloud-preference-patch Tests (Vitest Config)

**Files:**
- Modify: `vitest.config.ts:196-206`

- [ ] **Step 1: Add apps/app/test/ to root vitest include**

In `vitest.config.ts`, add these patterns to the `include` array:

```typescript
      "apps/app/test/**/*.test.ts",
      "apps/app/test/**/*.test.tsx",
```

- [ ] **Step 2: Run the previously-invisible tests**

Run: `bunx vitest run apps/app/test/app/cloud-preference-patch.test.ts --reporter verbose`
Check the actual errors to determine if source or test needs fixing.

Run: `bunx vitest run apps/app/test/app/onboarding-step-resume.test.tsx --reporter verbose`
Check the actual errors.

- [ ] **Step 3: Fix cloud-preference-patch source if needed**

If the test expects `services: { inference: false }` but the code deletes keys instead, update `packages/app-core/src/platform/cloud-preference-patch.ts` lines 93-105. Replace the delete-based approach with setting keys to false:

```typescript
  const services = asRecord(nextCloud.services);
  if (services) {
    for (const key of ["inference", "tts", "media", "embeddings", "rpc"]) {
      if (key in services) {
        services[key] = false;
      }
    }
    nextCloud.services = services;
  }
```

- [ ] **Step 4: Run tests again**

Run: `bunx vitest run apps/app/test/app/cloud-preference-patch.test.ts --reporter verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts packages/app-core/src/platform/cloud-preference-patch.ts
git commit -m "fix: include apps/app/test in vitest config and fix cloud preference normalization"
```

---

### Task 7: Fix startup-bootstrap Test String Match

**Files:**
- Modify: `apps/app/electrobun/src/__tests__/startup-bootstrap.test.ts`

- [ ] **Step 1: Read the test and fix the string pattern**

The test looks for exact string `"preload = readResolvedPreloadScript(import.meta.dir);"` via `indexOf()`, but the source code has it inside a try-catch block. Update the test to search for just the function call:

```typescript
    const validateIndex = source.indexOf("readResolvedPreloadScript(import.meta.dir)");
    const browserWindowIndex = source.indexOf("new BrowserWindow(", validateIndex);
    expect(validateIndex).toBeGreaterThan(-1);
    expect(browserWindowIndex).toBeGreaterThan(validateIndex);
```

- [ ] **Step 2: Run the test**

Run: `bunx vitest run apps/app/electrobun/src/__tests__/startup-bootstrap.test.ts --reporter verbose`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/app/electrobun/src/__tests__/startup-bootstrap.test.ts
git commit -m "fix: relax startup-bootstrap test string pattern for try-catch wrapping"
```

---

### Task 8: Fix vector-browser Async Cleanup Test

**Files:**
- Modify: `packages/app-core/test/app/vector-browser.async-cleanup.test.tsx`

- [ ] **Step 1: Read the test and source to understand the mismatch**

Read `packages/app-core/test/app/vector-browser.async-cleanup.test.tsx` and `packages/app-core/src/components/pages/VectorBrowserView.tsx`. The test expects `createVectorBrowserRenderer` to be called on mount, but the component may have changed its initialization lifecycle.

Check if the mock setup matches the current component API. The test may need to:
- Wait longer for async initialization
- Trigger a different user action to start the renderer
- Update mock paths to match refactored imports

- [ ] **Step 2: Fix the test or source based on findings**

Update whichever is misaligned. If the component no longer auto-creates the renderer on mount, either:
- Add the behavior back if it's a regression
- Update the test to match the new lifecycle

- [ ] **Step 3: Run the test**

Run: `bunx vitest run packages/app-core/test/app/vector-browser.async-cleanup.test.tsx --reporter verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/test/app/vector-browser.async-cleanup.test.tsx
git commit -m "fix: align vector-browser cleanup test with current component lifecycle"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full check**

```bash
bun run check
```

Expected: Clean — no type errors, no lint errors.

- [ ] **Step 2: Run full test suite**

```bash
bun run test
```

Expected: Zero new failures. All previously-failing tests should now pass.

- [ ] **Step 3: Commit any remaining fixes**

If `bun run check` or `bun run test` surface issues from the changes, fix and commit.
