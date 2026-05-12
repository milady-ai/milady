// node:util — promisify, inspect, format, types. Focused on the common subset.

export function promisify<T = unknown>(
  fn: (...args: unknown[]) => unknown,
): (...args: unknown[]) => Promise<T> {
  return function promisified(...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      fn(...args, (err: unknown, ...rest: unknown[]) => {
        if (err) reject(err);
        else resolve(rest[0] as T);
      });
    });
  };
}

export function callbackify<T>(
  fn: (...args: unknown[]) => Promise<T>,
): (...args: unknown[]) => void {
  return function callbackified(...args: unknown[]): void {
    const cb = args.pop() as (err: unknown, value?: T) => void;
    if (typeof cb !== "function") {
      throw new TypeError("last argument must be a callback");
    }
    fn(...args).then(
      (v) => cb(null, v),
      (err) => cb(err),
    );
  };
}

export function format(...all: unknown[]): string {
  const template = all[0];
  const args = all.slice(1);
  if (typeof template !== "string") {
    const parts: string[] = [];
    if (template !== undefined) parts.push(inspect(template));
    for (const a of args) parts.push(inspect(a));
    return parts.join(" ");
  }
  let i = 0;
  let result = "";
  for (let p = 0; p < template.length; p++) {
    if (template.charCodeAt(p) === 37 && p + 1 < template.length) {
      const spec = template[++p]!;
      if (i >= args.length) {
        result += "%" + spec;
        continue;
      }
      const arg = args[i++];
      switch (spec) {
        case "s":
          result += String(arg);
          break;
        case "d":
        case "i":
          result += String(Number(arg));
          break;
        case "f":
          result += String(parseFloat(String(arg)));
          break;
        case "j":
          try {
            result += JSON.stringify(arg);
          } catch {
            result += "[Circular]";
          }
          break;
        case "o":
        case "O":
          result += inspect(arg);
          break;
        case "%":
          result += "%";
          i--;
          break;
        default:
          result += "%" + spec;
          i--;
      }
    } else {
      result += template[p];
    }
  }
  for (; i < args.length; i++) {
    result += " " + inspect(args[i]);
  }
  return result;
}

export interface InspectOptions {
  depth?: number;
  colors?: boolean;
  showHidden?: boolean;
  maxArrayLength?: number;
  maxStringLength?: number;
}

export function inspect(value: unknown, opts: InspectOptions = {}): string {
  const depth = opts.depth ?? 2;
  const maxArrayLength = opts.maxArrayLength ?? 100;
  const maxStringLength = opts.maxStringLength ?? 10000;
  const seen = new WeakSet<object>();

  function fmt(v: unknown, d: number): string {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    const t = typeof v;
    if (t === "string") {
      const s = v as string;
      if (s.length > maxStringLength)
        return JSON.stringify(s.slice(0, maxStringLength)) + "...";
      return JSON.stringify(s);
    }
    if (t === "number" || t === "boolean" || t === "bigint" || t === "symbol")
      return String(v);
    if (t === "function") {
      const name = (v as Function).name;
      return `[Function${name ? ": " + name : " (anonymous)"}]`;
    }
    if (d < 0) {
      if (Array.isArray(v)) return "[Array]";
      return "[Object]";
    }
    if (v instanceof Error) {
      return v.stack ?? `${v.name}: ${v.message}`;
    }
    if (v instanceof Date) return v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (v instanceof Uint8Array) {
      const hex: string[] = [];
      for (let i = 0; i < Math.min(v.length, 16); i++) {
        hex.push(v[i]!.toString(16).padStart(2, "0"));
      }
      return `<Buffer ${hex.join(" ")}${v.length > 16 ? "..." : ""}>`;
    }
    if (Array.isArray(v)) {
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);
      const items = (v as unknown[]).slice(0, maxArrayLength).map((x) => fmt(x, d - 1));
      if ((v as unknown[]).length > maxArrayLength) items.push(`... ${(v as unknown[]).length - maxArrayLength} more items`);
      return "[ " + items.join(", ") + " ]";
    }
    if (typeof v === "object") {
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      const items = keys.map((k) => `${k}: ${fmt(o[k], d - 1)}`);
      return "{ " + items.join(", ") + " }";
    }
    return String(v);
  }

  return fmt(value, depth);
}

export const types = {
  isPromise(v: unknown): boolean {
    return v !== null && typeof v === "object" && typeof (v as { then?: unknown }).then === "function";
  },
  isMap(v: unknown): boolean {
    return v instanceof Map;
  },
  isSet(v: unknown): boolean {
    return v instanceof Set;
  },
  isRegExp(v: unknown): boolean {
    return v instanceof RegExp;
  },
  isDate(v: unknown): boolean {
    return v instanceof Date;
  },
  isArrayBuffer(v: unknown): boolean {
    return v instanceof ArrayBuffer;
  },
  isUint8Array(v: unknown): boolean {
    return v instanceof Uint8Array;
  },
  isTypedArray(v: unknown): boolean {
    return ArrayBuffer.isView(v) && !(v instanceof DataView);
  },
  isAsyncFunction(v: unknown): boolean {
    return typeof v === "function" && v.constructor && (v.constructor as { name?: string }).name === "AsyncFunction";
  },
  isNativeError(v: unknown): boolean {
    return v instanceof Error;
  },
};

export function deprecate<T extends (...args: unknown[]) => unknown>(fn: T, msg: string): T {
  let warned = false;
  return function deprecated(this: unknown, ...args: unknown[]) {
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn("DeprecationWarning: " + msg);
    }
    return (fn as unknown as (...a: unknown[]) => unknown).apply(this, args);
  } as T;
}

export function inherits(ctor: { prototype: object; super_?: unknown }, superCtor: { prototype: object }): void {
  ctor.super_ = superCtor;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

export const debuglog = (_section: string) => {
  return (..._args: unknown[]) => {
    // disabled by default
  };
};

export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

export default {
  promisify,
  callbackify,
  format,
  inspect,
  types,
  deprecate,
  inherits,
  debuglog,
  TextEncoder,
  TextDecoder,
};
