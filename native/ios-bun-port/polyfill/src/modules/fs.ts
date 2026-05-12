// node:fs over __MILADY_BRIDGE__. Sync + promises surface. Streams are minimal:
// createReadStream / createWriteStream are buffered (no chunked I/O on the
// host side in v1).

import { getBridge } from "../bridge.js";
import { utf8ToBytes, bytesToUtf8 } from "../encoding.js";
import { Readable, Writable } from "./stream.js";

type EncodingArg =
  | "utf8"
  | "utf-8"
  | "ascii"
  | "base64"
  | "hex"
  | "binary"
  | "latin1"
  | "buffer"
  | null
  | undefined
  | { encoding?: string | null; flag?: string; mode?: number; recursive?: boolean };

function resolveEncoding(arg: EncodingArg): string | null {
  if (arg === null || arg === undefined) return null;
  if (typeof arg === "string") return arg;
  if (typeof arg === "object" && "encoding" in arg) return arg.encoding ?? null;
  return null;
}

function bridgeError(prefix: string): Error {
  const msg = getBridge().fs_last_error() ?? "unknown";
  return new Error(`${prefix}: ${msg}`);
}

// ── Sync ────────────────────────────────────────────────────────────────

export function readFileSync(path: string, options?: EncodingArg): string | Uint8Array {
  const enc = resolveEncoding(options);
  if (enc && enc !== "buffer") {
    const text = getBridge().fs_read_text(path, enc === "ascii" ? "ascii" : "utf8");
    if (text === null) throw bridgeError(`ENOENT: no such file '${path}'`);
    return text;
  }
  const bytes = getBridge().fs_read_bytes(path);
  if (bytes === null) throw bridgeError(`ENOENT: no such file '${path}'`);
  return bytes;
}

export function writeFileSync(
  path: string,
  data: string | Uint8Array,
  options?: EncodingArg,
): void {
  const enc = resolveEncoding(options);
  if (typeof data === "string") {
    if (enc === "buffer" || enc === "base64" || enc === "hex") {
      // Treat as binary
      const bytes = utf8ToBytes(data);
      if (!getBridge().fs_write_bytes(path, bytes)) throw bridgeError(`EIO writing '${path}'`);
    } else {
      if (!getBridge().fs_write_text(path, data)) throw bridgeError(`EIO writing '${path}'`);
    }
  } else {
    if (!getBridge().fs_write_bytes(path, data)) throw bridgeError(`EIO writing '${path}'`);
  }
}

export function appendFileSync(
  path: string,
  data: string | Uint8Array,
  _options?: EncodingArg,
): void {
  const str = typeof data === "string" ? data : bytesToUtf8(data);
  if (!getBridge().fs_append_text(path, str)) throw bridgeError(`EIO appending '${path}'`);
}

export function existsSync(path: string): boolean {
  return getBridge().fs_exists(path);
}

export function mkdirSync(path: string, options?: { recursive?: boolean; mode?: number } | number): void {
  const recursive = typeof options === "object" && options !== null ? Boolean(options.recursive) : false;
  if (!getBridge().fs_mkdir(path, recursive)) throw bridgeError(`EIO mkdir '${path}'`);
}

export interface Dirent {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isCharacterDevice(): boolean;
  isBlockDevice(): boolean;
  isSocket(): boolean;
}

export function readdirSync(
  path: string,
  options?: { withFileTypes?: boolean; encoding?: string | null } | string,
): string[] | Dirent[] {
  const entries = getBridge().fs_readdir(path);
  if (entries === null) throw bridgeError(`ENOENT readdir '${path}'`);
  const withFileTypes = typeof options === "object" && options !== null ? Boolean(options.withFileTypes) : false;
  if (!withFileTypes) return entries;
  return entries.map((name) => {
    const full = path.endsWith("/") ? path + name : path + "/" + name;
    const stat = getBridge().fs_stat(full);
    return {
      name,
      isFile: () => Boolean(stat?.is_file),
      isDirectory: () => Boolean(stat?.is_directory),
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isCharacterDevice: () => false,
      isBlockDevice: () => false,
      isSocket: () => false,
    };
  });
}

export interface Stats {
  size: number;
  mtime: Date;
  mtimeMs: number;
  atime: Date;
  atimeMs: number;
  ctime: Date;
  ctimeMs: number;
  birthtime: Date;
  birthtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSocket(): boolean;
  mode: number;
  uid: number;
  gid: number;
  dev: number;
  ino: number;
  nlink: number;
  rdev: number;
  blksize: number;
  blocks: number;
}

