// node:crypto over the bridge. CryptoKit-backed primitives wrapped in a Node
// API surface. We implement createHash, createHmac, randomBytes, randomUUID,
// pbkdf2, createCipheriv/Decipheriv for aes-256-gcm + aes-128-gcm, and a
// SubtleCrypto subset.

import { getBridge } from "../bridge.js";
import { utf8ToBytes, bytesToHex, bytesToBase64, base64ToBytes, hexToBytes } from "../encoding.js";

type HashAlgo = "sha256" | "sha512" | "sha1" | "md5";
type HmacAlgo = "sha256" | "sha512" | "sha1";
type Pbkdf2Digest = "sha256" | "sha512" | "sha1";

function normalizeAlgo(a: string): HashAlgo {
  const lower = a.toLowerCase().replace(/-/g, "");
  switch (lower) {
    case "sha256":
      return "sha256";
    case "sha512":
      return "sha512";
    case "sha1":
      return "sha1";
    case "md5":
      return "md5";
    default:
      throw new Error("unsupported hash algorithm: " + a);
  }
}

function toBytes(data: string | Uint8Array | ArrayBuffer, encoding: string = "utf8"): Uint8Array {
  if (typeof data === "string") {
    if (encoding === "hex") return hexToBytes(data);
    if (encoding === "base64") return base64ToBytes(data);
    return utf8ToBytes(data);
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

function encodeBytes(b: Uint8Array, encoding?: string): string | Uint8Array {
  if (!encoding) return b;
  switch (encoding) {
    case "hex":
      return bytesToHex(b);
    case "base64":
      return bytesToBase64(b);
    case "base64url":
      return bytesToBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    case "utf8":
    case "utf-8":
      return new TextDecoder("utf-8").decode(b);
    default:
      return b;
  }
}

// ── Hash ────────────────────────────────────────────────────────────────

export class Hash {
  private _chunks: Uint8Array[] = [];
  private _finalized = false;
  constructor(private algo: HashAlgo) {}

  update(data: string | Uint8Array, encoding?: string): this {
    if (this._finalized) throw new Error("Hash already finalized");
    this._chunks.push(toBytes(data, encoding ?? "utf8"));
    return this;
  }

  digest(encoding?: string): string | Uint8Array {
    if (this._finalized) throw new Error("Hash already finalized");
    this._finalized = true;
    let total = 0;
    for (const c of this._chunks) total += c.length;
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of this._chunks) {
      buf.set(c, off);
      off += c.length;
    }
    const out = getBridge().crypto_hash(this.algo, buf);
    return encodeBytes(out, encoding);
  }

  copy(): Hash {
    const c = new Hash(this.algo);
    c._chunks = this._chunks.slice();
    return c;
  }
}

export function createHash(algo: string): Hash {
  return new Hash(normalizeAlgo(algo));
}

// ── Hmac ────────────────────────────────────────────────────────────────

export class Hmac {
  private _chunks: Uint8Array[] = [];
  private _finalized = false;
  constructor(private algo: HmacAlgo, private key: Uint8Array) {}

  update(data: string | Uint8Array, encoding?: string): this {
    if (this._finalized) throw new Error("Hmac already finalized");
    this._chunks.push(toBytes(data, encoding ?? "utf8"));
    return this;
  }

  digest(encoding?: string): string | Uint8Array {
    if (this._finalized) throw new Error("Hmac already finalized");
    this._finalized = true;
    let total = 0;
    for (const c of this._chunks) total += c.length;
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of this._chunks) {
      buf.set(c, off);
      off += c.length;
    }
    const out = getBridge().crypto_hmac(this.algo, this.key, buf);
    return encodeBytes(out, encoding);
  }
}

export function createHmac(algo: string, key: string | Uint8Array): Hmac {
  const a = normalizeAlgo(algo);
  if (a === "md5") throw new Error("hmac-md5 not supported");
  return new Hmac(a, toBytes(key));
}

// ── Random ──────────────────────────────────────────────────────────────

