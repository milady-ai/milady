export type JsonRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function requestJson<T>(url: URL, options: JsonRequestOptions = {}): Promise<T> {
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(`Blocked non-HTTPS request to ${url.hostname}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url.hostname}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
