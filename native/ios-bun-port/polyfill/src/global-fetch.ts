// globalThis.fetch / Headers / Request / Response backed by bridge.http_fetch.
// We install unconditionally so behavior is identical across JSC versions.

import { getBridge } from "./bridge.js";
import { utf8ToBytes, bytesToUtf8 } from "./encoding.js";

class HeadersImpl {
  private _map = new Map<string, string>();

  constructor(init?: HeadersImpl | Record<string, string> | [string, string][] | Headers) {
    if (!init) return;
    if (init instanceof HeadersImpl) {
      for (const [k, v] of init._map) this._map.set(k, v);
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this.set(k, v);
    } else if (typeof init === "object" && "forEach" in init && typeof (init as Headers).forEach === "function") {
      (init as Headers).forEach((v, k) => this.set(k, v));
    } else {
      for (const k of Object.keys(init as Record<string, string>)) {
        this.set(k, (init as Record<string, string>)[k]!);
      }
    }
  }

  get(name: string): string | null {
    return this._map.get(name.toLowerCase()) ?? null;
  }
  set(name: string, value: string): void {
    this._map.set(name.toLowerCase(), String(value));
  }
  append(name: string, value: string): void {
    const existing = this._map.get(name.toLowerCase());
    if (existing) this._map.set(name.toLowerCase(), existing + ", " + value);
    else this._map.set(name.toLowerCase(), value);
  }
  has(name: string): boolean {
    return this._map.has(name.toLowerCase());
  }
  delete(name: string): void {
    this._map.delete(name.toLowerCase());
  }
  forEach(cb: (value: string, key: string, parent: HeadersImpl) => void): void {
    for (const [k, v] of this._map) cb(v, k, this);
  }
  *entries(): IterableIterator<[string, string]> {
    yield* this._map.entries();
  }
  *keys(): IterableIterator<string> {
    yield* this._map.keys();
  }
  *values(): IterableIterator<string> {
    yield* this._map.values();
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this._map) out[k] = v;
    return out;
  }
}

// Use Uint8Array<ArrayBufferLike> to play nice with both fresh ArrayBuffers
// and views over external buffers (e.g. the bridge returns ArrayBufferLike).
type Bytes = Uint8Array<ArrayBufferLike>;

interface BodyState {
  _bytes: Bytes;
  _consumed: boolean;
}

abstract class Body {
  // Internal — exposed for fetchImpl. Cast-friendly name.
  _state: BodyState;
  constructor(bytes: Bytes = new Uint8Array(0) as Bytes) {
    this._state = { _bytes: bytes, _consumed: false };
  }
  get bodyUsed(): boolean {
    return this._state._consumed;
  }
  async text(): Promise<string> {
    if (this._state._consumed) throw new TypeError("body already consumed");
    this._state._consumed = true;
    return bytesToUtf8(this._state._bytes);
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this._state._consumed) throw new TypeError("body already consumed");
    this._state._consumed = true;
    const ab = new ArrayBuffer(this._state._bytes.length);
    new Uint8Array(ab).set(this._state._bytes);
    return ab;
  }
  async bytes(): Promise<Uint8Array> {
    if (this._state._consumed) throw new TypeError("body already consumed");
    this._state._consumed = true;
    return this._state._bytes;
  }
  async blob(): Promise<Blob> {
    if (this._state._consumed) throw new TypeError("body already consumed");
    this._state._consumed = true;
    // Construct a minimal blob via globalThis.Blob if present.
    const BlobCtor = (globalThis as { Blob?: typeof Blob }).Blob;
    if (BlobCtor) return new BlobCtor([this._state._bytes as unknown as BlobPart]);
    throw new Error("Blob not available");
  }
}

