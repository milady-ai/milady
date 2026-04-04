import Module from "node:module";
import { afterAll, afterEach, vi } from "vitest";
import {
  createMockStorage,
  hasStorageApi,
  installCanvasMocks,
  installMediaElementMocks,
  suppressReactTestConsoleErrors,
} from "./helpers/browser-mocks";

const REACT_RESOLVE_PATCH_MARK = Symbol.for("milady.test.reactResolvePatched");
const ANCHOR_CLICK_PATCH_MARK = Symbol.for("milady.test.anchorClickPatched");
const JSDOM_EMIT_PATCH_MARK = Symbol.for("milady.test.jsdomEmitPatched");

type ResolveFilename = (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown,
) => string;

// ── React deduplication ──────────────────────────────────────────────
// bun hoists react-test-renderer's peer react into a separate .bun/ path,
// creating two React instances that break hooks.  Intercept Node's CJS
// resolution so every `require("react")` returns the root copy.
// Wrapped in try/catch so CI environments without react don't crash.
try {
  const _require = Module.createRequire(import.meta.url);
  const rootReactDir = require("node:path").dirname(
    _require.resolve("react/package.json"),
  );

  const moduleInternals = Module as unknown as {
    _resolveFilename: ResolveFilename & {
      [REACT_RESOLVE_PATCH_MARK]?: boolean;
    };
  };
  if (!moduleInternals._resolveFilename[REACT_RESOLVE_PATCH_MARK]) {
    const origResolve = moduleInternals._resolveFilename;
    const patchedResolve = function patchedResolve(
      this: unknown,
      request: string,
      parent: unknown,
      isMain: boolean,
      options: unknown,
    ) {
      const resolved: string = origResolve.call(
        this,
        request,
        parent,
        isMain,
        options,
      );
      // Redirect any .bun/-hoisted react files to the root copy so
      // react-test-renderer and component code share one React instance.
      if (
        resolved.includes("node_modules/.bun/") &&
        resolved.includes("/node_modules/react/") &&
        !resolved.includes("react-dom") &&
        !resolved.includes("react-test-renderer")
      ) {
        // Extract the relative path within the react package
        const reactPkgIdx = resolved.lastIndexOf("/node_modules/react/");
        if (reactPkgIdx !== -1) {
          const relPath = resolved.slice(
            reactPkgIdx + "/node_modules/react/".length,
          );
          return require("node:path").join(rootReactDir, relPath);
        }
      }
      return resolved;
    } as typeof moduleInternals._resolveFilename;
    patchedResolve[REACT_RESOLVE_PATCH_MARK] = true;
    moduleInternals._resolveFilename = patchedResolve;
  }
} catch {
  // React not available — skip deduplication patch (e.g. CI without react)
}

process.env.VITEST = "true";
// Keep test output focused on failures; individual tests can override.
process.env.LOG_LEVEL ??= "error";
// Allow tests to run without a real database (uses InMemoryDatabaseAdapter).
process.env.ALLOW_NO_DATABASE ??= "true";