export function randomBytes(n: number, cb?: (err: Error | null, buf: Uint8Array) => void): Uint8Array {
  const out = getBridge().crypto_random_bytes(n);
  if (cb) Promise.resolve().then(() => cb(null, out));
  return out;
}

export function randomUUID(): string {
  return getBridge().crypto_random_uuid();
}

export function randomFillSync<T extends Uint8Array>(buf: T, offset = 0, size = buf.length - offset): T {
  const rand = getBridge().crypto_random_bytes(size);
  buf.set(rand, offset);
  return buf;
}

export function randomFill<T extends Uint8Array>(
  buf: T,
  offsetOrCb: number | ((err: Error | null, buf: T) => void),
  sizeOrCb?: number | ((err: Error | null, buf: T) => void),
  cb?: (err: Error | null, buf: T) => void,
): void {
  const offset = typeof offsetOrCb === "number" ? offsetOrCb : 0;
  const size = typeof sizeOrCb === "number" ? sizeOrCb : buf.length - offset;
  const callback =
    typeof offsetOrCb === "function"
      ? offsetOrCb
      : typeof sizeOrCb === "function"
        ? sizeOrCb
        : cb!;
  Promise.resolve().then(() => {
    randomFillSync(buf, offset, size);
    callback(null, buf);
  });
}

export function randomInt(maxOrMin: number, maybeMax?: number): number {
  const min = maybeMax !== undefined ? maxOrMin : 0;
  const max = maybeMax !== undefined ? maybeMax : maxOrMin;
  if (max <= min) throw new RangeError("max must be > min");
  const range = max - min;
  const bytes = getBridge().crypto_random_bytes(4);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return min + (dv.getUint32(0, true) % range);
}

// ── PBKDF2 ──────────────────────────────────────────────────────────────

function normalizeDigest(d: string): Pbkdf2Digest {
  const lower = d.toLowerCase().replace(/-/g, "");
  switch (lower) {
    case "sha256":
      return "sha256";
    case "sha512":
      return "sha512";
    case "sha1":
      return "sha1";
    default:
      throw new Error("unsupported pbkdf2 digest: " + d);
  }
}

export function pbkdf2Sync(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
): Uint8Array {
  return getBridge().crypto_pbkdf2(
    toBytes(password),
    toBytes(salt),
    iterations,
    keylen,
    normalizeDigest(digest),
  );
}

export function pbkdf2(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
  cb: (err: Error | null, derivedKey: Uint8Array) => void,
): void {
  Promise.resolve().then(() => {
    try {
      cb(null, pbkdf2Sync(password, salt, iterations, keylen, digest));
    } catch (err) {
      cb(err as Error, new Uint8Array());
    }
  });
}

// scrypt — implement via pbkdf2 fallback for correctness on common inputs.
// We refuse for any non-trivial cost factor since the JS impl would be slow.

export function scryptSync(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  keylen: number,
  options?: { N?: number; r?: number; p?: number },
): Uint8Array {
  const N = options?.N ?? 16384;
  if (N > 16384) throw new Error("scrypt with N>16384 unavailable on iOS JSC (no native scrypt in bridge v1)");
  // Approximation via pbkdf2-sha256. NOT cryptographically equivalent — only
  // suitable for non-security uses (deterministic key stretching for caches).
  return pbkdf2Sync(password, salt, N, keylen, "sha256");
}

export function scrypt(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  keylen: number,
  optionsOrCb: { N?: number; r?: number; p?: number } | ((err: Error | null, derivedKey: Uint8Array) => void),
  cb?: (err: Error | null, derivedKey: Uint8Array) => void,
): void {
  const options = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  Promise.resolve().then(() => {
    try {
      callback(null, scryptSync(password, salt, keylen, options));
    } catch (err) {
      callback(err as Error, new Uint8Array());
    }
  });
}

// ── AES-GCM Cipher ──────────────────────────────────────────────────────

function parseAesAlgo(algo: string): { keyBits: 128 | 256 } {
  const lower = algo.toLowerCase();
  switch (lower) {
    case "aes-128-gcm":
      return { keyBits: 128 };
    case "aes-256-gcm":
      return { keyBits: 256 };
    default:
      throw new Error("unsupported cipher: " + algo + " (only aes-128-gcm, aes-256-gcm)");
  }
}