function bridgeStatToNodeStat(s: NonNullable<ReturnType<ReturnType<typeof getBridge>["fs_stat"]>>): Stats {
  const ms = s.mtime_ms;
  const date = new Date(ms);
  return {
    size: s.size,
    mtime: date,
    mtimeMs: ms,
    atime: date,
    atimeMs: ms,
    ctime: date,
    ctimeMs: ms,
    birthtime: date,
    birthtimeMs: ms,
    isFile: () => s.is_file,
    isDirectory: () => s.is_directory,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSocket: () => false,
    mode: s.is_directory ? 0o040755 : 0o100644,
    uid: 0,
    gid: 0,
    dev: 0,
    ino: 0,
    nlink: 1,
    rdev: 0,
    blksize: 4096,
    blocks: Math.ceil(s.size / 512),
  };
}

export function statSync(path: string, options?: { throwIfNoEntry?: boolean }): Stats {
  const s = getBridge().fs_stat(path);
  if (!s) {
    if (options && options.throwIfNoEntry === false) return undefined as unknown as Stats;
    throw bridgeError(`ENOENT stat '${path}'`);
  }
  return bridgeStatToNodeStat(s);
}

export const lstatSync = statSync;

export function unlinkSync(path: string): void {
  if (!getBridge().fs_remove(path, false)) throw bridgeError(`EIO unlink '${path}'`);
}

export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
  const recursive = options?.recursive ?? false;
  const force = options?.force ?? false;
  if (force && !getBridge().fs_exists(path)) return;
  if (!getBridge().fs_remove(path, recursive)) {
    if (force) return;
    throw bridgeError(`EIO rm '${path}'`);
  }
}

export function rmdirSync(path: string, options?: { recursive?: boolean }): void {
  rmSync(path, { recursive: options?.recursive ?? false });
}

export function renameSync(from: string, to: string): void {
  if (!getBridge().fs_rename(from, to)) throw bridgeError(`EIO rename '${from}' -> '${to}'`);
}

export function copyFileSync(from: string, to: string): void {
  if (!getBridge().fs_copy(from, to)) throw bridgeError(`EIO copy '${from}' -> '${to}'`);
}

export function realpathSync(path: string): string {
  if (!getBridge().fs_exists(path)) throw bridgeError(`ENOENT realpath '${path}'`);
  return path;
}

export function accessSync(path: string, _mode?: number): void {
  if (!getBridge().fs_exists(path)) throw bridgeError(`ENOENT access '${path}'`);
}

export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  COPYFILE_EXCL: 1,
  COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE_FORCE: 4,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_TRUNC: 512,
  O_APPEND: 1024,
};

// ── Async (callback style) ──────────────────────────────────────────────

function asAsync<T>(fn: () => T, cb: (err: Error | null, value?: T) => void): void {
  Promise.resolve().then(() => {
    try {
      cb(null, fn());
    } catch (err) {
      cb(err as Error);
    }
  });
}

export function readFile(
  path: string,
  optionsOrCb: EncodingArg | ((err: Error | null, data?: string | Uint8Array) => void),
  cb?: (err: Error | null, data?: string | Uint8Array) => void,
): void {
  const opts = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  asAsync(() => readFileSync(path, opts), callback);
}

export function writeFile(
  path: string,
  data: string | Uint8Array,
  optionsOrCb: EncodingArg | ((err: Error | null) => void),
  cb?: (err: Error | null) => void,
): void {
  const opts = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  asAsync(() => writeFileSync(path, data, opts), callback);
}

export function appendFile(
  path: string,
  data: string | Uint8Array,
  optionsOrCb: EncodingArg | ((err: Error | null) => void),
  cb?: (err: Error | null) => void,
): void {
  const opts = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  asAsync(() => appendFileSync(path, data, opts), callback);
}

export function mkdir(
  path: string,
  optionsOrCb: { recursive?: boolean; mode?: number } | number | ((err: Error | null) => void),
  cb?: (err: Error | null) => void,
): void {
  const opts = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  asAsync(() => mkdirSync(path, opts), callback);
}

export function readdir(
  path: string,
  optionsOrCb: { withFileTypes?: boolean } | string | ((err: Error | null, entries?: string[] | Dirent[]) => void),
  cb?: (err: Error | null, entries?: string[] | Dirent[]) => void,
): void {
  const opts = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  asAsync(() => readdirSync(path, opts), callback);
}

export function stat(path: string, cb: (err: Error | null, s?: Stats) => void): void {
  asAsync(() => statSync(path), cb);
}

export function unlink(path: string, cb: (err: Error | null) => void): void {
  asAsync(() => unlinkSync(path), cb);
}

export function rm(
  path: string,
  optionsOrCb: { recursive?: boolean; force?: boolean } | ((err: Error | null) => void),
  cb?: (err: Error | null) => void,
): void {
  const opts = typeof optionsOrCb === "function" ? undefined : optionsOrCb;
  const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb!;
  asAsync(() => rmSync(path, opts), callback);
}

export function rename(from: string, to: string, cb: (err: Error | null) => void): void {
  asAsync(() => renameSync(from, to), cb);
}

