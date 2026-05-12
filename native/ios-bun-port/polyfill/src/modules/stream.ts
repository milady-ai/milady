// Minimal Node stream surface. We don't implement the full state machine —
// just the surface most agent code touches: Readable (push + 'data'/'end'),
// Writable (write + 'finish'), Transform, PassThrough, pipeline().

import { EventEmitter } from "./events.js";

type Chunk = Uint8Array | string | null;

export interface ReadableOptions {
  highWaterMark?: number;
  encoding?: string;
  objectMode?: boolean;
  read?: (this: Readable, size: number) => void;
}

export class Readable extends EventEmitter {
  readable = true;
  destroyed = false;
  private _buffer: Chunk[] = [];
  private _ended = false;
  private _reading = false;
  private _encoding: string | null = null;
  private _flowing: boolean | null = null;
  private _readImpl?: (this: Readable, size: number) => void;

  constructor(opts: ReadableOptions = {}) {
    super();
    this._readImpl = opts.read;
    if (opts.encoding) this._encoding = opts.encoding;
  }

  _read(size: number): void {
    if (this._readImpl) this._readImpl.call(this, size);
  }

  push(chunk: Chunk): boolean {
    if (chunk === null) {
      this._ended = true;
      // flush
      if (this._flowing) this._flushBuffer();
      this.emit("end");
      return false;
    }
    this._buffer.push(chunk);
    if (this._flowing) this._flushBuffer();
    else this.emit("readable");
    return true;
  }

  read(size?: number): Chunk {
    if (this._buffer.length === 0) {
      if (!this._ended && !this._reading) {
        this._reading = true;
        try {
          this._read(size ?? 16384);
        } finally {
          this._reading = false;
        }
      }
      if (this._buffer.length === 0) return null;
    }
    return this._buffer.shift() ?? null;
  }

  private _flushBuffer(): void {
    while (this._buffer.length > 0) {
      const chunk = this._buffer.shift()!;
      this.emit("data", chunk);
    }
    if (this._ended) this.emit("end");
  }

  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    super.on(event, listener);
    if (event === "data") {
      this._flowing = true;
      this._flushBuffer();
      if (!this._ended && !this._reading) {
        Promise.resolve().then(() => {
          if (!this._reading && this._flowing && !this._ended) {
            this._reading = true;
            try {
              this._read(16384);
            } finally {
              this._reading = false;
            }
          }
        });
      }
    }
    return this;
  }

  pause(): this {
    this._flowing = false;
    return this;
  }

  resume(): this {
    this._flowing = true;
    this._flushBuffer();
    return this;
  }

  pipe<T extends Writable>(dest: T): T {
    this.on("data", (chunk) => dest.write(chunk as Uint8Array | string));
    this.on("end", () => dest.end());
    this.on("error", (err) => dest.emit("error", err));
    return dest;
  }

  destroy(err?: Error): this {
    this.destroyed = true;
    if (err) this.emit("error", err);
    this.emit("close");
    return this;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Chunk> {
    while (true) {
      const chunk = this.read();
      if (chunk !== null) {
        yield chunk;
        continue;
      }
      if (this._ended) return;
      await new Promise<void>((resolve) => {
        this.once("readable", () => resolve());
        this.once("end", () => resolve());
      });
    }
  }

  static from(iterable: Iterable<Chunk> | AsyncIterable<Chunk>): Readable {
    const r = new Readable({});
    (async () => {
      try {
        for await (const chunk of iterable as AsyncIterable<Chunk>) r.push(chunk);
        r.push(null);
      } catch (err) {
        r.emit("error", err);
      }
    })();
    return r;
  }
}

export interface WritableOptions {
  highWaterMark?: number;
  objectMode?: boolean;
  write?: (
    this: Writable,
    chunk: Chunk,
    encoding: string,
    callback: (err?: Error | null) => void,
  ) => void;
  final?: (this: Writable, callback: (err?: Error | null) => void) => void;
}

export class Writable extends EventEmitter {
  writable = true;
  destroyed = false;
  private _writeImpl?: (
    this: Writable,
    chunk: Chunk,
    encoding: string,
    callback: (err?: Error | null) => void,
  ) => void;
  private _finalImpl?: (
    this: Writable,
    callback: (err?: Error | null) => void,
  ) => void;
  private _ended = false;
  private _writing = false;
  private _queue: { chunk: Chunk; encoding: string; cb: (err?: Error | null) => void }[] = [];

  constructor(opts: WritableOptions = {}) {
    super();
    this._writeImpl = opts.write;
    this._finalImpl = opts.final;
  }

  _write(chunk: Chunk, encoding: string, callback: (err?: Error | null) => void): void {
    if (this._writeImpl) this._writeImpl.call(this, chunk, encoding, callback);
    else callback();
  }

  _final(callback: (err?: Error | null) => void): void {
    if (this._finalImpl) this._finalImpl.call(this, callback);
    else callback();
  }

  write(
    chunk: Chunk,
    encodingOrCb?: string | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ): boolean {
    const encoding = typeof encodingOrCb === "string" ? encodingOrCb : "utf8";
    const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb ?? noop;
    if (this._ended) {
      callback(new Error("write after end"));
      return false;
    }
    this._queue.push({ chunk, encoding, cb: callback });
    this._drain();
    return true;
  }

