// node:http — request/get backed by bridge.http_fetch, createServer backed by
// bridge.http_serve_*.

import { getBridge } from "../bridge.js";
import { EventEmitter } from "./events.js";
import { Readable, Writable } from "./stream.js";
import { utf8ToBytes, bytesToUtf8 } from "../encoding.js";

// ── Client ──────────────────────────────────────────────────────────────

export interface RequestOptions {
  protocol?: string;
  host?: string;
  hostname?: string;
  port?: number | string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class IncomingMessage extends Readable {
  statusCode: number = 0;
  statusMessage: string = "";
  headers: Record<string, string> = {};
  url: string = "";
  method: string = "GET";
  httpVersion: string = "1.1";
  rawHeaders: string[] = [];

  constructor(opts: { read?: (this: Readable, size: number) => void } = {}) {
    super(opts);
  }
}

export class ClientRequest extends Writable {
  private _bodyChunks: Uint8Array[] = [];
  private _opts: { url: string; method: string; headers: Record<string, string>; timeout?: number };
  private _started = false;

  constructor(
    opts: RequestOptions | string | URL,
    private _cb?: (res: IncomingMessage) => void,
  ) {
    super({
      write: (chunk, _enc, cb) => {
        if (typeof chunk === "string") this._bodyChunks.push(utf8ToBytes(chunk));
        else if (chunk instanceof Uint8Array) this._bodyChunks.push(chunk);
        cb();
      },
      final: (cb) => {
        this._dispatch().then(() => cb(), (err) => cb(err as Error));
      },
    });
    const normalized = normalizeRequestOptions(opts);
    this._opts = normalized;
  }

  setHeader(name: string, value: string): void {
    this._opts.headers[name] = value;
  }
  getHeader(name: string): string | undefined {
    return this._opts.headers[name];
  }
  removeHeader(name: string): void {
    delete this._opts.headers[name];
  }

  private async _dispatch(): Promise<void> {
    if (this._started) return;
    this._started = true;
    let body: Uint8Array | undefined;
    if (this._bodyChunks.length > 0) {
      let total = 0;
      for (const c of this._bodyChunks) total += c.length;
      body = new Uint8Array(total);
      let off = 0;
      for (const c of this._bodyChunks) {
        body.set(c, off);
        off += c.length;
      }
    }
    try {
      const result = await getBridge().http_fetch({
        url: this._opts.url,
        method: this._opts.method,
        headers: this._opts.headers,
        body,
        timeout_ms: this._opts.timeout,
      });
      if (result.error) {
        this.emit("error", new Error(result.error));
        return;
      }
      const res = new IncomingMessage();
      res.statusCode = result.status;
      res.statusMessage = statusText(result.status);
      res.headers = result.headers;
      res.url = this._opts.url;
      res.method = this._opts.method;
      // Build rawHeaders
      const raw: string[] = [];
      for (const k of Object.keys(result.headers)) {
        raw.push(k, result.headers[k]!);
      }
      res.rawHeaders = raw;
      this.emit("response", res);
      if (this._cb) this._cb(res);
      // Push the body and end. Async to give the listener time to attach.
      Promise.resolve().then(() => {
        res.push(result.body);
        res.push(null);
      });
    } catch (err) {
      this.emit("error", err as Error);
    }
  }

  abort(): void {
    this.emit("abort");
  }
}

function normalizeRequestOptions(
  opts: RequestOptions | string | URL,
): { url: string; method: string; headers: Record<string, string>; timeout?: number } {
  if (typeof opts === "string") {
    return { url: opts, method: "GET", headers: {} };
  }
  if (opts instanceof URL) {
    return { url: opts.toString(), method: "GET", headers: {} };
  }
  const protocol = opts.protocol ?? "http:";
  const host = opts.hostname ?? opts.host ?? "localhost";
  const port = opts.port ? `:${opts.port}` : "";
  const path = opts.path ?? "/";
  const url = `${protocol}//${host}${port}${path}`;
  return {
    url,
    method: opts.method ?? "GET",
    headers: { ...(opts.headers ?? {}) },
    timeout: opts.timeout,
  };
}

function statusText(code: number): string {
  const map: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };
  return map[code] ?? "";
}

export function request(
  optsOrUrl: RequestOptions | string | URL,
  optsOrCb?: RequestOptions | ((res: IncomingMessage) => void),
  cb?: (res: IncomingMessage) => void,
): ClientRequest {
  let opts: RequestOptions | string | URL = optsOrUrl;
  let callback: ((res: IncomingMessage) => void) | undefined;
  if (typeof optsOrCb === "function") callback = optsOrCb;
  else if (optsOrCb && typeof optsOrCb === "object") {
    if (typeof optsOrUrl === "string" || optsOrUrl instanceof URL) {
      const base = normalizeRequestOptions(optsOrUrl);
      opts = { ...optsOrCb, ...base } as RequestOptions;
      const merged: RequestOptions = {
        ...optsOrCb,
        protocol: undefined,
        host: undefined,
        hostname: undefined,
        port: undefined,
        path: undefined,
      };
      Object.assign(merged, optsOrCb);
      // Just use base URL.
      opts = optsOrCb;
      (opts as RequestOptions & { _url?: string })._url = base.url;
    } else {
      opts = { ...optsOrUrl, ...optsOrCb };
    }
    callback = cb;
  }
  return new ClientRequest(opts, callback);
}

