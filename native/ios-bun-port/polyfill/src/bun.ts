// globalThis.Bun — common subset that real Bun apps use:
// Bun.serve, Bun.file, Bun.write, Bun.env, Bun.argv, Bun.version, Bun.sleep,
// Bun.hash, Bun.deepEquals, Bun.gc (no-op), Bun.nanoseconds.

import { getBridge } from "./bridge.js";
import { utf8ToBytes, bytesToUtf8 } from "./encoding.js";

interface ServeOptions {
  port?: number;
  hostname?: string;
  fetch: (req: Request) => Response | Promise<Response>;
  error?: (err: Error) => Response | Promise<Response>;
}

interface BunServer {
  port: number;
  hostname: string;
  stop(closeActiveConnections?: boolean): void;
  reload(opts: ServeOptions): void;
  url: URL;
}

let _bunServerTokenSeq = 0;

function serve(opts: ServeOptions): BunServer {
  const port = opts.port ?? 0;
  const hostname = opts.hostname ?? "127.0.0.1";
  const token = `bun-serve-${++_bunServerTokenSeq}`;

  let currentHandler: ServeOptions["fetch"] = opts.fetch;
  let currentError: ServeOptions["error"] = opts.error;

  getBridge().http_serve_register_handler(token, async (req) => {
    try {
      const url = req.url.startsWith("http")
        ? req.url
        : `http://${hostname}:${port}${req.url}`;
      const init: RequestInit = {
        method: req.method,
        headers: req.headers,
      };
      if (req.body && req.body.length > 0) {
        (init as { body?: unknown }).body = req.body;
      }
      const reqObj = new Request(url, init);
      const res = await currentHandler(reqObj);
      const bodyBytes = new Uint8Array(await res.arrayBuffer());
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: res.status, headers, body: bodyBytes };
    } catch (err) {
      if (currentError) {
        const res = await currentError(err as Error);
        const bodyBytes = new Uint8Array(await res.arrayBuffer());
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return { status: res.status, headers, body: bodyBytes };
      }
      return {
        status: 500,
        headers: { "content-type": "text/plain" },
        body: utf8ToBytes((err as Error).message ?? "Internal Server Error"),
      };
    }
  });

  const result = getBridge().http_serve_start({ port, handler_token: token });
  if (!result.ok) {
    throw new Error(result.error ?? "Bun.serve: failed to start");
  }

  return {
    port: result.port,
    hostname,
    stop(_closeActiveConnections?: boolean) {
      getBridge().http_serve_stop(token);
    },
    reload(next: ServeOptions) {
      currentHandler = next.fetch;
      currentError = next.error;
    },
    url: new URL(`http://${hostname}:${result.port}/`),
  };
}

interface BunFile {
  readonly name?: string;
  readonly size: number;
  readonly type: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  bytes(): Promise<Uint8Array>;
  exists(): Promise<boolean>;
  stream(): ReadableStream<Uint8Array>;
  writer(): { write(data: string | Uint8Array): void; end(): void; flush(): Promise<void> };
}

function bunFile(path: string): BunFile {
  let stat: { size: number; is_file: boolean } | null = null;
  function ensureStat(): void {
    if (stat === null) stat = getBridge().fs_stat(path);
  }
  return {
    name: path,
    get size(): number {
      ensureStat();
      return stat?.size ?? 0;
    },
    type: guessType(path),
    async text(): Promise<string> {
      const v = getBridge().fs_read_text(path, "utf8");
      if (v === null) throw new Error(`ENOENT '${path}'`);
      return v;
    },
    async json(): Promise<unknown> {
      return JSON.parse(await this.text());
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      const bytes = getBridge().fs_read_bytes(path);
      if (bytes === null) throw new Error(`ENOENT '${path}'`);
      const ab = new ArrayBuffer(bytes.length);
      new Uint8Array(ab).set(bytes);
      return ab;
    },
    async bytes(): Promise<Uint8Array> {
      const bytes = getBridge().fs_read_bytes(path);
      if (bytes === null) throw new Error(`ENOENT '${path}'`);
      return bytes;
    },
    async exists(): Promise<boolean> {
      return getBridge().fs_exists(path);
    },
    stream(): ReadableStream<Uint8Array> {
      // Whole-file ReadableStream — bridge v1 doesn't do chunked file reads.
      const bytes = getBridge().fs_read_bytes(path);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          if (bytes === null) controller.error(new Error(`ENOENT '${path}'`));
          else {
            controller.enqueue(bytes);
            controller.close();
          }
        },
      });
    },
    writer() {
      const chunks: Uint8Array[] = [];
      return {
        write(data: string | Uint8Array): void {
          if (typeof data === "string") chunks.push(utf8ToBytes(data));
          else chunks.push(data);
        },
        end(): void {
          this.flush();
        },
        async flush(): Promise<void> {
          let total = 0;
          for (const c of chunks) total += c.length;
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            merged.set(c, off);
            off += c.length;
          }
          chunks.length = 0;
          if (!getBridge().fs_write_bytes(path, merged)) {
            throw new Error(`EIO writing ${path}`);
          }
        },
      };
    },
  };
}

