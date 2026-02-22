import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import {
  type IAgentRuntime,
  type JsonValue,
  ModelType,
  type ObjectGenerationParams,
} from "@elizaos/core";
import {
  type Api,
  getProviders,
  type Model,
  stream,
} from "@mariozechner/pi-ai";
import { createPiAiHandler } from "./model-handler-stream.js";
import type {
  PiAiConfig,
  PiAiHandlerConfig,
  PiAiModelHandlerController,
} from "./model-handler-types.js";

export type {
  PiAiConfig,
  PiAiModelHandlerController,
  StreamEvent,
  StreamEventCallback,
} from "./model-handler-types.js";

/**
 * Register pi-ai as the model provider for an ElizaOS runtime.
 */
export function registerPiAiModelHandler(
  runtime: IAgentRuntime,
  config: PiAiConfig,
): PiAiModelHandlerController {
  let largeModel = config.largeModel;
  let smallModel = config.smallModel;

  const providerName = config.providerName ?? "pi-ai";
  const priority = config.priority ?? 1000;

  const handlerConfig = {
    onStreamEvent: config.onStreamEvent,
    getAbortSignal: config.getAbortSignal,
    getApiKey: config.getApiKey,
    returnTextStreamResult: config.returnTextStreamResult,
    forceStreaming: config.forceStreaming,
  };

  const largeHandler = createPiAiHandler(() => largeModel, handlerConfig);
  const smallHandler = createPiAiHandler(() => smallModel, handlerConfig);
  const largeObjectHandler = createPiAiObjectHandler(
    () => largeModel,
    handlerConfig,
  );
  const smallObjectHandler = createPiAiObjectHandler(
    () => smallModel,
    handlerConfig,
  );

  const aliases = new Set<string>([
    providerName,
    ...(config.providerAliases ?? []),
    ...getProviders(),
  ]);

  for (const alias of aliases) {
    runtime.registerModel(ModelType.TEXT_LARGE, largeHandler, alias, priority);
    runtime.registerModel(ModelType.TEXT_SMALL, smallHandler, alias, priority);
    runtime.registerModel(
      ModelType.OBJECT_LARGE,
      largeObjectHandler,
      alias,
      priority,
    );
    runtime.registerModel(
      ModelType.OBJECT_SMALL,
      smallObjectHandler,
      alias,
      priority,
    );
    runtime.registerModel(
      ModelType.TEXT_REASONING_LARGE,
      largeHandler,
      alias,
      priority,
    );
    runtime.registerModel(
      ModelType.TEXT_REASONING_SMALL,
      smallHandler,
      alias,
      priority,
    );
  }

  const imageDescriptionHandler = createPiAiImageDescriptionHandler(
    () => largeModel,
    handlerConfig,
  );

  for (const alias of aliases) {
    runtime.registerModel(
      ModelType.IMAGE_DESCRIPTION,
      imageDescriptionHandler,
      alias,
      priority,
    );
  }

  return {
    getLargeModel: () => largeModel,
    setLargeModel: (model) => {
      largeModel = model;
    },
    getSmallModel: () => smallModel,
    setSmallModel: (model) => {
      smallModel = model;
    },
  };
}

const BLOCKED_IMAGE_HOST_LITERALS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
]);

const DEFAULT_DNS_TIMEOUT_MS = 5_000;
const MAX_IMAGE_FETCH_BYTES = 50 * 1024 * 1024;

function normalizeHostLike(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isBlockedPrivateOrLinkLocalIp(ip: string): boolean {
  const normalized = normalizeHostLike(ip).split("%")[0];
  const mappedIpv4 = normalized.match(/^::ffff:(.+)$/i)?.[1];

  if (mappedIpv4) {
    if (net.isIP(mappedIpv4) === 4) {
      return isBlockedPrivateOrLinkLocalIp(mappedIpv4);
    }

    const hexMapped = mappedIpv4.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMapped) {
      const high = Number.parseInt(hexMapped[1], 16);
      const low = Number.parseInt(hexMapped[2], 16);
      const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
      return isBlockedPrivateOrLinkLocalIp(ipv4);
    }
  }

  return (
    /^0\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^127\./.test(normalized) ||
    /^169\.254\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^::$/i.test(normalized) ||
    /^::1$/i.test(normalized) ||
    /^fe[89ab][0-9a-f]:/i.test(normalized) ||
    /^f[cd][0-9a-f]{2}:/i.test(normalized)
  );
}

