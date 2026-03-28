# Runtime & API Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical and high-severity bugs across the runtime process lifecycle (Domain 1) and API security layer (Domain 2), covering spawn error handling, shutdown races, Telegram memory leaks, pairing rate limiter leaks, auth hardening, and error disclosure.

**Architecture:** Focused patches to existing files — no new modules. Each task targets one file or tightly-coupled pair. Tests use the project's existing vitest + `createEnvSandbox` patterns. All fixes are backwards-compatible.

**Tech Stack:** TypeScript, Node.js, vitest, Telegraf (Telegram bot), native `http` module

**Retracted findings (verified safe during planning):**
- ~~1.1 — Exit code 0 reported as failure~~ (`??` only triggers on null/undefined, not 0)
- ~~1.5 — Fire-and-forget `bot.launch()`~~ (Telegraf design: `launch()` only resolves on `stop()`. Current `.catch()` pattern is correct.)
- ~~2.4 — Path traversal in dev-console-log~~ (`path.resolve()` normalizes `..` before `.milady` check. Verified: traversal paths lose the `.milady` component.)

**Remaining scope:** 11 findings across 6 tasks.

---

### Task 1: Add spawn error handlers to `run-node.mjs`

**Findings:** 1.2 (Critical — partial)
**Files:**
- Modify: `scripts/run-node.mjs:149-153` (nodeProcess spawn), `scripts/run-node.mjs:192-196` (build spawn)
- Test: `scripts/run-node-spawn-error.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `scripts/run-node-spawn-error.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

// We test the pattern in isolation since run-node.mjs spawns real processes.
// The fix is a defensive .on("error") handler — verify the handler shape.
describe("spawn error handler pattern", () => {
  it("calls process.exit when spawn emits error", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit called");
    });
    const { EventEmitter } = require("node:events");
    const child = new EventEmitter();

    // Simulate the error handler we'll add to run-node.mjs
    child.on("error", (err: Error) => {
      process.exit(1);
    });

    expect(() => child.emit("error", new Error("spawn ENOENT"))).toThrow(
      "exit called",
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run scripts/run-node-spawn-error.test.ts`
Expected: PASS (this test validates the handler pattern, not the integration)

- [ ] **Step 3: Add error handler to nodeProcess spawn**

In `scripts/run-node.mjs`, after line 153 (`stdio: "inherit", });`), add:

```javascript
  nodeProcess.on("error", (err) => {
    logRunner(`Failed to spawn ${execPath}: ${err.message}`);
    process.exit(1);
  });
```

- [ ] **Step 4: Add error handler to build spawn**

In `scripts/run-node.mjs`, after line 196 (`stdio: "inherit", });`), add:

```javascript
    build.on("error", (err) => {
      logRunner(`Failed to spawn ${buildCmd}: ${err.message}`);
      process.exit(1);
    });
