import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ELIZA_CLOUD_TTS_MAX_TEXT_CHARS,
  normalizeElizaCloudTtsModelId,
  resolveCloudProxyTtsModel,
  resolveCloudTtsCandidateUrls,
  resolveElizaCloudTtsVoiceId,
  shouldRetryCloudTtsUpstream,
} from "./server-cloud-tts";

describe("normalizeElizaCloudTtsModelId", () => {
  it("passes through ElevenLabs model ids", () => {
    expect(normalizeElizaCloudTtsModelId("eleven_turbo_v2_5")).toBe(
      "eleven_turbo_v2_5",
    );
    expect(normalizeElizaCloudTtsModelId("eleven_multilingual_v2")).toBe(
      "eleven_multilingual_v2",
    );
  });

  it("maps OpenAI TTS and mistaken voice names to default flash model", () => {
    expect(normalizeElizaCloudTtsModelId("gpt-5-mini-tts")).toBe(
      "eleven_flash_v2_5",
    );
    expect(normalizeElizaCloudTtsModelId("tts-1-hd")).toBe("eleven_flash_v2_5");
    expect(normalizeElizaCloudTtsModelId("nova")).toBe("eleven_flash_v2_5");
  });
});

describe("resolveCloudProxyTtsModel", () => {
  it("uses body modelId when set (ElevenLabs id)", () => {
    expect(
      resolveCloudProxyTtsModel("eleven_flash_v2_5", {} as NodeJS.ProcessEnv),
    ).toBe("eleven_flash_v2_5");
  });

  it("uses ELIZAOS_CLOUD_TTS_MODEL when body empty", () => {
    expect(
      resolveCloudProxyTtsModel("", {
        ELIZAOS_CLOUD_TTS_MODEL: "eleven_turbo_v2",
      } as NodeJS.ProcessEnv),
    ).toBe("eleven_turbo_v2");
  });

  it("normalizes mistaken ELIZAOS_CLOUD_TTS_MODEL values", () => {
    expect(
      resolveCloudProxyTtsModel("", {
        ELIZAOS_CLOUD_TTS_MODEL: "gpt-4o-mini-tts",
      } as NodeJS.ProcessEnv),
    ).toBe("eleven_flash_v2_5");
  });

  it("defaults to eleven_flash_v2_5", () => {
    expect(resolveCloudProxyTtsModel("", {} as NodeJS.ProcessEnv)).toBe(
      "eleven_flash_v2_5",
    );
  });
});

describe("resolveElizaCloudTtsVoiceId", () => {
  it("passes through ElevenLabs voice ids", () => {
    expect(
      resolveElizaCloudTtsVoiceId(
        "EXAVITQu4vr4xnSDxMaL",
        {} as NodeJS.ProcessEnv,
      ),
    ).toBe("EXAVITQu4vr4xnSDxMaL");
  });

  it("maps OpenAI-style names to default premade voice", () => {
    expect(resolveElizaCloudTtsVoiceId("nova", {} as NodeJS.ProcessEnv)).toBe(
      "EXAVITQu4vr4xnSDxMaL",
    );
  });

  it("maps Edge/Azure neural voice ids to default premade ElevenLabs voice", () => {
    expect(
      resolveElizaCloudTtsVoiceId("en-US-AriaNeural", {} as NodeJS.ProcessEnv),
    ).toBe("EXAVITQu4vr4xnSDxMaL");
  });

  it("uses ELIZAOS_CLOUD_TTS_VOICE when body missing", () => {
    expect(
      resolveElizaCloudTtsVoiceId("", {
        ELIZAOS_CLOUD_TTS_VOICE: "pNInz6obpgDQGcFmaJgB",
      } as NodeJS.ProcessEnv),
    ).toBe("pNInz6obpgDQGcFmaJgB");
  });
});

describe("ELIZA_CLOUD_TTS_MAX_TEXT_CHARS", () => {
  it("matches eliza-cloud-v2 voice TTS route limit", () => {
    expect(ELIZA_CLOUD_TTS_MAX_TEXT_CHARS).toBe(5000);
  });
});

describe("shouldRetryCloudTtsUpstream", () => {
  it("retries only wrong-route or gateway-style failures", () => {
    expect(shouldRetryCloudTtsUpstream(404)).toBe(true);
    expect(shouldRetryCloudTtsUpstream(502)).toBe(true);
    expect(shouldRetryCloudTtsUpstream(503)).toBe(true);
    expect(shouldRetryCloudTtsUpstream(401)).toBe(false);
    expect(shouldRetryCloudTtsUpstream(402)).toBe(false);
    expect(shouldRetryCloudTtsUpstream(429)).toBe(false);
    expect(shouldRetryCloudTtsUpstream(400)).toBe(false);
  });
});

describe("resolveCloudTtsCandidateUrls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("targets eliza-cloud-v2 routes, not OpenAI audio/speech", () => {
    vi.stubEnv("ELIZAOS_CLOUD_BASE_URL", "https://www.elizacloud.ai/api/v1");
    const urls = resolveCloudTtsCandidateUrls();
    expect(urls.some((u) => u.includes("/api/v1/voice/tts"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/api/elevenlabs/tts"))).toBe(true);
    expect(urls.some((u) => u.includes("audio/speech"))).toBe(false);
  });
});
