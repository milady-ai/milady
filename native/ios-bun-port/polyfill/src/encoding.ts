// Encoding helpers. Used by Buffer, fs, crypto, http. JSC ships TextEncoder /
// TextDecoder in modern WebKit; we install lightweight fallbacks if missing.

const utf8Encoder: { encode(s: string): Uint8Array } =
  typeof TextEncoder !== "undefined"
    ? new TextEncoder()
    : {
        encode(s: string): Uint8Array {
          const out: number[] = [];
          for (let i = 0; i < s.length; i++) {
            let code = s.charCodeAt(i);
            if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
              const next = s.charCodeAt(i + 1);
              if (next >= 0xdc00 && next <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                i++;
              }
            }
            if (code < 0x80) {
              out.push(code);
            } else if (code < 0x800) {
              out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else if (code < 0x10000) {
              out.push(
                0xe0 | (code >> 12),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f),
              );
            } else {
              out.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f),
              );
            }
          }
          return new Uint8Array(out);
        },
      };

const utf8Decoder: { decode(b: Uint8Array): string } =
  typeof TextDecoder !== "undefined"
    ? new TextDecoder("utf-8")
    : {
        decode(b: Uint8Array): string {
          let out = "";
          let i = 0;
          while (i < b.length) {
            const c = b[i++]!;
            if (c < 0x80) {
              out += String.fromCharCode(c);
            } else if (c < 0xe0) {
              out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++]! & 0x3f));
            } else if (c < 0xf0) {
              out += String.fromCharCode(
                ((c & 0x0f) << 12) |
                  ((b[i++]! & 0x3f) << 6) |
                  (b[i++]! & 0x3f),
              );
            } else {
              const cp =
                ((c & 0x07) << 18) |
                ((b[i++]! & 0x3f) << 12) |
                ((b[i++]! & 0x3f) << 6) |
                (b[i++]! & 0x3f);
              const off = cp - 0x10000;
              out += String.fromCharCode(0xd800 + (off >> 10));
              out += String.fromCharCode(0xdc00 + (off & 0x3ff));
            }
          }
          return out;
        },
      };

export function utf8ToBytes(s: string): Uint8Array {
  return utf8Encoder.encode(s);
}

export function bytesToUtf8(b: Uint8Array): string {
  return utf8Decoder.decode(b);
}

const HEX = "0123456789abcdef";

export function bytesToHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) {
    const v = b[i]!;
    out += HEX[v >> 4] + HEX[v & 0x0f];
  }
  return out;
}

export function hexToBytes(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new Error("invalid hex string length");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = parseHexDigit(s.charCodeAt(i * 2));
    const lo = parseHexDigit(s.charCodeAt(i * 2 + 1));
    out[i] = (hi << 4) | lo;
  }
  return out;
}

function parseHexDigit(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 97 + 10;
  if (c >= 65 && c <= 70) return c - 65 + 10;
  throw new Error("invalid hex char");
}

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(b: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const a = b[i]!;
    const c = b[i + 1]!;
    const d = b[i + 2]!;
    out += B64_CHARS[a >> 2];
    out += B64_CHARS[((a & 3) << 4) | (c >> 4)];
    out += B64_CHARS[((c & 15) << 2) | (d >> 6)];
    out += B64_CHARS[d & 63];
  }
  if (i < b.length) {
    const a = b[i]!;
    out += B64_CHARS[a >> 2];
    if (i + 1 < b.length) {
      const c = b[i + 1]!;
      out += B64_CHARS[((a & 3) << 4) | (c >> 4)];
      out += B64_CHARS[(c & 15) << 2];
      out += "=";
    } else {
      out += B64_CHARS[(a & 3) << 4];
      out += "==";
    }
  }
  return out;
}

const B64_LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++)
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

export function base64ToBytes(s: string): Uint8Array {
  s = s.replace(/[\s]/g, "").replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let oi = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64_LOOKUP[s.charCodeAt(i)];
    if (v === undefined || v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[oi++] = (buf >> bits) & 0xff;
    }
  }
  return oi === out.length ? out : out.subarray(0, oi);
}

export function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function bytesToLatin1(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i]!);
  return out;
}