export function copyFile(from: string, to: string, cb: (err: Error | null) => void): void {
  asAsync(() => copyFileSync(from, to), cb);
}

export function exists(path: string, cb: (e: boolean) => void): void {
  Promise.resolve().then(() => cb(existsSync(path)));
}

export function access(path: string, modeOrCb: number | ((err: Error | null) => void), cb?: (err: Error | null) => void): void {
  const callback = typeof modeOrCb === "function" ? modeOrCb : cb!;
  asAsync(() => accessSync(path), callback);
}

// ── Promises ────────────────────────────────────────────────────────────

export const promises = {
  async readFile(path: string, options?: EncodingArg): Promise<string | Uint8Array> {
    return readFileSync(path, options);
  },
  async writeFile(path: string, data: string | Uint8Array, options?: EncodingArg): Promise<void> {
    writeFileSync(path, data, options);
  },
  async appendFile(path: string, data: string | Uint8Array, options?: EncodingArg): Promise<void> {
    appendFileSync(path, data, options);
  },
  async mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined> {
    mkdirSync(path, options);
    return options?.recursive ? path : undefined;
  },
  async readdir(
    path: string,
    options?: { withFileTypes?: boolean },
  ): Promise<string[] | Dirent[]> {
    return readdirSync(path, options);
  },
  async stat(path: string): Promise<Stats> {
    return statSync(path);
  },
  async lstat(path: string): Promise<Stats> {
    return statSync(path);
  },
  async unlink(path: string): Promise<void> {
    unlinkSync(path);
  },
  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    rmSync(path, options);
  },
  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    rmdirSync(path, options);
  },
  async rename(from: string, to: string): Promise<void> {
    renameSync(from, to);
  },
  async copyFile(from: string, to: string): Promise<void> {
    copyFileSync(from, to);
  },
  async realpath(path: string): Promise<string> {
    return realpathSync(path);
  },
  async access(path: string): Promise<void> {
    accessSync(path);
  },
  async open(path: string, _flags?: string | number): Promise<FileHandle> {
    return new FileHandle(path);
  },
};

export class FileHandle {
  constructor(private path: string) {}
  async readFile(opts?: EncodingArg): Promise<string | Uint8Array> {
    return readFileSync(this.path, opts);
  }
  async writeFile(data: string | Uint8Array): Promise<void> {
    writeFileSync(this.path, data);
  }
  async appendFile(data: string | Uint8Array): Promise<void> {
    appendFileSync(this.path, data);
  }
  async stat(): Promise<Stats> {
    return statSync(this.path);
  }
  async close(): Promise<void> {
    // no-op
  }
}

// ── Streams ─────────────────────────────────────────────────────────────

export function createReadStream(path: string, _options?: { encoding?: string; start?: number; end?: number }): Readable {
  const r = new Readable({});
  Promise.resolve().then(() => {
    try {
      const bytes = getBridge().fs_read_bytes(path);
      if (bytes === null) {
        r.emit("error", bridgeError(`ENOENT '${path}'`));
        return;
      }
      r.push(bytes);
      r.push(null);
    } catch (err) {
      r.emit("error", err as Error);
    }
  });
  return r;
}

export function createWriteStream(path: string, _options?: { encoding?: string; flags?: string }): Writable {
  const chunks: Uint8Array[] = [];
  return new Writable({
    write(chunk, _encoding, cb) {
      if (typeof chunk === "string") chunks.push(utf8ToBytes(chunk));
      else if (chunk instanceof Uint8Array) chunks.push(chunk);
      cb();
    },
    final(cb) {
      try {
        let total = 0;
        for (const c of chunks) total += c.length;
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.length;
        }
        if (!getBridge().fs_write_bytes(path, merged)) cb(bridgeError(`EIO write stream '${path}'`));
        else cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

export function watch(_path: string, _opts?: unknown, _listener?: unknown): never {
  throw new Error("fs.watch is not supported on iOS JSC (no kqueue/fsevents bridge in v1)");
}

export function watchFile(_path: string, _opts?: unknown, _listener?: unknown): never {
  throw new Error("fs.watchFile is not supported on iOS JSC");
}

export function unwatchFile(_path: string, _listener?: unknown): never {
  throw new Error("fs.unwatchFile is not supported on iOS JSC");
}

export default {
  // sync
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  lstatSync,
  unlinkSync,
  rmSync,
  rmdirSync,
  renameSync,
  copyFileSync,
  realpathSync,
  accessSync,
  // async (callback)
  readFile,
  writeFile,
  appendFile,
  mkdir,
  readdir,
  stat,
  unlink,
  rm,
  rename,
  copyFile,
  exists,
  access,
  // streams
  createReadStream,
  createWriteStream,
  watch,
  watchFile,
  unwatchFile,
  // promises
  promises,
  // constants
  constants,
};
