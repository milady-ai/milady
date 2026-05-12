// Polyfill entry. Side-effects only. Order matters: Buffer first (because
// other modules patch Uint8Array.prototype), then console, then node-modules
// registry, then fetch, then Bun. We verify the bridge before any of this.

import { getBridge, hasBridge } from "./bridge.js";
// Importing buffer registers the Uint8Array.prototype patches.
import "./modules/buffer.js";
import { installConsole } from "./console.js";
import { installGlobalFetch } from "./global-fetch.js";
import { installRequire, registrar } from "./node-modules.js";
import { installBun } from "./bun.js";
import { installSqlite } from "./modules/sqlite-install.js";
import process from "./modules/process.js";

const EXPECTED_VERSION = "v1";

function bootstrap(): void {
  if (!hasBridge()) {
    throw new Error(
      "[milady-polyfill] __MILADY_BRIDGE__ missing — Swift host must install it before evaluating the polyfill prefix.",
    );
  }
  const version = (globalThis as { __MILADY_BRIDGE_VERSION__?: string })
    .__MILADY_BRIDGE_VERSION__;
  const bridge = getBridge();
  if (version !== EXPECTED_VERSION || bridge.version !== EXPECTED_VERSION) {
    const actual = `${bridge.version}/${version ?? "unset"}`;
    throw new Error(
      `[milady-polyfill] bridge version mismatch — expected ${EXPECTED_VERSION}, got ${actual}`,
    );
  }

  // Install everything.
  installConsole();
  installRequire();
  installSqlite(registrar);
  installGlobalFetch();
  installBun();

  // Make `process` accessible globally (Node convention).
  (globalThis as unknown as { process: typeof process }).process = process;

  // Install a global setImmediate if absent.
  const g = globalThis as unknown as {
    setImmediate?: (cb: () => void) => unknown;
    clearImmediate?: (h: unknown) => void;
    queueMicrotask?: (cb: () => void) => void;
  };
  if (!g.setImmediate) g.setImmediate = (cb: () => void) => setTimeout(cb, 0);
  if (!g.clearImmediate)
    g.clearImmediate = (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>);
  if (!g.queueMicrotask) g.queueMicrotask = (cb: () => void) => Promise.resolve().then(cb);

  // Mark the polyfill as installed so other code can probe.
  (globalThis as unknown as { __MILADY_POLYFILL_INSTALLED__: string }).__MILADY_POLYFILL_INSTALLED__ = "v1";

  bridge.log("info", "[milady-polyfill] installed (v1)");
}

bootstrap();