  private _drain(): void {
    if (this._writing) return;
    const next = this._queue.shift();
    if (!next) return;
    this._writing = true;
    this._write(next.chunk, next.encoding, (err) => {
      this._writing = false;
      next.cb(err);
      if (err) this.emit("error", err);
      else this._drain();
      if (this._queue.length === 0 && this._ended) this._finish();
    });
  }

  end(
    chunk?: Chunk | ((err?: Error | null) => void),
    encoding?: string,
    cb?: (err?: Error | null) => void,
  ): this {
    if (typeof chunk === "function") {
      cb = chunk as (err?: Error | null) => void;
      chunk = undefined;
    }
    if (chunk !== undefined && chunk !== null) this.write(chunk as Chunk, encoding, cb);
    this._ended = true;
    if (!this._writing && this._queue.length === 0) this._finish();
    return this;
  }

  private _finish(): void {
    this._final((err) => {
      if (err) this.emit("error", err);
      else this.emit("finish");
    });
  }

  destroy(err?: Error): this {
    this.destroyed = true;
    if (err) this.emit("error", err);
    this.emit("close");
    return this;
  }
}

function noop(): void {
  // no-op
}

export class Duplex extends Readable {
  writable = true;
  // Minimal: composes a Writable on top of Readable. Most agent code never
  // needs full duplex, so we keep it light.
  private _writable: Writable;

  constructor(opts: ReadableOptions & WritableOptions = {}) {
    super(opts);
    this._writable = new Writable(opts);
    this._writable.on("finish", () => this.emit("finish"));
    this._writable.on("error", (err) => this.emit("error", err));
  }

  write(chunk: Chunk, encoding?: string | ((err?: Error | null) => void), cb?: (err?: Error | null) => void): boolean {
    return this._writable.write(chunk, encoding, cb);
  }

  end(chunk?: Chunk, encoding?: string, cb?: (err?: Error | null) => void): this {
    this._writable.end(chunk, encoding, cb);
    return this;
  }
}

export interface TransformOptions extends ReadableOptions, WritableOptions {
  transform?: (
    this: Transform,
    chunk: Chunk,
    encoding: string,
    callback: (err?: Error | null, data?: Chunk) => void,
  ) => void;
  flush?: (this: Transform, callback: (err?: Error | null, data?: Chunk) => void) => void;
}

export class Transform extends Readable {
  writable = true;
  private _transformImpl?: TransformOptions["transform"];
  private _flushImpl?: TransformOptions["flush"];
  private _writeEnded = false;

  constructor(opts: TransformOptions = {}) {
    super(opts);
    this._transformImpl = opts.transform;
    this._flushImpl = opts.flush;
  }

  _transform(chunk: Chunk, encoding: string, callback: (err?: Error | null, data?: Chunk) => void): void {
    if (this._transformImpl) this._transformImpl.call(this, chunk, encoding, callback);
    else callback(null, chunk);
  }

  _flush(callback: (err?: Error | null, data?: Chunk) => void): void {
    if (this._flushImpl) this._flushImpl.call(this, callback);
    else callback();
  }

  write(chunk: Chunk, encoding?: string | ((err?: Error | null) => void), cb?: (err?: Error | null) => void): boolean {
    const enc = typeof encoding === "string" ? encoding : "utf8";
    const callback = typeof encoding === "function" ? encoding : cb ?? noop;
    if (this._writeEnded) {
      callback(new Error("write after end"));
      return false;
    }
    this._transform(chunk, enc, (err, data) => {
      if (err) {
        this.emit("error", err);
        callback(err);
        return;
      }
      if (data !== undefined && data !== null) this.push(data);
      callback();
    });
    return true;
  }

  end(chunk?: Chunk, encoding?: string, cb?: (err?: Error | null) => void): this {
    if (chunk !== undefined && chunk !== null) this.write(chunk, encoding, cb);
    this._writeEnded = true;
    this._flush((err, data) => {
      if (err) this.emit("error", err);
      if (data !== undefined && data !== null) this.push(data);
      this.push(null);
      this.emit("finish");
    });
    return this;
  }
}

export class PassThrough extends Transform {
  constructor(opts: TransformOptions = {}) {
    super({ ...opts, transform: (chunk, _enc, cb) => cb(null, chunk) });
  }
}

export function pipeline(
  ...args: (Readable | Writable | ((err?: Error | null) => void))[]
): Writable {
  const cb = typeof args[args.length - 1] === "function"
    ? (args.pop() as (err?: Error | null) => void)
    : noop;
  const streams = args as (Readable | Writable)[];
  if (streams.length < 2) {
    cb(new Error("pipeline requires at least 2 streams"));
    return streams[streams.length - 1] as Writable;
  }
  let current = streams[0]!;
  for (let i = 1; i < streams.length; i++) {
    (current as Readable).pipe(streams[i] as Writable);
    current = streams[i]!;
  }
  (current as Writable).on("finish", () => cb());
  (current as Writable).on("error", (err) => cb(err as Error));
  return current as Writable;
}

export function finished(stream: Readable | Writable, cb: (err?: Error | null) => void): void {
  let done = false;
  const finish = (err?: Error | null) => {
    if (done) return;
    done = true;
    cb(err);
  };
  stream.on("end", () => finish());
  stream.on("finish", () => finish());
  stream.on("error", (err) => finish(err as Error));
  stream.on("close", () => finish());
}

export default {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  pipeline,
  finished,
};