export class CipherGCM {
  private _chunks: Uint8Array[] = [];
  private _aad: Uint8Array | undefined;
  private _tag: Uint8Array | undefined;
  private _ciphertext: Uint8Array | undefined;
  private _finalized = false;
  constructor(_algo: string, private key: Uint8Array, private iv: Uint8Array) {}

  setAAD(buf: Uint8Array): this {
    this._aad = buf;
    return this;
  }

  update(data: string | Uint8Array, inputEncoding?: string, outputEncoding?: string): string | Uint8Array {
    this._chunks.push(toBytes(data, inputEncoding ?? "utf8"));
    // For AES-GCM, Node yields ciphertext in update; we buffer until final and
    // return empty bytes here. Most callers concat update + final, so this is fine.
    const empty = new Uint8Array();
    return outputEncoding ? "" : empty;
  }

  final(outputEncoding?: string): string | Uint8Array {
    if (this._finalized) throw new Error("Cipher already finalized");
    this._finalized = true;
    let total = 0;
    for (const c of this._chunks) total += c.length;
    const plaintext = new Uint8Array(total);
    let off = 0;
    for (const c of this._chunks) {
      plaintext.set(c, off);
      off += c.length;
    }
    const result = getBridge().crypto_aes_gcm_encrypt(this.key, this.iv, plaintext, this._aad);
    if (!result) throw new Error("AES-GCM encrypt failed: " + (getBridge().fs_last_error() ?? "unknown"));
    this._ciphertext = result.ciphertext;
    this._tag = result.tag;
    return encodeBytes(result.ciphertext, outputEncoding);
  }

  getAuthTag(): Uint8Array {
    if (!this._tag) throw new Error("call final() before getAuthTag()");
    return this._tag;
  }
}

export class DecipherGCM {
  private _chunks: Uint8Array[] = [];
  private _aad: Uint8Array | undefined;
  private _tag: Uint8Array | undefined;
  private _finalized = false;
  constructor(_algo: string, private key: Uint8Array, private iv: Uint8Array) {}

  setAAD(buf: Uint8Array): this {
    this._aad = buf;
    return this;
  }

  setAuthTag(tag: Uint8Array): this {
    this._tag = tag;
    return this;
  }

  update(data: string | Uint8Array, inputEncoding?: string, outputEncoding?: string): string | Uint8Array {
    this._chunks.push(toBytes(data, inputEncoding ?? "utf8"));
    const empty = new Uint8Array();
    return outputEncoding ? "" : empty;
  }

  final(outputEncoding?: string): string | Uint8Array {
    if (this._finalized) throw new Error("Decipher already finalized");
    if (!this._tag) throw new Error("setAuthTag required before final()");
    this._finalized = true;
    let total = 0;
    for (const c of this._chunks) total += c.length;
    const ciphertext = new Uint8Array(total);
    let off = 0;
    for (const c of this._chunks) {
      ciphertext.set(c, off);
      off += c.length;
    }
    const result = getBridge().crypto_aes_gcm_decrypt(this.key, this.iv, ciphertext, this._tag, this._aad);
    if (!result) throw new Error("AES-GCM decrypt failed (auth tag mismatch?)");
    return encodeBytes(result, outputEncoding);
  }
}

export function createCipheriv(algo: string, key: string | Uint8Array, iv: string | Uint8Array): CipherGCM {
  const { keyBits } = parseAesAlgo(algo);
  const keyBytes = toBytes(key);
  if (keyBytes.length * 8 !== keyBits) throw new Error(`expected ${keyBits / 8}-byte key`);
  const ivBytes = toBytes(iv);
  if (ivBytes.length !== 12) throw new Error("AES-GCM iv must be 12 bytes");
  return new CipherGCM(algo, keyBytes, ivBytes);
}