function bodyInitToBytes(body: BodyInit | undefined | null): Bytes {
  if (body === undefined || body === null) return new Uint8Array(0) as Bytes;
  if (typeof body === "string") return utf8ToBytes(body) as Bytes;
  if (body instanceof Uint8Array) return body as Bytes;
  if (body instanceof ArrayBuffer) return new Uint8Array(body) as Bytes;
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as Bytes;
  if (body instanceof URLSearchParams) return utf8ToBytes(body.toString()) as Bytes;
  throw new TypeError("unsupported body type");
}

class RequestImpl extends Body {
  readonly url: string;
  readonly method: string;
  readonly headers: HeadersImpl;
  readonly signal?: AbortSignal;

  constructor(input: string | RequestImpl | URL, init: RequestInit = {}) {
    let url: string;
    let method = "GET";
    let headers = new HeadersImpl();
    let bodyBytes: Bytes = new Uint8Array(0) as Bytes;
    if (input instanceof RequestImpl) {
      url = input.url;
      method = input.method;
      headers = new HeadersImpl(input.headers);
      bodyBytes = input._state._bytes;
    } else {
      url = String(input);
    }
    if (init.method) method = init.method.toUpperCase();
    if (init.headers) headers = new HeadersImpl(init.headers as Record<string, string>);
    if (init.body !== undefined && init.body !== null) bodyBytes = bodyInitToBytes(init.body);
    super(bodyBytes);
    this.url = url;
    this.method = method;
    this.headers = headers;
    this.signal = init.signal ?? undefined;
  }

  clone(): RequestImpl {
    return new RequestImpl(this.url, {
      method: this.method,
      headers: this.headers.toJSON(),
      body: this._state._bytes as unknown as BodyInit,
    });
  }
}

class ResponseImpl extends Body {
  readonly status: number;
  readonly statusText: string;
  readonly headers: HeadersImpl;
  readonly url: string;
  readonly ok: boolean;
  readonly type = "default";
  readonly redirected = false;

  constructor(body: BodyInit | null | undefined, init: ResponseInit & { url?: string } = {}) {
    super(bodyInitToBytes(body));
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.headers = new HeadersImpl(init.headers as Record<string, string>);
    this.url = init.url ?? "";
    this.ok = this.status >= 200 && this.status < 300;
  }

  clone(): ResponseImpl {
    return new ResponseImpl(this._state._bytes as unknown as BodyInit, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers.toJSON(),
      url: this.url,
    });
  }

  static error(): ResponseImpl {
    return new ResponseImpl(null, { status: 0, statusText: "" });
  }

  static json(data: unknown, init?: ResponseInit): ResponseImpl {
    const headers = new HeadersImpl(init?.headers as Record<string, string>);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new ResponseImpl(JSON.stringify(data), { ...init, headers: headers.toJSON() });
  }

  static redirect(url: string, status = 302): ResponseImpl {
    return new ResponseImpl(null, { status, headers: { location: url } });
  }
}

async function fetchImpl(input: string | RequestImpl | URL, init: RequestInit = {}): Promise<ResponseImpl> {
  const req = new RequestImpl(input as string, init);
  const bodyBytes = req._state._bytes;
  const result = await getBridge().http_fetch({
    url: req.url,
    method: req.method,
    headers: req.headers.toJSON(),
    body: bodyBytes.length > 0 ? bodyBytes : undefined,
  });
  if (result.error) throw new Error(result.error);
  return new ResponseImpl(result.body as unknown as BodyInit, {
    status: result.status,
    statusText: "",
    headers: result.headers,
    url: req.url,
  });
}

export function installGlobalFetch(): void {
  const g = globalThis as unknown as {
    fetch?: typeof fetch;
    Headers?: typeof Headers;
    Request?: typeof Request;
    Response?: typeof Response;
  };
  g.fetch = fetchImpl as unknown as typeof fetch;
  g.Headers = HeadersImpl as unknown as typeof Headers;
  g.Request = RequestImpl as unknown as typeof Request;
  g.Response = ResponseImpl as unknown as typeof Response;
}