export function get(
  optsOrUrl: RequestOptions | string | URL,
  optsOrCb?: RequestOptions | ((res: IncomingMessage) => void),
  cb?: (res: IncomingMessage) => void,
): ClientRequest {
  const req = request(optsOrUrl, optsOrCb, cb);
  req.end();
  return req;
}

// ── Server ──────────────────────────────────────────────────────────────

let _serverTokenSeq = 0;

export class ServerResponse extends Writable {
  statusCode = 200;
  statusMessage = "";
  private _headers: Record<string, string> = {};
  private _bodyChunks: Uint8Array[] = [];
  private _responseSent = false;
  private _resolver?: (r: { status: number; headers: Record<string, string>; body: Uint8Array }) => void;

  constructor() {
    super({
      write: (chunk, _enc, cb) => {
        if (typeof chunk === "string") this._bodyChunks.push(utf8ToBytes(chunk));
        else if (chunk instanceof Uint8Array) this._bodyChunks.push(chunk);
        cb();
      },
      final: (cb) => {
        this._finalize();
        cb();
      },
    });
  }

  _setResolver(fn: (r: { status: number; headers: Record<string, string>; body: Uint8Array }) => void): void {
    this._resolver = fn;
  }

  setHeader(name: string, value: string | string[]): void {
    this._headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  getHeader(name: string): string | undefined {
    return this._headers[name.toLowerCase()];
  }
  removeHeader(name: string): void {
    delete this._headers[name.toLowerCase()];
  }
  writeHead(status: number, headersOrMessage?: string | Record<string, string>, maybeHeaders?: Record<string, string>): this {
    this.statusCode = status;
    if (typeof headersOrMessage === "string") {
      this.statusMessage = headersOrMessage;
      if (maybeHeaders) for (const k of Object.keys(maybeHeaders)) this.setHeader(k, maybeHeaders[k]!);
    } else if (headersOrMessage) {
      for (const k of Object.keys(headersOrMessage)) this.setHeader(k, headersOrMessage[k]!);
    }
    return this;
  }

  private _finalize(): void {
    if (this._responseSent) return;
    this._responseSent = true;
    let total = 0;
    for (const c of this._bodyChunks) total += c.length;
    const body = new Uint8Array(total);
    let off = 0;
    for (const c of this._bodyChunks) {
      body.set(c, off);
      off += c.length;
    }
    this._resolver?.({ status: this.statusCode, headers: this._headers, body });
  }
}

export class Server extends EventEmitter {
  private _token: string;
  private _listening = false;

  constructor(private _requestHandler?: (req: IncomingMessage, res: ServerResponse) => void) {
    super();
    this._token = `node-http-${++_serverTokenSeq}`;
  }

  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    super.on(event, listener);
    if (event === "request" && !this._requestHandler) {
      this._requestHandler = listener as unknown as (req: IncomingMessage, res: ServerResponse) => void;
    }
    return this;
  }

  listen(port: number, hostnameOrCb?: string | (() => void), cb?: () => void): this {
    const callback = typeof hostnameOrCb === "function" ? hostnameOrCb : cb;
    getBridge().http_serve_register_handler(this._token, async (req) => {
      return new Promise((resolve) => {
        const im = new IncomingMessage();
        im.method = req.method;
        im.url = req.url;
        im.headers = req.headers;
        im.rawHeaders = Object.keys(req.headers).flatMap((k) => [k, req.headers[k]!]);
        const res = new ServerResponse();
        res._setResolver((r) => resolve(r));
        // Push request body
        Promise.resolve().then(() => {
          im.push(req.body);
          im.push(null);
        });
        this.emit("request", im, res);
        if (this._requestHandler) this._requestHandler(im, res);
      });
    });
    const result = getBridge().http_serve_start({ port, handler_token: this._token });
    if (!result.ok) {
      this.emit("error", new Error(result.error ?? "http server failed to start"));
      return this;
    }
    this._listening = true;
    this.emit("listening");
    if (callback) callback();
    return this;
  }

  close(cb?: (err?: Error) => void): this {
    if (this._listening) {
      getBridge().http_serve_stop(this._token);
      this._listening = false;
      this.emit("close");
    }
    if (cb) cb();
    return this;
  }

  address(): { port: number; family: string; address: string } | null {
    if (!this._listening) return null;
    return { port: 0, family: "IPv4", address: "127.0.0.1" };
  }
}

export function createServer(
  optsOrHandler?: { IncomingMessage?: unknown; ServerResponse?: unknown } | ((req: IncomingMessage, res: ServerResponse) => void),
  maybeHandler?: (req: IncomingMessage, res: ServerResponse) => void,
): Server {
  const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
  return new Server(handler);
}

// ── Agents (no-op shells) ───────────────────────────────────────────────

export class Agent {
  maxSockets = Infinity;
  maxFreeSockets = 256;
  keepAlive = true;
  constructor(_opts?: unknown) {}
  destroy(): void {
    // no-op
  }
}

export const globalAgent = new Agent();

export const METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "PATCH",
  "TRACE",
  "CONNECT",
];

export const STATUS_CODES: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
};

export default {
  request,
  get,
  createServer,
  Server,
  ServerResponse,
  IncomingMessage,
  ClientRequest,
  Agent,
  globalAgent,
  METHODS,
  STATUS_CODES,
};

// Re-export the utility function so https.ts can use it.
export { bytesToUtf8 };
