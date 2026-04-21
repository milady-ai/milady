import { describe, expect, test, vi } from "vitest";
import type { TtsRouteContext } from "../../src/api/tts-routes";
import { handleTtsRoutes } from "../../src/api/tts-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildCtx(overrides: Partial<TtsRouteContext> = {}): TtsRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method: "GET", url: "/api/tts/config" }),
    res,
    method: "GET",
    pathname: "/api/tts/config",
    state: { config: {} as TtsRouteContext["state"]["config"] },
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, message, status = 500) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
    isRedactedSecretValue: vi.fn((value) => value === "[REDACTED]"),
    fetchWithTimeoutGuard: vi.fn() as never,
    streamResponseBodyWithByteLimit: vi.fn() as never,
    responseContentLength: vi.fn(() => null),
    isAbortError: vi.fn(() => false),
    ELEVENLABS_FETCH_TIMEOUT_MS: 10_000,
    ELEVENLABS_AUDIO_MAX_BYTES: 5_000_000,
    ...overrides,
  };
}

describe("handleTtsRoutes", () => {
  test("GET /api/tts/config returns sanitized stored config", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      res,
      state: {
        config: {
          messages: {
            tts: {
              provider: "edge",
              mode: "final",
              auto: "always",
              enabled: true,
              elevenlabs: {
                apiKey: "secret-key",
                voiceId: "voice-123",
                modelId: "eleven_flash_v2_5",
                voiceSettings: {
                  stability: 0.4,
                  similarityBoost: 0.8,
                  speed: 1.1,
                },
              },
              edge: {
                voice: "en-US-JennyNeural",
                lang: "en-US",
                rate: "+0%",
                pitch: "+0Hz",
                volume: "+0%",
              },
            },
          },
        } as TtsRouteContext["state"]["config"],
      },
    });

    const handled = await handleTtsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      provider: "edge",
      mode: "final",
      auto: "always",
      enabled: true,
      elevenlabs: {
        apiKey: "[REDACTED]",
        voiceId: "voice-123",
        modelId: "eleven_flash_v2_5",
        stability: 0.4,
        similarityBoost: 0.8,
        speed: 1.1,
      },
      edge: {
        voice: "en-US-JennyNeural",
        lang: "en-US",
        rate: "+0%",
        pitch: "+0Hz",
        volume: "+0%",
      },
      openai: undefined,
    });
  });
});