type DnsLookupResult = Awaited<ReturnType<typeof dnsLookup>>;
type DnsLookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<DnsLookupResult>;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function validatePublicImageUrl(
  rawUrl: string,
  options?: {
    dnsLookupFn?: DnsLookupFn;
    dnsTimeoutMs?: number;
  },
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("IMAGE_DESCRIPTION imageUrl must be a valid absolute URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("IMAGE_DESCRIPTION imageUrl must use https://");
  }

  const hostname = normalizeHostLike(parsed.hostname);
  if (!hostname) {
    throw new Error("IMAGE_DESCRIPTION imageUrl hostname is required");
  }

  if (
    BLOCKED_IMAGE_HOST_LITERALS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error(`IMAGE_DESCRIPTION blocked host: ${hostname}`);
  }

  if (net.isIP(hostname) && isBlockedPrivateOrLinkLocalIp(hostname)) {
    throw new Error(`IMAGE_DESCRIPTION blocked host: ${hostname}`);
  }

  if (!net.isIP(hostname)) {
    const lookup = options?.dnsLookupFn ?? dnsLookup;
    const dnsTimeoutMs = options?.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;

    let addresses: Array<{ address: string }>;
    try {
      const resolved = await withTimeout(
        lookup(hostname, { all: true }),
        dnsTimeoutMs,
      );
      addresses = Array.isArray(resolved) ? resolved : [resolved];
    } catch {
      throw new Error(`IMAGE_DESCRIPTION could not resolve host: ${hostname}`);
    }

    if (addresses.length === 0) {
      throw new Error(`IMAGE_DESCRIPTION could not resolve host: ${hostname}`);
    }

    for (const entry of addresses) {
      if (isBlockedPrivateOrLinkLocalIp(entry.address)) {
        throw new Error(
          `IMAGE_DESCRIPTION blocked host ${hostname} resolving to ${entry.address}`,
        );
      }
    }
  }

  return parsed;
}

async function fetchImageWithValidation(
  imageUrl: string,
  options?: {
    fetchImpl?: typeof fetch;
    maxImageBytes?: number;
    dnsLookupFn?: DnsLookupFn;
    dnsTimeoutMs?: number;
  },
): Promise<Response> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const maxImageBytes = options?.maxImageBytes ?? MAX_IMAGE_FETCH_BYTES;
  let currentUrl = await validatePublicImageUrl(imageUrl, {
    dnsLookupFn: options?.dnsLookupFn,
    dnsTimeoutMs: options?.dnsTimeoutMs,
  });

  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    const resp = await fetchImpl(currentUrl.toString(), { redirect: "manual" });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) {
        throw new Error("Image redirect missing Location header");
      }
      currentUrl = await validatePublicImageUrl(
        new URL(location, currentUrl).toString(),
        {
          dnsLookupFn: options?.dnsLookupFn,
          dnsTimeoutMs: options?.dnsTimeoutMs,
        },
      );
      continue;
    }

    const contentLengthHeader = resp.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
        throw new Error(
          `Image too large: ${contentLength} bytes exceeds ${maxImageBytes} byte limit`,
        );
      }
    }

    return resp;
  }

  throw new Error("Too many redirects while fetching image");
}

function parseImageUrl(imageUrl: string): {
  data: string;
  mimeType: string;
} {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  return { data: imageUrl, mimeType: "image/png" };
}

