// Override console.* to route through bridge.log so logs land in os_log.

import { getBridge } from "./bridge.js";
import { format } from "./modules/util.js";

export function installConsole(): void {
  const bridge = getBridge();
  const make =
    (level: "debug" | "info" | "warn" | "error") =>
    (...args: unknown[]): void => {
      try {
        bridge.log(level, format(...args));
      } catch {
        // never throw out of console
      }
    };

  const c = {
    log: make("info"),
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    debug: make("debug"),
    trace: (...args: unknown[]) => {
      const err = new Error(format(...args));
      bridge.log("debug", err.stack ?? err.message);
    },
    dir: (obj: unknown) => bridge.log("info", format(obj)),
    table: (data: unknown) => bridge.log("info", format(data)),
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    time: (label: string) => {
      timers.set(label, bridge.now_ns());
    },
    timeEnd: (label: string) => {
      const start = timers.get(label);
      if (start === undefined) return;
      timers.delete(label);
      const ms = (bridge.now_ns() - start) / 1e6;
      bridge.log("info", `${label}: ${ms.toFixed(3)}ms`);
    },
    timeLog: (label: string, ...args: unknown[]) => {
      const start = timers.get(label);
      if (start === undefined) return;
      const ms = (bridge.now_ns() - start) / 1e6;
      bridge.log("info", `${label}: ${ms.toFixed(3)}ms ` + format(...args));
    },
    count: () => {},
    countReset: () => {},
    assert: (cond: unknown, ...args: unknown[]) => {
      if (!cond) bridge.log("error", "Assertion failed: " + format(...args));
    },
    clear: () => {},
  };

  const timers = new Map<string, number>();

  // Replace properties on the existing console rather than replacing the
  // console binding (which JSC may have non-configurable in some modes).
  const target = (globalThis as unknown as { console: Record<string, unknown> }).console;
  for (const key of Object.keys(c)) {
    target[key] = (c as Record<string, unknown>)[key];
  }
}