declare global {
  // React 18 testing flag to suppress act() environment warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

suppressReactTestConsoleErrors();

function ensureStorage(
  target: Record<string, unknown>,
  key: "localStorage" | "sessionStorage",
  fallback?: Storage,
): Storage {
  const existing = target[key];
  if (hasStorageApi(existing)) {
    return existing;
  }
  const storage = fallback ?? createMockStorage();
  Object.defineProperty(target, key, {
    value: storage,
    writable: true,
    configurable: true,
  });
  return storage;
}

const sharedLocalStorage = ensureStorage(
  globalThis as Record<string, unknown>,
  "localStorage",
);
const sharedSessionStorage = ensureStorage(
  globalThis as Record<string, unknown>,
  "sessionStorage",
);

installCanvasMocks();
installMediaElementMocks();

if (typeof globalThis.window !== "undefined") {
  const win = globalThis.window as unknown as Record<string, unknown>;
  ensureStorage(win, "localStorage", sharedLocalStorage);
  ensureStorage(win, "sessionStorage", sharedSessionStorage);
  // jsdom ships noisy "Not implemented" confirm/alert stubs. Replace them
  // eagerly so tests can override them without polluting stderr. Default to
  // "cancel" to preserve the old falsey fallback behavior in app flows.
  win.confirm = vi.fn().mockReturnValue(false);
  win.alert = vi.fn();

  // Programmatic download/external-link clicks should exercise handlers in
  // tests without asking jsdom to perform a full navigation.
  const anchorPrototype = globalThis.HTMLAnchorElement?.prototype as
    | ({
        click?: () => void;
        [ANCHOR_CLICK_PATCH_MARK]?: boolean;
      } & Record<string, unknown>)
    | undefined;
  const originalAnchorClick = anchorPrototype?.click;
  if (
    anchorPrototype &&
    typeof originalAnchorClick === "function" &&
    !anchorPrototype[ANCHOR_CLICK_PATCH_MARK]
  ) {
    Object.defineProperty(anchorPrototype, "click", {
      configurable: true,
      writable: true,
      value: function patchedAnchorClick(this: HTMLAnchorElement) {
        const href = this.getAttribute("href") ?? "";
        const target = this.getAttribute("target") ?? "";
        const shouldSuppressNavigation =
          this.hasAttribute("download") ||
          target === "_blank" ||
          /^(?:https?:|blob:|data:)/i.test(href);

        if (shouldSuppressNavigation) {
          this.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              composed: true,
            }),
          );
          return;
        }

        return originalAnchorClick.call(this);
      },
    });
    anchorPrototype[ANCHOR_CLICK_PATCH_MARK] = true;
  }

  const virtualConsole = (
    globalThis.window as typeof globalThis.window & {
      _virtualConsole?: {
        emit?: ((eventName: string, ...args: unknown[]) => unknown) & {
          [JSDOM_EMIT_PATCH_MARK]?: boolean;
        };
      };
    }
  )._virtualConsole;
  const originalEmit = virtualConsole?.emit;
  if (
    virtualConsole &&
    typeof originalEmit === "function" &&
    !originalEmit[JSDOM_EMIT_PATCH_MARK]
  ) {
    const patchedEmit = function patchedEmit(eventName, ...args) {
      const [firstArg] = args;
      if (
        eventName === "jsdomError" &&
        firstArg instanceof Error &&
        firstArg.message === "Not implemented: navigation to another Document"
      ) {
        return;
      }
      return originalEmit.call(this, eventName, ...args);
    } as typeof originalEmit;
    patchedEmit[JSDOM_EMIT_PATCH_MARK] = true;
    virtualConsole.emit = patchedEmit;
  }
}

import { withIsolatedTestHome } from "./test-env";

// ── Environment isolation ────────────────────────────────────────────
// Snapshot process.env at file level so that env mutations made by any test
// or beforeAll/afterAll hooks don't leak to the next test file when running
// in the same forked worker.
const fileEnvSnapshot = { ...process.env };

afterAll(() => {
  // Restore env to its state when this file started.
  for (const key of Object.keys(process.env)) {
    if (!(key in fileEnvSnapshot)) {
      delete process.env[key];
    } else if (process.env[key] !== fileEnvSnapshot[key]) {
      process.env[key] = fileEnvSnapshot[key];
    }
  }
  for (const key of Object.keys(fileEnvSnapshot)) {
    if (!(key in process.env)) {
      process.env[key] = fileEnvSnapshot[key];
    }
  }
});

const testEnv = withIsolatedTestHome();
afterAll(() => testEnv.cleanup());

afterAll(() => {
  // Some integration-style tests can leave chokidar/fs watchers open in workers,
  // which keeps Vitest from exiting cleanly on local runs.
  const getActiveHandles = (
    process as {
      _getActiveHandles?: () => unknown[];
    }
  )._getActiveHandles;
  const handles = getActiveHandles?.() ?? [];
  for (const handle of handles) {
    if (!handle || typeof handle !== "object") continue;
    const name = (handle as { constructor?: { name?: string } }).constructor
      ?.name;
    if (name !== "FSWatcher" && name !== "FSEvent" && name !== "StatWatcher") {
      continue;
    }
    try {
      (handle as { close?: () => void }).close?.();
    } catch {
      // Best-effort cleanup only.
    }
  }
});

afterEach(() => {
  // Guard against leaked fake timers across test files/workers.
  vi.useRealTimers();
  // Reset module mocks to prevent vi.mock() pollution across test files.
  vi.restoreAllMocks();
});
