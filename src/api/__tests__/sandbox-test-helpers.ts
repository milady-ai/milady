/**
 * Shared helpers for sandbox route tests.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { vi } from "vitest";

export function createMockReq(method: string, body?: string): IncomingMessage {
  const req = {
    method,
    headers: {},
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "data" && body) {
        handler(Buffer.from(body));
      }
      if (event === "end") {
        handler();
      }
      return req;
    }),
    destroy: vi.fn(),
  } as unknown as IncomingMessage;
  return req;
}

export function createMockRes(): ServerResponse & {
  _status: number;
  _body: string;
} {
  return {
    _status: 0,
    _body: "",
    writeHead: vi.fn(function (this: { _status: number }, status: number) {
      this._status = status;
    }),
    end: vi.fn(function (this: { _body: string }, data?: string) {
      this._body = data ?? "";
    }),
  } as unknown as ServerResponse & { _status: number; _body: string };
}