function guessType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "json":
      return "application/json";
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
    case "mjs":
      return "text/javascript";
    case "ts":
      return "text/typescript";
    case "txt":
    case "md":
      return "text/plain";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

async function bunWrite(
  path: string | BunFile,
  data: string | Uint8Array | ArrayBuffer | Blob | BunFile,
): Promise<number> {
  const dest = typeof path === "string" ? path : path.name ?? "";
  if (!dest) throw new TypeError("Bun.write: destination required");
  let bytes: Uint8Array;
  if (typeof data === "string") {
    if (!getBridge().fs_write_text(dest, data)) {
      throw new Error(`Bun.write: EIO writing '${dest}'`);
    }
    return utf8ToBytes(data).length;
  }
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (typeof (data as Blob).arrayBuffer === "function") {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else if (data && typeof (data as BunFile).bytes === "function") {
    bytes = await (data as BunFile).bytes();
  } else {
    throw new TypeError("Bun.write: unsupported data");
  }
  if (!getBridge().fs_write_bytes(dest, bytes)) {
    throw new Error(`Bun.write: EIO writing '${dest}'`);
  }
  return bytes.length;
}

function makeBunEnv(): Record<string, string | undefined> {
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

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEquals(a[i], (b as unknown[])[i])) return false;
    return true;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEquals((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

export function installBun(): void {
  const Bun = {
    version: "1.1.0-ios-jsc",
    revision: "ios-bridge-v1",
    serve,
    file: bunFile,
    write: bunWrite,
    env: makeBunEnv(),
    argv: getBridge().argv(),
    main: getBridge().argv()[1] ?? "",
    gc(_force?: boolean): void {
      // No exposed GC in JSC; rely on the JIT.
    },
    sleep(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    sleepSync(_ms: number): never {
      throw new Error("Bun.sleepSync is not implementable in JSC without blocking the runloop");
    },
    nanoseconds(): number {
      return getBridge().now_ns();
    },
    hash(input: string | Uint8Array, _seed = 0): number {
      // Quick fnv1a-32 — Bun uses Wyhash but we just need stable hashing.
      const bytes = typeof input === "string" ? utf8ToBytes(input) : input;
      let h = 2166136261;
      for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i]!;
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },
    deepEquals,
    inspect(value: unknown): string {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    },
    pathToFileURL(p: string): URL {
      return new URL("file://" + p);
    },
    fileURLToPath(u: URL | string): string {
      const url = typeof u === "string" ? new URL(u) : u;
      return url.pathname;
    },
    spawn(): never {
      throw new Error("Bun.spawn is not available on iOS");
    },
    spawnSync(): never {
      throw new Error("Bun.spawnSync is not available on iOS");
    },
    which(_cmd: string): null {
      return null;
    },
    resolveSync(_specifier: string, _from?: string): never {
      throw new Error("Bun.resolveSync not implemented on iOS");
    },
    plugin(_: unknown): void {
      // no-op — Bun loaders are baked into the bundle.
    },
    readableStreamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
      return readStreamToBytes(stream).then((b) => bytesToUtf8(b));
    },
    readableStreamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
      return readStreamToBytes(stream).then((b) => {
        const ab = new ArrayBuffer(b.length);
        new Uint8Array(ab).set(b);
        return ab;
      });
    },
    readableStreamToJSON(stream: ReadableStream<Uint8Array>): Promise<unknown> {
      return readStreamToBytes(stream).then((b) => JSON.parse(bytesToUtf8(b)));
    },
    readableStreamToBlob(stream: ReadableStream<Uint8Array>): Promise<Blob> {
      return readStreamToBytes(stream).then((b) => {
        const BlobCtor = (globalThis as { Blob?: typeof Blob }).Blob;
        if (!BlobCtor) throw new Error("Blob not available");
        return new BlobCtor([b as unknown as BlobPart]);
      });
    },
  };

  (globalThis as unknown as { Bun: typeof Bun }).Bun = Bun;
}

async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