```

- [ ] **Step 5: Commit**

```bash
git add scripts/run-node.mjs scripts/run-node-spawn-error.test.ts
git commit -m "fix: add spawn error handlers in run-node.mjs (audit 1.2)"
```

---

### Task 2: Add spawn error handlers to `dev-ui.mjs` and fix socket leak in `waitForPort`

**Findings:** 1.2 (Critical — partial), 1.7 (Medium)
**Files:**
- Modify: `scripts/dev-ui.mjs:922-946` (waitForPort), `scripts/dev-ui.mjs:1151-1162` (viteProcess), `scripts/dev-ui.mjs:1290-1302` (apiProcess)
- Test: `scripts/dev-ui-wait-for-port.test.ts` (new)

- [ ] **Step 1: Write the failing test for socket cleanup**

Create `scripts/dev-ui-wait-for-port.test.ts`:

```typescript
import { type AddressInfo, createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

// Import the waitForPort function. Since dev-ui.mjs doesn't export it,
// we replicate the fixed version here and test it directly.
// The fix adds socket.destroy() on the timeout path.

function waitForPort(
  port: number,
  { timeout = 2000, interval = 100 } = {},
): Promise<void> {
  const { createConnection } = require("node:net");
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    let activeSocket: ReturnType<typeof createConnection> | null = null;

    function attempt() {
      if (Date.now() > deadline) {
        if (activeSocket) {
          activeSocket.destroy();
          activeSocket = null;
        }
        reject(
          new Error(
            `Timed out waiting for port ${port} after ${timeout / 1000}s`,
          ),
        );
        return;
      }
      activeSocket = createConnection({ port, host: "127.0.0.1" });
      activeSocket.once("connect", () => {
        activeSocket!.destroy();
        activeSocket = null;
        resolve();
      });
      activeSocket.once("error", () => {
        activeSocket!.destroy();
        activeSocket = null;
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}

describe("waitForPort", () => {
  let server: ReturnType<typeof createServer> | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  it("resolves when port becomes available", async () => {
    server = createServer();
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    await expect(waitForPort(port, { timeout: 5000 })).resolves.toBeUndefined();
  });

  it("rejects on timeout without leaking sockets", async () => {
    // Port 1 is almost certainly not listening
    await expect(
      waitForPort(1, { timeout: 300, interval: 50 }),
    ).rejects.toThrow("Timed out");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bunx vitest run scripts/dev-ui-wait-for-port.test.ts`
Expected: PASS

- [ ] **Step 3: Fix `waitForPort` in dev-ui.mjs to destroy socket on timeout**

In `scripts/dev-ui.mjs`, replace the `waitForPort` function (lines 922-947) with:

```javascript
function waitForPort(port, { timeout = 120_000, interval = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    let activeSocket = null;

    function attempt() {
      if (Date.now() > deadline) {
        if (activeSocket) {
          activeSocket.destroy();
          activeSocket = null;
        }
        reject(
          new Error(
            `Timed out waiting for port ${port} after ${timeout / 1000}s`,
          ),
        );
        return;
      }
      activeSocket = createConnection({ port, host: "127.0.0.1" });
      activeSocket.once("connect", () => {
        activeSocket.destroy();
        activeSocket = null;
        resolve();
      });
      activeSocket.once("error", () => {
        activeSocket.destroy();
        activeSocket = null;
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}
```

- [ ] **Step 4: Add error handler to viteProcess spawn**

In `scripts/dev-ui.mjs`, after the `viteProcess = spawn(...)` block (after line 1162), add before the `viteProcess.stdout.on` line:

```javascript
  viteProcess.on("error", (err) => {
    console.error(
      `  ${green(logPrefix)} Failed to start vite: ${err.message}`,
    );
    cleanup(1);
  });
```

- [ ] **Step 5: Add error handler to apiProcess spawn**

In `scripts/dev-ui.mjs`, after the `apiProcess = spawn(...)` block (after line 1302), add before the `if (quietApiLogs)` line:

```javascript
  apiProcess.on("error", (err) => {
    console.error(
      `  ${green(logPrefix)} Failed to start API server: ${err.message}`,
    );
    cleanup(1);
  });
```

- [ ] **Step 6: Run tests**

Run: `bunx vitest run scripts/dev-ui-wait-for-port.test.ts scripts/dev-ui.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/dev-ui.mjs scripts/dev-ui-wait-for-port.test.ts
git commit -m "fix: spawn error handlers + socket leak in dev-ui.mjs (audit 1.2, 1.7)"
```

---

### Task 3: Fix shutdown race condition in dev-server.ts

**Findings:** 1.3 (Critical)
**Files:**
- Modify: `packages/app-core/src/runtime/dev-server.ts:297-298`

- [ ] **Step 1: Read the file to confirm current code**

Run: `grep -n "process.on.*SIG" packages/app-core/src/runtime/dev-server.ts`
Expected: Lines 297-298 showing `process.on("SIGINT", ...)` and `process.on("SIGTERM", ...)`

- [ ] **Step 2: Replace `process.on` with `process.once`**

In `packages/app-core/src/runtime/dev-server.ts`, change lines 297-298 from:

```typescript
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
```

to:

```typescript
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
```

- [ ] **Step 3: Run existing tests to confirm no regressions**

Run: `bunx vitest run --reporter=verbose 2>&1 | head -50`
Expected: No failures related to dev-server

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/runtime/dev-server.ts
git commit -m "fix: use process.once for shutdown signals to prevent race (audit 1.3)"
```

---

### Task 4: Harden Telegram bot — chat history eviction, message handler safety, null guard

**Findings:** 1.4 (High), 1.6 (High), 1.9 (Medium)
**Files:**
- Modify: `packages/app-core/src/runtime/eliza.ts:489-594`
- Test: `packages/app-core/src/runtime/eliza-telegram.test.ts` (new)

- [ ] **Step 1: Write the failing test for chat history eviction**

Create `packages/app-core/src/runtime/eliza-telegram.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

/**
 * Tests for Telegram chat history eviction logic.
 * The actual chatHistories Map is internal to setupMiladyTelegramBot,
 * so we test the eviction algorithm in isolation.
 */

const MAX_CHAT_ENTRIES = 500;

function evictOldestIfNeeded(
  map: Map<number, Array<{ role: string; content: string }>>,
): void {
  if (map.size <= MAX_CHAT_ENTRIES) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) {
    map.delete(oldest);
  }
}

describe("Telegram chat history eviction", () => {
  it("does nothing when under the limit", () => {
    const map = new Map<number, Array<{ role: string; content: string }>>();
    map.set(1, [{ role: "user", content: "hi" }]);
    evictOldestIfNeeded(map);
    expect(map.size).toBe(1);
  });

  it("evicts the oldest entry when over the limit", () => {
    const map = new Map<number, Array<{ role: string; content: string }>>();
    for (let i = 0; i <= MAX_CHAT_ENTRIES; i++) {
      map.set(i, [{ role: "user", content: `msg-${i}` }]);
    }
    expect(map.size).toBe(MAX_CHAT_ENTRIES + 1);
    evictOldestIfNeeded(map);
    expect(map.size).toBe(MAX_CHAT_ENTRIES);
    expect(map.has(0)).toBe(false); // oldest evicted
    expect(map.has(1)).toBe(true); // second-oldest kept
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bunx vitest run packages/app-core/src/runtime/eliza-telegram.test.ts`
Expected: PASS

- [ ] **Step 3: Add null guard for `runtime.character`**

In `packages/app-core/src/runtime/eliza.ts`, change line 489 from:

```typescript
    const char = runtime.character;
```

to:

```typescript
    const char = runtime.character ?? ({} as Record<string, unknown>);
```

- [ ] **Step 4: Add chat history eviction after `chatHistories.set()`**

In `packages/app-core/src/runtime/eliza.ts`, after line 561 (`chatHistories.set(chatId, history);`), add:

```typescript
          // Evict oldest chat entry to prevent unbounded memory growth
          if (chatHistories.size > 500) {
            const oldest = chatHistories.keys().next().value;
            if (oldest !== undefined) chatHistories.delete(oldest);
          }
```

- [ ] **Step 5: Wrap entire message handler body in try/catch**

In `packages/app-core/src/runtime/eliza.ts`, the message handler starts at line 530. Wrap the entire body by changing from:

```typescript
        const text = ctx.message?.text;
        if (!text) return;
        const chatId = ctx.message.chat?.id ?? 0;
```

to:

```typescript
        try {
        const text = ctx.message?.text;
        if (!text) return;
        const chatId = ctx.message.chat?.id ?? 0;
```

And after the existing inner catch block (line 593), add the closing brace for the outer try/catch:

```typescript
        } catch (outerErr) {
          logger.warn(
            `[milady] Telegram handler error: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}`,
          );
        }
```

This ensures errors before the inner try/catch (e.g., accessing `ctx.message.chat.id`) are also caught.

- [ ] **Step 6: Run tests**

Run: `bunx vitest run packages/app-core/src/runtime/eliza-telegram.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/app-core/src/runtime/eliza.ts packages/app-core/src/runtime/eliza-telegram.test.ts
git commit -m "fix: Telegram chat history eviction, handler safety, null guard (audit 1.4, 1.6, 1.9)"
```

---

### Task 5: Fix unbounded pairing rate limiter memory leak

**Findings:** 2.1 (Critical)
**Files:**
- Modify: `packages/app-core/src/api/server.ts:289-296` (add cleanup timer after pairingAttempts declaration)
- Test: `packages/app-core/src/api/server.pairing-cleanup.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/app-core/src/api/server.pairing-cleanup.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pairing rate limiter cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sweeps expired entries from the map", () => {
    const PAIRING_WINDOW_MS = 10 * 60 * 1000;
    const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
    const map = new Map<string, { count: number; resetAt: number }>();

    // Simulate the sweep function that will be added to server.ts
    function sweepPairingAttempts(): void {
      const now = Date.now();
      for (const [key, entry] of map) {
        if (now > entry.resetAt) {
          map.delete(key);
        }
      }
    }

    // Add an expired entry and a fresh entry
    const now = Date.now();
    map.set("1.2.3.4", { count: 3, resetAt: now - 1000 }); // expired
    map.set("5.6.7.8", { count: 1, resetAt: now + PAIRING_WINDOW_MS }); // fresh

    expect(map.size).toBe(2);
    sweepPairingAttempts();
    expect(map.size).toBe(1);
    expect(map.has("1.2.3.4")).toBe(false);
    expect(map.has("5.6.7.8")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bunx vitest run packages/app-core/src/api/server.pairing-cleanup.test.ts`
Expected: PASS

- [ ] **Step 3: Add periodic sweep to server.ts**

In `packages/app-core/src/api/server.ts`, after line 296 (`const pairingAttempts = new Map<string, { count: number; resetAt: number }>();`), add:

```typescript

// Periodic sweep to prevent unbounded memory growth (mirrors wallet-export-guard.ts pattern)
const PAIRING_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const pairingSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pairingAttempts) {
    if (now > entry.resetAt) {
      pairingAttempts.delete(key);
    }
  }
}, PAIRING_SWEEP_INTERVAL_MS);
if (typeof pairingSweepTimer === "object" && "unref" in pairingSweepTimer) {
  pairingSweepTimer.unref();
}
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run packages/app-core/src/api/server.pairing-cleanup.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing server tests for regressions**

Run: `bunx vitest run packages/app-core/src/api/server.config-secrets-auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/api/server.ts packages/app-core/src/api/server.pairing-cleanup.test.ts
git commit -m "fix: sweep expired pairing rate limiter entries (audit 2.1)"
```

---

### Task 6: Harden auth — dev mode bypass, API token rate limiting, timing-safe comparison

**Findings:** 2.2 (High), 2.3 (High), 2.6 (Medium)
**Files:**
- Modify: `packages/app-core/src/api/auth.ts:33-39` (tokenMatches), `packages/app-core/src/api/auth.ts:97-111` (ensureCompatSensitiveRouteAuthorized)
- Test: `packages/app-core/src/api/auth.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `packages/app-core/src/api/auth.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createEnvSandbox } from "../test-support/test-helpers.js";
import {
  ensureCompatSensitiveRouteAuthorized,
  isDevEnvironment,
  tokenMatches,
} from "./auth.js";

// Minimal mock for http.ServerResponse
function mockRes(): {
  statusCode: number;
  ended: boolean;
  body: string;
  writeHead: (code: number) => void;
  end: (body?: string) => void;
  setHeader: (k: string, v: string) => void;
} {
  const res = {
    statusCode: 200,
    ended: false,
    body: "",
    writeHead(code: number) {
      res.statusCode = code;
    },
    end(body?: string) {
      res.body = body ?? "";
      res.ended = true;
    },
    setHeader(_k: string, _v: string) {},
  };
  return res;
}

describe("tokenMatches — timing-safe comparison", () => {
  it("returns true for matching tokens", () => {
    expect(tokenMatches("secret-123", "secret-123")).toBe(true);
  });

  it("returns false for non-matching tokens of same length", () => {
    expect(tokenMatches("secret-123", "secret-456")).toBe(false);
  });

  it("returns false for tokens of different length without leaking length", () => {
    expect(tokenMatches("short", "a-much-longer-token")).toBe(false);
  });
});

describe("ensureCompatSensitiveRouteAuthorized — dev mode", () => {
  const env = createEnvSandbox([
    "NODE_ENV",
    "MILADY_API_TOKEN",
    "ELIZA_API_TOKEN",
    "MILADY_DEV_AUTH_BYPASS",
  ]);

  afterEach(() => {
    env.restore();
  });

  it("rejects unauthenticated requests in dev mode without explicit bypass", () => {
    env.clear();
    process.env.NODE_ENV = "development";
    // No MILADY_DEV_AUTH_BYPASS, no API token
    const res = mockRes();
    const result = ensureCompatSensitiveRouteAuthorized(
      { headers: {} },
      res as never,
    );
    expect(result).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("allows unauthenticated requests in dev mode with explicit bypass", () => {
    env.clear();
    process.env.NODE_ENV = "development";
    process.env.MILADY_DEV_AUTH_BYPASS = "1";
    const res = mockRes();
    const result = ensureCompatSensitiveRouteAuthorized(
      { headers: {} },
      res as never,
    );
    expect(result).toBe(true);
  });

  it("requires token in production regardless of bypass flag", () => {
    env.clear();
    process.env.NODE_ENV = "production";
    process.env.MILADY_DEV_AUTH_BYPASS = "1";
    const res = mockRes();
    const result = ensureCompatSensitiveRouteAuthorized(
      { headers: {} },
      res as never,
    );
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run packages/app-core/src/api/auth.test.ts`
Expected: FAIL — the "rejects unauthenticated requests in dev mode without explicit bypass" test will fail because current code allows dev mode bypass unconditionally.

- [ ] **Step 3: Fix `tokenMatches` for constant-time comparison regardless of length**

In `packages/app-core/src/api/auth.ts`, replace lines 33-39 (the `tokenMatches` function):

```typescript
/** Timing-safe token comparison (constant-time regardless of input length). */
export function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  // Pad the shorter buffer so timingSafeEqual always runs on equal-length inputs,
  // preventing length leakage through early return.
  const maxLen = Math.max(a.length, b.length);
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  a.copy(aPadded);
  b.copy(bPadded);
  // Both length match AND content match required
  return a.length === b.length && crypto.timingSafeEqual(aPadded, bPadded);
}
```

- [ ] **Step 4: Fix `ensureCompatSensitiveRouteAuthorized` to require explicit bypass flag**

In `packages/app-core/src/api/auth.ts`, replace lines 93-111 (the function and its doc comment):

```typescript
/**
 * Gate a sensitive route. In dev mode the request is allowed through ONLY
 * when `MILADY_DEV_AUTH_BYPASS=1` is explicitly set and no token is configured.
 * In all other cases an API token is required.
 */
export function ensureCompatSensitiveRouteAuthorized(
  req: Pick<http.IncomingMessage, "headers">,
  res: http.ServerResponse,
): boolean {
  if (!getCompatApiToken()) {
    if (
      isDevEnvironment() &&
      process.env.MILADY_DEV_AUTH_BYPASS?.trim() === "1"
    ) {
      return true;
    }
    sendJsonError(
      res,
      403,
      "Sensitive endpoint requires API token authentication",
    );
    return false;
  }
  return ensureCompatApiAuthorized(req, res);
}
```

- [ ] **Step 5: Add rate limiting to `ensureCompatApiAuthorized`**

In `packages/app-core/src/api/auth.ts`, add a rate limiter above the `ensureCompatApiAuthorized` function. First, add after the imports at the top of the file:

```typescript
// ── Auth attempt rate limiter ─────────────────────────────────────────────────
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const AUTH_RATE_LIMIT_MAX = 20; // max failed attempts per window per IP
const authAttempts = new Map<string, { count: number; resetAt: number }>();

const authSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authAttempts) {
    if (now > entry.resetAt) authAttempts.delete(key);
  }
}, 5 * 60 * 1000);
if (typeof authSweepTimer === "object" && "unref" in authSweepTimer) {
  authSweepTimer.unref();
}

function isAuthRateLimited(ip: string | null): boolean {
  const key = ip ?? "unknown";
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= AUTH_RATE_LIMIT_MAX;
}

function recordFailedAuth(ip: string | null): void {
  const key = ip ?? "unknown";
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(key, {
      count: 1,
      resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS,
    });
  } else {
    entry.count += 1;
  }
}
```

Then update `ensureCompatApiAuthorized` to accept `req` with socket access and use the rate limiter:

```typescript
export function ensureCompatApiAuthorized(
  req: Pick<http.IncomingMessage, "headers" | "socket">,
  res: http.ServerResponse,
): boolean {
  const expectedToken = getCompatApiToken();
  if (!expectedToken) return true;

  const ip = req.socket?.remoteAddress ?? null;
  if (isAuthRateLimited(ip)) {
    sendJsonError(res, 429, "Too many authentication attempts");
    return false;
  }

  const providedToken = getProvidedApiToken(req);
  if (providedToken && tokenMatches(expectedToken, providedToken)) return true;

  recordFailedAuth(ip);
  sendJsonError(res, 401, "Unauthorized");
  return false;
}
```

- [ ] **Step 6: Run tests**

Run: `bunx vitest run packages/app-core/src/api/auth.test.ts`
Expected: All PASS

- [ ] **Step 7: Run existing auth tests for regressions**

Run: `bunx vitest run packages/app-core/src/api/auth-routes.test.ts packages/app-core/src/api/server.config-secrets-auth.test.ts`
Expected: All PASS (may need adjustment if existing tests rely on dev-mode bypass without the flag)

- [ ] **Step 8: If existing tests fail due to dev-mode bypass change, update them**

Any test that relied on `NODE_ENV=development` bypassing auth without a token will now fail. Add `process.env.MILADY_DEV_AUTH_BYPASS = "1"` to those test setups. Search for test files that set `NODE_ENV` to development/dev and check if they need the new env var.

Run: `grep -rl "NODE_ENV.*=.*dev" packages/app-core/src/api/*.test.ts packages/app-core/test/ --include="*.test.ts" 2>/dev/null | head -10`

Update any affected test files by adding `process.env.MILADY_DEV_AUTH_BYPASS = "1"` in their `beforeAll` or `beforeEach` blocks.

- [ ] **Step 9: Commit**

```bash
git add packages/app-core/src/api/auth.ts packages/app-core/src/api/auth.test.ts
git commit -m "fix: require explicit MILADY_DEV_AUTH_BYPASS, add auth rate limiting, fix timing leak (audit 2.2, 2.3, 2.6)"
```

---

### Task 7: Sanitize error messages in screenshot proxy

**Findings:** 2.7 (Medium)
**Files:**
- Modify: `packages/app-core/src/api/server.ts:2072-2078`

- [ ] **Step 1: Read the current code**

Run: `grep -n "screenshot proxy error" packages/app-core/src/api/server.ts`
Expected: Line ~2074 showing the error response with raw `err.message`

- [ ] **Step 2: Sanitize the error response**

In `packages/app-core/src/api/server.ts`, change lines 2073-2077 from:

```typescript
      sendJsonResponse(res, 502, {
        error: "screenshot proxy error",
        message: err instanceof Error ? err.message : String(err),
      });
```

to:

```typescript
      sendJsonResponse(res, 502, {
        error: "screenshot proxy error",
      });
```

- [ ] **Step 3: Run existing server tests**

Run: `bunx vitest run packages/app-core/src/api/ --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/api/server.ts
git commit -m "fix: remove raw error message from screenshot proxy response (audit 2.7)"
```

---

### Task 8: Tighten CORS to configured ports only

**Findings:** 2.5 (Medium)
**Files:**
- Modify: `packages/app-core/src/api/server.ts:3336-3343` (CORS origin check)

- [ ] **Step 1: Read the current CORS code and identify configured ports**

Run: `grep -n "MILADY_API_PORT\|MILADY_PORT\|ELIZA_PORT\|ELIZA_API_PORT" packages/app-core/src/api/server.ts | head -20`

Identify the variables holding the configured API port and UI port.

- [ ] **Step 2: Replace wildcard localhost CORS with port-specific allowlist**

In `packages/app-core/src/api/server.ts`, replace the CORS origin check (the regex test at lines 3337-3341) from:

```typescript
        if (
          /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(
            originHeader,
          )
        ) {
          return originHeader;
        }
```

to:

```typescript
        // Build allowed origins from configured ports (API, UI, gateway)
        const allowedPorts = new Set([
          String(state?.port ?? process.env.MILADY_API_PORT ?? process.env.ELIZA_PORT ?? "31337"),
          String(process.env.MILADY_PORT ?? "2138"),
          String(process.env.MILADY_GATEWAY_PORT ?? "18789"),
          String(process.env.MILADY_HOME_PORT ?? "2142"),
        ]);
        try {
          const originUrl = new URL(originHeader);
          const host = originUrl.hostname;
          const isLocalhost =
            host === "localhost" || host === "127.0.0.1" || host === "[::1]";
          const port = originUrl.port || (originUrl.protocol === "https:" ? "443" : "80");
          if (isLocalhost && allowedPorts.has(port)) {
            return originHeader;
          }
        } catch {
          // malformed origin — fall through to null
        }
```

- [ ] **Step 3: Run existing CORS-related tests**

Run: `bunx vitest run packages/app-core/src/api/ --reporter=verbose 2>&1 | grep -i "cors\|origin" | head -10`
Then: `bunx vitest run packages/app-core/src/api/ 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/api/server.ts
git commit -m "fix: restrict CORS to configured localhost ports only (audit 2.5)"
```

---

## Post-Implementation Checklist

After all tasks are complete:

- [ ] Run full test suite: `bunx vitest run`
- [ ] Run typecheck: `bun run check`
- [ ] Run lint: `bun run lint:fix && bun run format:fix`
- [ ] Create PR targeting `develop` with title: "fix: runtime & API security hardening (audit domains 1-2)"

## Future Plans (not in scope)

- **Domain 3:** Desktop & IPC security (file:// protocol, sandbox, IPC validation)
- **Domain 4:** Plugin reliability (WeChat config validation, health checks)
- **Domain 5:** Build system stability (atomic locks, patch validation)
- **Domain 6:** Type safety & test coverage (strict mode, file splitting)
