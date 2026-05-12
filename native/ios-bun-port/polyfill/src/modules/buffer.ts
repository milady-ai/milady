// Node Buffer over Uint8Array. We can't subclass Uint8Array reliably across all
// JSC versions, so Buffer is its own class that holds a Uint8Array internally
// and exposes a numeric-indexed proxy view + the Node Buffer surface.
//
// Most code only uses Buffer.from / Buffer.alloc / Buffer.concat / .toString /
// .slice / indexed read+write — that path is implemented natively. Long-tail
// methods (readBigInt64LE, etc.) cover the common cases.

import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  bytesToLatin1,
  bytesToUtf8,
  hexToBytes,
  latin1ToBytes,
  utf8ToBytes,
} from "../encoding.js";

export type Encoding =
  | "utf8"
  | "utf-8"
  | "hex"
  | "base64"
  | "base64url"
  | "ascii"
  | "binary"
  | "latin1"
  | "ucs2"
  | "ucs-2"
  | "utf16le"
  | "utf-16le";

function encodeString(s: string, encoding: Encoding = "utf8"): Uint8Array {
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return utf8ToBytes(s);
    case "hex":
      return hexToBytes(s);
    case "base64":
      return base64ToBytes(s);
    case "base64url":
      return base64ToBytes(s.replace(/-/g, "+").replace(/_/g, "/"));
    case "ascii":
    case "binary":
    case "latin1":
      return latin1ToBytes(s);
    case "ucs2":
    case "ucs-2":
    case "utf16le":
    case "utf-16le": {
      const out = new Uint8Array(s.length * 2);
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        out[i * 2] = c & 0xff;
        out[i * 2 + 1] = (c >> 8) & 0xff;
      }
      return out;
    }
    default:
      throw new Error("unknown encoding: " + encoding);
  }
}

function decodeString(b: Uint8Array, encoding: Encoding = "utf8"): string {
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return bytesToUtf8(b);
    case "hex":
      return bytesToHex(b);
    case "base64":
      return bytesToBase64(b);
    case "base64url":
      return bytesToBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(
        /=+$/,
        "",
      );
    case "ascii":
    case "binary":
    case "latin1":
      return bytesToLatin1(b);
    case "ucs2":
    case "ucs-2":
    case "utf16le":
    case "utf-16le": {
      let out = "";
      for (let i = 0; i + 1 < b.length; i += 2) {
        out += String.fromCharCode(b[i]! | (b[i + 1]! << 8));
      }
      return out;
    }
    default:
      throw new Error("unknown encoding: " + encoding);
  }
}

// We use Uint8Array as the storage but augment its prototype with Buffer
// methods so `instanceof Buffer` returns true for our typed arrays. This is
// what the `feross/buffer` package does.

const u8proto = Uint8Array.prototype as Uint8Array & Record<string, unknown>;

function isInstance(x: unknown): boolean {
  if (!(x instanceof Uint8Array)) return false;
  return (x as unknown as { _isBuffer?: boolean })._isBuffer === true;
}

// BufferInstance is just a Uint8Array tagged with _isBuffer. We treat it
// nominally as Uint8Array — Node Buffer methods live on Uint8Array.prototype
// at runtime via the patches below.
type BufferInstance = Uint8Array & { _isBuffer: true };

function tagBuffer(u: Uint8Array): BufferInstance {
  Object.defineProperty(u, "_isBuffer", {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return u as BufferInstance;
}

function fromString(s: string, encoding: Encoding = "utf8"): BufferInstance {
  return tagBuffer(encodeString(s, encoding));
}

function alloc(size: number, fill: string | number = 0, encoding: Encoding = "utf8"): BufferInstance {
  const out = new Uint8Array(size);
  if (fill !== 0) {
    if (typeof fill === "number") out.fill(fill & 0xff);
    else {
      const filler = encodeString(fill, encoding);
      for (let i = 0; i < out.length; i++) out[i] = filler[i % filler.length]!;
    }
  }
  return tagBuffer(out);
}

function allocUnsafe(size: number): BufferInstance {
  return tagBuffer(new Uint8Array(size));
}

function concat(list: Uint8Array[], totalLength?: number): BufferInstance {
  let total = totalLength;
  if (total === undefined) {
    total = 0;
    for (const b of list) total += b.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of list) {
    const n = Math.min(b.length, total - off);
    out.set(b.subarray(0, n), off);
    off += n;
    if (off >= total) break;
  }
  return tagBuffer(out);
}

function from(
  value: string | ArrayBuffer | Uint8Array | number[] | { type: "Buffer"; data: number[] },
  encodingOrOffset?: Encoding | number,
  length?: number,
): BufferInstance {
  if (typeof value === "string") {
    return fromString(value, (encodingOrOffset as Encoding) ?? "utf8");
  }
  if (value instanceof ArrayBuffer) {
    const off = typeof encodingOrOffset === "number" ? encodingOrOffset : 0;
    const len = length ?? value.byteLength - off;
    return tagBuffer(new Uint8Array(value, off, len));
  }
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.length);
    copy.set(value);
    return tagBuffer(copy);
  }
  if (Array.isArray(value)) {
    return tagBuffer(new Uint8Array(value));
  }
  if (value && typeof value === "object" && (value as { type?: string }).type === "Buffer" && Array.isArray((value as { data: number[] }).data)) {
    return tagBuffer(new Uint8Array((value as { data: number[] }).data));
  }
  throw new TypeError("Buffer.from: unsupported input");
}

