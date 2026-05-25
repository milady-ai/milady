export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function requireString(record: Record<string, unknown>, key: string): string {
  const value = readString(record, key);
  if (!value) throw new Error(`Missing or invalid string: ${key}`);
  return value;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error(`${label} timed out after ${ms}ms`)), { once: true });
    }),
  ]).finally(() => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  });
}