export function createPiAiImageDescriptionHandler(
  getModel: () => Model<Api>,
  config: PiAiHandlerConfig,
  options?: {
    fetchImpl?: typeof fetch;
    streamImpl?: typeof stream;
    maxImageBytes?: number;
    dnsLookupFn?: DnsLookupFn;
    dnsTimeoutMs?: number;
  },
): (
  runtime: IAgentRuntime,
  params: Record<string, JsonValue | object>,
) => Promise<JsonValue | object> {
  return async (
    _runtime: IAgentRuntime,
    params: Record<string, JsonValue | object>,
  ): Promise<JsonValue | object> => {
    const model = getModel();
    const streamImpl = options?.streamImpl ?? stream;

    let imageUrl: string;
    let prompt: string;

    if (typeof params === "string") {
      imageUrl = params;
      prompt = "Analyze this image and describe what you see.";
    } else {
      const p = params as Record<string, unknown>;
      imageUrl = (p.imageUrl ?? p.image_url ?? "") as string;
      prompt = (p.prompt ??
        "Analyze this image and describe what you see.") as string;
    }

    if (!imageUrl) {
      throw new Error("IMAGE_DESCRIPTION requires an imageUrl");
    }

    let imgData: { data: string; mimeType: string };

    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const maxImageBytes = options?.maxImageBytes ?? MAX_IMAGE_FETCH_BYTES;
      const resp = await fetchImageWithValidation(imageUrl, {
        fetchImpl: options?.fetchImpl,
        maxImageBytes,
        dnsLookupFn: options?.dnsLookupFn,
        dnsTimeoutMs: options?.dnsTimeoutMs,
      });
      if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);

      const ct = resp.headers.get("content-type") ?? "";
      const normalizedCt = ct.toLowerCase();
      if (!normalizedCt.startsWith("image/")) {
        throw new Error(
          `Invalid content-type for image fetch: ${ct || "missing"}`,
        );
      }

      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength > maxImageBytes) {
        throw new Error(
          `Image too large: ${buf.byteLength} bytes exceeds ${maxImageBytes} byte limit`,
        );
      }

      imgData = { data: buf.toString("base64"), mimeType: ct || "image/png" };
    } else {
      imgData = parseImageUrl(imageUrl);
    }

    const context = {
      systemPrompt: "",
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            {
              type: "image" as const,
              data: imgData.data,
              mimeType: imgData.mimeType,
            },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const apiKey = await config.getApiKey?.(model.provider);

    let fullText = "";
    try {
      for await (const event of streamImpl(model, context, {
        maxTokens: 4096,
        ...(apiKey ? { apiKey } : {}),
      })) {
        switch (event.type) {
          case "text_delta":
            fullText += event.delta;
            break;
          case "error":
            if (event.reason !== "aborted") {
              throw new Error(
                event.error.errorMessage ?? "Vision model stream error",
              );
            }
            break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `pi-ai IMAGE_DESCRIPTION failed (provider=${model.provider}, model=${model.id}): ${msg}`,
      );
    }

    return {
      title: "Image Analysis",
      description: fullText,
    };
  };
}

function createPiAiObjectHandler(
  getModel: () => Model<Api>,
  config: PiAiHandlerConfig,
): (
  runtime: IAgentRuntime,
  params: Record<string, JsonValue | object>,
) => Promise<JsonValue | object> {
  return async (
    _runtime: IAgentRuntime,
    params: Record<string, JsonValue | object>,
  ): Promise<JsonValue | object> => {
    const model = getModel();
    const p = params as unknown as ObjectGenerationParams;

    if (!p.prompt || p.prompt.trim().length === 0) {
      throw new Error("Object generation requires a non-empty prompt");
    }

    const prompt = `${p.prompt}\n\nReturn ONLY valid JSON with no markdown code fences or extra commentary.`;

    const context = {
      systemPrompt: "",
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: prompt }],
          timestamp: Date.now(),
        },
      ],
    };

    const apiKey = await config.getApiKey?.(model.provider);

    let fullText = "";
    try {
      for await (const event of stream(model, context, {
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        ...(apiKey ? { apiKey } : {}),
      })) {
        switch (event.type) {
          case "text_delta":
            fullText += event.delta;
            break;
          case "error":
            if (event.reason !== "aborted") {
              throw new Error(event.error.errorMessage ?? "Model stream error");
            }
            break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `pi-ai OBJECT generation failed (provider=${model.provider}, model=${model.id}): ${msg}`,
      );
    }

    return parseJsonObjectResponse(fullText);
  };
}

function parseJsonObjectResponse(raw: string): JsonValue | object {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Object generation returned empty response");
  }

  const candidates: string[] = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fence?.trim()) {
    candidates.push(fence.trim());
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }

  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    candidates.push(trimmed.slice(firstArray, lastArray + 1));
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as JsonValue | object;
      }
    } catch {
      // Continue trying alternate candidate slices.
    }
  }

  throw new Error(
    `Object generation returned non-JSON content: ${trimmed.slice(0, 300)}`,
  );
}