function byteLength(s: string | Uint8Array | ArrayBuffer, encoding: Encoding = "utf8"): number {
  if (typeof s !== "string") {
    const v = s as Uint8Array | ArrayBuffer;
    if (v instanceof Uint8Array) return v.byteLength;
    if (v instanceof ArrayBuffer) return v.byteLength;
    throw new TypeError("Buffer.byteLength: expected string or Buffer");
  }
  return encodeString(s, encoding).length;
}

function isBuffer(x: unknown): boolean {
  return isInstance(x);
}

function isEncoding(x: unknown): boolean {
  if (typeof x !== "string") return false;
  switch (x) {
    case "utf8":
    case "utf-8":
    case "hex":
    case "base64":
    case "base64url":
    case "ascii":
    case "binary":
    case "latin1":
    case "ucs2":
    case "ucs-2":
    case "utf16le":
    case "utf-16le":
      return true;
    default:
      return false;
  }
}

// ── Prototype patches ────────────────────────────────────────────────────

// We patch Uint8Array.prototype with the Node Buffer methods. They are
// non-enumerable so they don't show up in iteration / JSON.

function definePatch(name: string, fn: (...args: never[]) => unknown): void {
  if (Object.prototype.hasOwnProperty.call(u8proto, name)) return;
  Object.defineProperty(u8proto, name, {
    value: fn,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

definePatch("write", function write(
  this: Uint8Array,
  s: string,
  offsetOrEncoding?: number | Encoding,
  lengthOrEncoding?: number | Encoding,
  encoding?: Encoding,
): number {
  let offset = 0;
  let length = this.length;
  let enc: Encoding = "utf8";
  if (typeof offsetOrEncoding === "string") {
    enc = offsetOrEncoding;
  } else if (typeof offsetOrEncoding === "number") {
    offset = offsetOrEncoding;
    if (typeof lengthOrEncoding === "string") {
      enc = lengthOrEncoding;
    } else {
      if (typeof lengthOrEncoding === "number") length = lengthOrEncoding;
      if (typeof encoding === "string") enc = encoding;
    }
  }
  const bytes = encodeString(s, enc);
  const n = Math.min(bytes.length, length, this.length - offset);
  this.set(bytes.subarray(0, n), offset);
  return n;
});

definePatch("toString", function toStringImpl(
  this: Uint8Array,
  encoding: Encoding = "utf8",
  start = 0,
  end = this.length,
): string {
  if (start === 0 && end === this.length) return decodeString(this, encoding);
  return decodeString(this.subarray(start, end), encoding);
});

definePatch("equals", function equals(this: Uint8Array, other: Uint8Array): boolean {
  if (!(other instanceof Uint8Array)) return false;
  if (this.length !== other.length) return false;
  for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
  return true;
});

definePatch("compare", function compare(this: Uint8Array, other: Uint8Array): number {
  const len = Math.min(this.length, other.length);
  for (let i = 0; i < len; i++) {
    const a = this[i]!;
    const b = other[i]!;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  if (this.length < other.length) return -1;
  if (this.length > other.length) return 1;
  return 0;
});

definePatch("copy", function copy(
  this: Uint8Array,
  target: Uint8Array,
  targetStart = 0,
  sourceStart = 0,
  sourceEnd = this.length,
): number {
  const sliceLen = Math.min(
    sourceEnd - sourceStart,
    target.length - targetStart,
  );
  if (sliceLen <= 0) return 0;
  target.set(this.subarray(sourceStart, sourceStart + sliceLen), targetStart);
  return sliceLen;
});

definePatch("indexOf", function indexOf(
  this: Uint8Array,
  value: string | number | Uint8Array,
  byteOffset: number | Encoding = 0,
  encoding: Encoding = "utf8",
): number {
  if (typeof byteOffset === "string") {
    encoding = byteOffset;
    byteOffset = 0;
  }
  let needle: Uint8Array;
  if (typeof value === "number") {
    needle = new Uint8Array([value & 0xff]);
  } else if (typeof value === "string") {
    needle = encodeString(value, encoding);
  } else {
    needle = value;
  }
  if (needle.length === 0) return byteOffset;
  outer: for (let i = byteOffset; i <= this.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (this[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
});

definePatch("includes", function includes(
  this: Uint8Array,
  value: string | number | Uint8Array,
  byteOffset: number | Encoding = 0,
  encoding: Encoding = "utf8",
): boolean {
  return (this as Uint8Array & { indexOf(v: unknown, o?: unknown, e?: unknown): number }).indexOf(value, byteOffset, encoding) !== -1;
});

// Numeric read/write helpers. DataView is available in JSC.
function dv(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

definePatch("readUInt8", function (this: Uint8Array, off: number) { return this[off]!; });
definePatch("readUInt16LE", function (this: Uint8Array, off: number) { return dv(this).getUint16(off, true); });
definePatch("readUInt16BE", function (this: Uint8Array, off: number) { return dv(this).getUint16(off, false); });
definePatch("readUInt32LE", function (this: Uint8Array, off: number) { return dv(this).getUint32(off, true); });
definePatch("readUInt32BE", function (this: Uint8Array, off: number) { return dv(this).getUint32(off, false); });
definePatch("readInt8", function (this: Uint8Array, off: number) { return dv(this).getInt8(off); });
definePatch("readInt16LE", function (this: Uint8Array, off: number) { return dv(this).getInt16(off, true); });
definePatch("readInt16BE", function (this: Uint8Array, off: number) { return dv(this).getInt16(off, false); });
definePatch("readInt32LE", function (this: Uint8Array, off: number) { return dv(this).getInt32(off, true); });
definePatch("readInt32BE", function (this: Uint8Array, off: number) { return dv(this).getInt32(off, false); });
definePatch("readFloatLE", function (this: Uint8Array, off: number) { return dv(this).getFloat32(off, true); });
definePatch("readFloatBE", function (this: Uint8Array, off: number) { return dv(this).getFloat32(off, false); });
definePatch("readDoubleLE", function (this: Uint8Array, off: number) { return dv(this).getFloat64(off, true); });
definePatch("readDoubleBE", function (this: Uint8Array, off: number) { return dv(this).getFloat64(off, false); });

definePatch("writeUInt8", function (this: Uint8Array, v: number, off: number) {
  this[off] = v & 0xff;
  return off + 1;
});
definePatch("writeUInt16LE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setUint16(off, v, true);
  return off + 2;
});
definePatch("writeUInt16BE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setUint16(off, v, false);
  return off + 2;
});
definePatch("writeUInt32LE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setUint32(off, v, true);
  return off + 4;
});
definePatch("writeUInt32BE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setUint32(off, v, false);
  return off + 4;
});
definePatch("writeInt8", function (this: Uint8Array, v: number, off: number) {
  dv(this).setInt8(off, v);
  return off + 1;
});
definePatch("writeInt32LE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setInt32(off, v, true);
  return off + 4;
});
definePatch("writeInt32BE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setInt32(off, v, false);
  return off + 4;
});
definePatch("writeFloatLE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setFloat32(off, v, true);
  return off + 4;
});
definePatch("writeDoubleLE", function (this: Uint8Array, v: number, off: number) {
  dv(this).setFloat64(off, v, true);
  return off + 8;
});

definePatch("toJSON", function toJSON(this: Uint8Array) {
  const data: number[] = new Array(this.length);
  for (let i = 0; i < this.length; i++) data[i] = this[i]!;
  return { type: "Buffer", data };
});

// ── Buffer constructor (returns a tagged Uint8Array) ─────────────────────

export interface BufferConstructor {
  from(value: string, encoding?: Encoding): BufferInstance;
  from(value: ArrayBuffer | Uint8Array | number[]): BufferInstance;
  from(value: { type: "Buffer"; data: number[] }): BufferInstance;
  alloc(size: number, fill?: string | number, encoding?: Encoding): BufferInstance;
  allocUnsafe(size: number): BufferInstance;
  allocUnsafeSlow(size: number): BufferInstance;
  concat(list: Uint8Array[], totalLength?: number): BufferInstance;
  byteLength(s: string | Uint8Array | ArrayBuffer, encoding?: Encoding): number;
  isBuffer(x: unknown): boolean;
  isEncoding(x: unknown): boolean;
  poolSize: number;
}

export const Buffer: BufferConstructor = Object.assign(
  function BufferCtor(
    arg: number | string | Uint8Array | ArrayBuffer | number[],
    encodingOrOffset?: Encoding | number,
    length?: number,
  ): BufferInstance {
    if (typeof arg === "number") return alloc(arg);
    return from(arg as string, encodingOrOffset as Encoding, length);
  } as unknown as BufferConstructor,
  {
    from,
    alloc,
    allocUnsafe,
    allocUnsafeSlow: allocUnsafe,
    concat,
    byteLength,
    isBuffer,
    isEncoding,
    poolSize: 8192,
  },
);

// Make `instanceof Buffer` work by aliasing to Uint8Array.
Object.defineProperty(Buffer, Symbol.hasInstance, {
  value(x: unknown): boolean {
    return isInstance(x);
  },
});

export const kMaxLength = 0x7fffffff;
export const INSPECT_MAX_BYTES = 50;

export default { Buffer, kMaxLength, INSPECT_MAX_BYTES };