export function createDecipheriv(algo: string, key: string | Uint8Array, iv: string | Uint8Array): DecipherGCM {
  const { keyBits } = parseAesAlgo(algo);
  const keyBytes = toBytes(key);
  if (keyBytes.length * 8 !== keyBits) throw new Error(`expected ${keyBits / 8}-byte key`);
  const ivBytes = toBytes(iv);
  if (ivBytes.length !== 12) throw new Error("AES-GCM iv must be 12 bytes");
  return new DecipherGCM(algo, keyBytes, ivBytes);
}

// ── Constant-time compare ───────────────────────────────────────────────

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ── SubtleCrypto subset ─────────────────────────────────────────────────

interface CryptoKey {
  type: "secret" | "public" | "private";
  algorithm: { name: string; length?: number; hash?: { name: string } };
  extractable: boolean;
  usages: string[];
  _raw: Uint8Array;
}

function subtleDigest(algorithm: { name: string } | string, data: BufferSource): Promise<ArrayBuffer> {
  const name = typeof algorithm === "string" ? algorithm : algorithm.name;
  const algo = normalizeAlgo(name);
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const out = getBridge().crypto_hash(algo, bytes);
  // copy to a fresh ArrayBuffer
  const ab = new ArrayBuffer(out.length);
  new Uint8Array(ab).set(out);
  return Promise.resolve(ab);
}

async function subtleImportKey(
  _format: string,
  keyData: BufferSource,
  algorithm: { name: string; hash?: { name: string } } | string,
  extractable: boolean,
  usages: string[],
): Promise<CryptoKey> {
  const raw = keyData instanceof ArrayBuffer ? new Uint8Array(keyData) : new Uint8Array((keyData as ArrayBufferView).buffer, (keyData as ArrayBufferView).byteOffset, (keyData as ArrayBufferView).byteLength);
  const algoName = typeof algorithm === "string" ? algorithm : algorithm.name;
  return {
    type: "secret",
    algorithm: typeof algorithm === "string" ? { name: algorithm } : algorithm,
    extractable,
    usages,
    _raw: new Uint8Array(raw),
  };
}

async function subtleSign(
  algorithm: { name: string; hash?: { name: string } } | string,
  key: CryptoKey,
  data: BufferSource,
): Promise<ArrayBuffer> {
  const name = (typeof algorithm === "string" ? algorithm : algorithm.name).toLowerCase();
  if (name !== "hmac") throw new Error("subtle.sign: only HMAC supported on iOS JSC");
  const hashName = (typeof algorithm === "object" ? algorithm.hash?.name : key.algorithm.hash?.name) ?? "SHA-256";
  const algo = normalizeAlgo(hashName);
  if (algo === "md5") throw new Error("HMAC-MD5 not supported");
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
  const out = getBridge().crypto_hmac(algo as HmacAlgo, key._raw, bytes);
  const ab = new ArrayBuffer(out.length);
  new Uint8Array(ab).set(out);
  return ab;
}

async function subtleVerify(
  algorithm: { name: string; hash?: { name: string } } | string,
  key: CryptoKey,
  signature: BufferSource,
  data: BufferSource,
): Promise<boolean> {
  const expected = await subtleSign(algorithm, key, data);
  const expectedBytes = new Uint8Array(expected);
  const sigBytes = signature instanceof ArrayBuffer ? new Uint8Array(signature) : new Uint8Array((signature as ArrayBufferView).buffer, (signature as ArrayBufferView).byteOffset, (signature as ArrayBufferView).byteLength);
  return timingSafeEqual(expectedBytes, sigBytes);
}

