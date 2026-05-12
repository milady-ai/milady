// process polyfill. Installed on globalThis. Backed by bridge.

import { getBridge } from "../bridge.js";
import { EventEmitter } from "./events.js";

function makeEnvProxy(): Record<string, string | undefined> {
  return new Proxy({} as Record<string, string | undefined>, {
    get(_t, key: string | symbol) {
      if (typeof key !== "string") return undefined;
      return getBridge().env_get(key);
    },
    set(_t, key: string | symbol, value: unknown): boolean {
      if (typeof key !== "string") return false;
      getBridge().env_set(key, String(value));
      return true;
    },
    has(_t, key: string | symbol): boolean {
      if (typeof key !== "string") return false;
      return getBridge().env_get(key) !== undefined;
    },
    deleteProperty(_t, key: string | symbol): boolean {
      if (typeof key !== "string") return false;
      getBridge().env_set(key, "");
      return true;
    },
    ownKeys(): string[] {
      return getBridge().env_keys();
    },
    getOwnPropertyDescriptor(_t, key: string | symbol) {
      if (typeof key !== "string") return undefined;
      const v = getBridge().env_get(key);
      if (v === undefined) return undefined;
      return { value: v, enumerable: true, configurable: true, writable: true };
    },
  });
}

class ProcessEmitter extends EventEmitter {}

export interface ProcessLike {
  env: Record<string, string | undefined>;
  argv: string[];
  argv0: string;
  execPath: string;
  cwd: () => string;
  chdir: (dir: string) => void;
  platform: string;
  arch: string;
  pid: number;
  ppid: number;
  version: string;
  versions: Record<string, string>;
  exit: (code?: number) => void;
  hrtime: ((time?: [number, number]) => [number, number]) & { bigint: () => bigint };
  nextTick: (cb: (...args: unknown[]) => void, ...args: unknown[]) => void;
  stdout: { write: (data: string | Uint8Array) => boolean; isTTY?: boolean };
  stderr: { write: (data: string | Uint8Array) => boolean; isTTY?: boolean };
  stdin: { on: (event: string, listener: (...a: unknown[]) => void) => void };
  on: (event: string, listener: (...a: unknown[]) => void) => ProcessLike;
  off: (event: string, listener: (...a: unknown[]) => void) => ProcessLike;
  once: (event: string, listener: (...a: unknown[]) => void) => ProcessLike;
  emit: (event: string, ...args: unknown[]) => boolean;
  removeListener: (event: string, listener: (...a: unknown[]) => void) => ProcessLike;
  removeAllListeners: (event?: string) => ProcessLike;
  emitWarning: (warning: string | Error) => void;
  getuid?: () => number;
  getgid?: () => number;
  umask?: () => number;
  uptime: () => number;
  memoryUsage: () => { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number };
}

const emitter = new ProcessEmitter();
let cwd: string = "";

function getCwd(): string {
  if (!cwd) cwd = getBridge().paths_documents();
  return cwd;
}

function bridgeNs(): bigint {
  // bridge.now_ns returns a number; widen carefully. JSC Number is double, so
  // we accept the precision loss (real iOS clocks fit in 2^53 ns for ~104
  // days of uptime, plus this is monotonic-since-boot anyway).
  return BigInt(Math.floor(getBridge().now_ns()));
}

const hrtimeFn = ((time?: [number, number]): [number, number] => {
  const ns = bridgeNs();
  const sec = Number(ns / 1_000_000_000n);
  const nano = Number(ns % 1_000_000_000n);
  if (!time) return [sec, nano];
  let diffSec = sec - time[0];
  let diffNano = nano - time[1];
  if (diffNano < 0) {
    diffSec -= 1;
    diffNano += 1_000_000_000;
  }
  return [diffSec, diffNano];
}) as ProcessLike["hrtime"];

hrtimeFn.bigint = () => bridgeNs();

export const proc: ProcessLike = {
  env: makeEnvProxy(),
  argv: getBridge().argv(),
  argv0: "bun",
  execPath: "bun",
  cwd: getCwd,
  chdir(dir: string): void {
    cwd = dir;
  },
  platform: "ios",
  arch: "arm64",
  pid: 1,
  ppid: 0,
  version: "v20.0.0",
  versions: {
    node: "20.0.0",
    bun: "1.1.0-ios",
    v8: "0.0.0",
    jsc: "1",
  },
  exit(code = 0): void {
    emitter.emit("exit", code);
    emitter.emit("beforeExit", code);
    getBridge().exit(code);
  },
  hrtime: hrtimeFn,
  nextTick(cb, ...args) {
    Promise.resolve().then(() => cb(...args));
  },
  stdout: {
    write(data) {
      const s = typeof data === "string" ? data : new TextDecoder().decode(data);
      getBridge().log("info", s.replace(/\n$/, ""));
      return true;
    },
    isTTY: false,
  },
  stderr: {
    write(data) {
      const s = typeof data === "string" ? data : new TextDecoder().decode(data);
      getBridge().log("error", s.replace(/\n$/, ""));
      return true;
    },
    isTTY: false,
  },
  stdin: {
    on(_event, _listener) {
      // No stdin on iOS.
    },
  },
  on(event, listener) {
    emitter.on(event, listener);
    return proc;
  },
  off(event, listener) {
    emitter.off(event, listener);
    return proc;
  },
  once(event, listener) {
    emitter.once(event, listener);
    return proc;
  },
  emit(event, ...args) {
    return emitter.emit(event, ...args);
  },
  removeListener(event, listener) {
    emitter.removeListener(event, listener);
    return proc;
  },
  removeAllListeners(event) {
    emitter.removeAllListeners(event);
    return proc;
  },
  emitWarning(warning) {
    const msg = warning instanceof Error ? (warning.stack ?? warning.message) : String(warning);
    getBridge().log("warn", msg);
  },
  uptime: () => Number(bridgeNs() / 1_000_000_000n),
  memoryUsage: () => {
    const info = getBridge().llama_hardware_info();
    const used = (info.total_ram_gb - info.available_ram_gb) * 1e9;
    return {
      rss: used,
      heapTotal: used / 2,
      heapUsed: used / 4,
      external: 0,
      arrayBuffers: 0,
    };
  },
};

export default proc;
