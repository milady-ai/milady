// node:net — raw TCP not exposed in bridge v1. Throw helpfully so callers know
// to use http/fetch instead.

import { EventEmitter } from "./events.js";

export class Socket extends EventEmitter {
  constructor() {
    super();
    throw new Error(
      "net.Socket / net.connect is not available on iOS JSC (bridge v1 has no TCP-client primitives). Use fetch() / http.request() instead.",
    );
  }
}

export class Server extends EventEmitter {
  constructor() {
    super();
    throw new Error(
      "net.createServer is not available on iOS JSC. Use http.createServer() / Bun.serve() for loopback HTTP.",
    );
  }
}

export function connect(..._args: unknown[]): never {
  throw new Error(
    "net.connect is not available on iOS JSC. Use fetch() / http.request().",
  );
}

export function createConnection(..._args: unknown[]): never {
  throw new Error("net.createConnection is not available on iOS JSC.");
}

export function createServer(..._args: unknown[]): never {
  throw new Error(
    "net.createServer is not available on iOS JSC. Use http.createServer() / Bun.serve().",
  );
}

export function isIP(input: string): 0 | 4 | 6 {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(input)) return 4;
  if (/^[0-9a-fA-F:]+$/.test(input) && input.includes(":")) return 6;
  return 0;
}

export function isIPv4(input: string): boolean {
  return isIP(input) === 4;
}

export function isIPv6(input: string): boolean {
  return isIP(input) === 6;
}

export default {
  Socket,
  Server,
  connect,
  createConnection,
  createServer,
  isIP,
  isIPv4,
  isIPv6,
};
