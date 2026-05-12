// Wires node:* imports to live modules. The bundler is expected to transform
// `import x from "node:fs"` and `import x from "fs"` into calls to
// __elizaRequire("node:fs"). This shim catalogs every supported spec.

import buffer, { Buffer } from "./modules/buffer.js";
import path from "./modules/path.js";
import os from "./modules/os.js";
import fs from "./modules/fs.js";
import crypto from "./modules/crypto.js";
import http from "./modules/http.js";
import https from "./modules/https.js";
import net from "./modules/net.js";
import events, { EventEmitter } from "./modules/events.js";
import stream from "./modules/stream.js";
import util from "./modules/util.js";
import url from "./modules/url.js";
import process from "./modules/process.js";
import sqlite from "./modules/sqlite.js";

const registry: Record<string, unknown> = {};

function register(spec: string, mod: unknown): void {
  registry[spec] = mod;
  // Also register without node: prefix when applicable
  if (spec.startsWith("node:")) {
    registry[spec.slice(5)] = mod;
  }
}

register("node:buffer", buffer);
register("node:path", path);
register("node:path/posix", path.posix);
register("node:path/win32", path.win32);
register("node:os", os);
register("node:fs", fs);
register("node:fs/promises", fs.promises);
register("node:crypto", crypto);
register("node:http", http);
register("node:https", https);
register("node:net", net);
register("node:events", events);
register("node:stream", stream);
register("node:stream/web", {
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
});
register("node:stream/promises", { pipeline: stream.pipeline, finished: stream.finished });
register("node:util", util);
register("node:util/types", util.types);
register("node:url", url);
register("node:querystring", {
  parse(str: string): Record<string, string> {
    const out: Record<string, string> = {};
    new URLSearchParams(str).forEach((v, k) => {
      out[k] = v;
    });
    return out;
  },
  stringify(obj: Record<string, string>): string {
    return new URLSearchParams(obj).toString();
  },
  escape: encodeURIComponent,
  unescape: decodeURIComponent,
});
register("node:process", process);
register("node:sqlite", sqlite);
register("better-sqlite3", sqlite);
register("node:assert", makeAssertModule());
register("node:perf_hooks", {
  performance: {
    now: () => Date.now(),
    timeOrigin: 0,
  },
});
register("node:timers", makeTimers());
register("node:timers/promises", makeTimersPromises());

function makeAssertModule(): unknown {
  function assert(value: unknown, message?: string | Error): void {
    if (!value) {
      if (message instanceof Error) throw message;
      throw new Error(message ?? "Assertion failed");
    }
  }
  return Object.assign(assert, {
    ok: assert,
    equal(a: unknown, b: unknown, message?: string): void {
      if (a != b) throw new Error(message ?? `equal: ${a} != ${b}`);
    },
    strictEqual(a: unknown, b: unknown, message?: string): void {
      if (a !== b) throw new Error(message ?? `strictEqual: ${a} !== ${b}`);
    },
    notEqual(a: unknown, b: unknown, message?: string): void {
      if (a == b) throw new Error(message ?? `notEqual: ${a} == ${b}`);
    },
    deepEqual(a: unknown, b: unknown, message?: string): void {
      if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(message ?? "deepEqual mismatch");
    },
    deepStrictEqual(a: unknown, b: unknown, message?: string): void {
      if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(message ?? "deepStrictEqual mismatch");
    },
    throws(fn: () => unknown, message?: string): void {
      try {
        fn();
      } catch {
        return;
      }
      throw new Error(message ?? "expected throw");
    },
    rejects(fn: () => Promise<unknown>, message?: string): Promise<void> {
      return fn().then(
        () => {
          throw new Error(message ?? "expected rejection");
        },
        () => {},
      );
    },
    fail(message?: string): never {
      throw new Error(message ?? "fail");
    },
    AssertionError: Error,
  });
}

function makeTimers(): unknown {
  return {
    setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeout: (h: ReturnType<typeof setTimeout>) => clearTimeout(h),
    setInterval: (cb: () => void, ms: number) => setInterval(cb, ms),
    clearInterval: (h: ReturnType<typeof setInterval>) => clearInterval(h),
    setImmediate: (cb: () => void) => setTimeout(cb, 0),
    clearImmediate: (h: ReturnType<typeof setTimeout>) => clearTimeout(h),
  };
}

function makeTimersPromises(): unknown {
  return {
    setTimeout: (ms: number, value?: unknown) =>
      new Promise((resolve) => setTimeout(() => resolve(value), ms)),
    setImmediate: (value?: unknown) =>
      new Promise((resolve) => setTimeout(() => resolve(value), 0)),
  };
}

export function installRequire(): void {
  const g = globalThis as unknown as {
    __elizaRequire?: (spec: string) => unknown;
    require?: (spec: string) => unknown;
    Buffer?: unknown;
    EventEmitter?: unknown;
    process?: unknown;
  };
  const elizaRequire = (spec: string): unknown => {
    if (spec in registry) return registry[spec];
    // Strip ./ etc fallback — bundler should have resolved.
    throw new Error(`Cannot find module '${spec}' in iOS JSC polyfill registry`);
  };
  g.__elizaRequire = elizaRequire;
  // Some legacy code expects globalThis.require.
  g.require = elizaRequire;
  // Install Buffer globally — Node behavior.
  g.Buffer = Buffer;
  g.EventEmitter = EventEmitter;
  g.process = process;
}

export { registry };

// Public registrar used by the sqlite-install side-channel.
export const registrar = {
  register(name: string, module: unknown): void {
    register(name, module);
  },
};