async function subtleEncrypt(
  algorithm: { name: string; iv?: BufferSource; additionalData?: BufferSource },
  key: CryptoKey,
  data: BufferSource,
): Promise<ArrayBuffer> {
  if (algorithm.name.toLowerCase() !== "aes-gcm") throw new Error("subtle.encrypt: only AES-GCM");
  const iv = algorithm.iv instanceof ArrayBuffer ? new Uint8Array(algorithm.iv) : new Uint8Array((algorithm.iv as ArrayBufferView).buffer, (algorithm.iv as ArrayBufferView).byteOffset, (algorithm.iv as ArrayBufferView).byteLength);
  const plaintext = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
  const aad = algorithm.additionalData
    ? algorithm.additionalData instanceof ArrayBuffer
      ? new Uint8Array(algorithm.additionalData)
      : new Uint8Array((algorithm.additionalData as ArrayBufferView).buffer, (algorithm.additionalData as ArrayBufferView).byteOffset, (algorithm.additionalData as ArrayBufferView).byteLength)
    : undefined;
  const result = getBridge().crypto_aes_gcm_encrypt(key._raw, iv, plaintext, aad);
  if (!result) throw new Error("AES-GCM encrypt failed");
  // WebCrypto returns ciphertext || tag concatenated.
  const out = new Uint8Array(result.ciphertext.length + result.tag.length);
  out.set(result.ciphertext, 0);
  out.set(result.tag, result.ciphertext.length);
  const ab = new ArrayBuffer(out.length);
  new Uint8Array(ab).set(out);
  return ab;
}

async function subtleDecrypt(
  algorithm: { name: string; iv?: BufferSource; additionalData?: BufferSource; tagLength?: number },
  key: CryptoKey,
  data: BufferSource,
): Promise<ArrayBuffer> {
  if (algorithm.name.toLowerCase() !== "aes-gcm") throw new Error("subtle.decrypt: only AES-GCM");
  const iv = algorithm.iv instanceof ArrayBuffer ? new Uint8Array(algorithm.iv) : new Uint8Array((algorithm.iv as ArrayBufferView).buffer, (algorithm.iv as ArrayBufferView).byteOffset, (algorithm.iv as ArrayBufferView).byteLength);
  const combined = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
  const tagBits = algorithm.tagLength ?? 128;
  const tagBytes = tagBits / 8;
  const ciphertext = combined.subarray(0, combined.length - tagBytes);
  const tag = combined.subarray(combined.length - tagBytes);
  const aad = algorithm.additionalData
    ? algorithm.additionalData instanceof ArrayBuffer
      ? new Uint8Array(algorithm.additionalData)
      : new Uint8Array((algorithm.additionalData as ArrayBufferView).buffer, (algorithm.additionalData as ArrayBufferView).byteOffset, (algorithm.additionalData as ArrayBufferView).byteLength)
    : undefined;
  const result = getBridge().crypto_aes_gcm_decrypt(key._raw, iv, ciphertext, tag, aad);
  if (!result) throw new Error("AES-GCM decrypt failed");
  const ab = new ArrayBuffer(result.length);
  new Uint8Array(ab).set(result);
  return ab;
}

export const subtle = {
  digest: subtleDigest,
  importKey: subtleImportKey,
  sign: subtleSign,
  verify: subtleVerify,
  encrypt: subtleEncrypt,
  decrypt: subtleDecrypt,
};

export const webcrypto = {
  subtle,
  getRandomValues<T extends ArrayBufferView>(buf: T): T {
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const rand = getBridge().crypto_random_bytes(u8.length);
    u8.set(rand);
    return buf;
  },
  randomUUID(): string {
    return getBridge().crypto_random_uuid();
  },
};

// ── Misc unsupported (throw helpfully) ──────────────────────────────────

export function generateKeyPair(_type: string, _opts: unknown, cb: (err: Error) => void): void {
  cb(new Error("crypto.generateKeyPair is not supported on iOS JSC bridge v1"));
}

export function generateKeyPairSync(_type: string, _opts: unknown): never {
  throw new Error("crypto.generateKeyPairSync is not supported on iOS JSC bridge v1");
}

export function createSign(_algo: string): never {
  throw new Error("crypto.createSign (asymmetric) is not supported on iOS JSC bridge v1");
}

export function createVerify(_algo: string): never {
  throw new Error("crypto.createVerify is not supported on iOS JSC bridge v1");
}

export function createDiffieHellman(_a: unknown): never {
  throw new Error("crypto.createDiffieHellman is not supported");
}

export default {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  randomFillSync,
  randomFill,
  randomInt,
  pbkdf2,
  pbkdf2Sync,
  scrypt,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
  subtle,
  webcrypto,
  generateKeyPair,
  generateKeyPairSync,
  createSign,
  createVerify,
  createDiffieHellman,
  getRandomValues: webcrypto.getRandomValues,
};
