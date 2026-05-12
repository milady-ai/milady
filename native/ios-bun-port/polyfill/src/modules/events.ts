// node:events — faithful EventEmitter without prototypal cleverness.

export type Listener = (...args: unknown[]) => void;

interface ListenerEntry {
  fn: Listener;
  once: boolean;
}

export class EventEmitter {
  private _events: Map<string | symbol, ListenerEntry[]> = new Map();
  private _maxListeners = 10;

  static defaultMaxListeners = 10;
  static captureRejections = false;

  setMaxListeners(n: number): this {
    if (typeof n !== "number" || n < 0)
      throw new TypeError("n must be a non-negative number");
    this._maxListeners = n;
    return this;
  }

  getMaxListeners(): number {
    return this._maxListeners;
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const list = this._events.get(event);
    if (!list || list.length === 0) {
      if (event === "error") {
        const err = args[0];
        if (err instanceof Error) throw err;
        throw new Error("Unhandled error event");
      }
      return false;
    }
    // Copy to allow listeners to mutate the list during emit.
    const copy = list.slice();
    for (const entry of copy) {
      try {
        entry.fn.apply(this, args);
      } catch (err) {
        // Match Node semantics: re-throw async (don't suppress).
        Promise.resolve().then(() => {
          throw err;
        });
      }
      if (entry.once) this.removeListener(event, entry.fn);
    }
    return true;
  }

  on(event: string | symbol, listener: Listener): this {
    return this.addListener(event, listener);
  }

  addListener(event: string | symbol, listener: Listener): this {
    if (typeof listener !== "function")
      throw new TypeError("listener must be a function");
    let list = this._events.get(event);
    if (!list) {
      list = [];
      this._events.set(event, list);
    }
    list.push({ fn: listener, once: false });
    this.emit("newListener", event, listener);
    return this;
  }

  once(event: string | symbol, listener: Listener): this {
    if (typeof listener !== "function")
      throw new TypeError("listener must be a function");
    let list = this._events.get(event);
    if (!list) {
      list = [];
      this._events.set(event, list);
    }
    list.push({ fn: listener, once: true });
    return this;
  }

  prependListener(event: string | symbol, listener: Listener): this {
    let list = this._events.get(event);
    if (!list) {
      list = [];
      this._events.set(event, list);
    }
    list.unshift({ fn: listener, once: false });
    return this;
  }

  prependOnceListener(event: string | symbol, listener: Listener): this {
    let list = this._events.get(event);
    if (!list) {
      list = [];
      this._events.set(event, list);
    }
    list.unshift({ fn: listener, once: true });
    return this;
  }

  off(event: string | symbol, listener: Listener): this {
    return this.removeListener(event, listener);
  }

  removeListener(event: string | symbol, listener: Listener): this {
    const list = this._events.get(event);
    if (!list) return this;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.fn === listener) {
        list.splice(i, 1);
        this.emit("removeListener", event, listener);
        break;
      }
    }
    if (list.length === 0) this._events.delete(event);
    return this;
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) {
      this._events.clear();
    } else {
      this._events.delete(event);
    }
    return this;
  }

  listeners(event: string | symbol): Listener[] {
    return (this._events.get(event) ?? []).map((e) => e.fn);
  }

  rawListeners(event: string | symbol): Listener[] {
    return this.listeners(event);
  }

  listenerCount(event: string | symbol): number {
    return this._events.get(event)?.length ?? 0;
  }

  eventNames(): (string | symbol)[] {
    return Array.from(this._events.keys());
  }
}

export function once(
  emitter: EventEmitter,
  event: string | symbol,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const onEvent = (...args: unknown[]) => {
      emitter.removeListener("error", onError);
      resolve(args);
    };
    const onError = (err: unknown) => {
      emitter.removeListener(event, onEvent);
      reject(err);
    };
    emitter.once(event, onEvent);
    if (event !== "error") emitter.once("error", onError);
  });
}

export default Object.assign(EventEmitter, {
  EventEmitter,
  once,
  defaultMaxListeners: 10,
});
