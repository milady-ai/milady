import { afterEach, describe, expect, it, vi } from "vitest";
import * as appConfig from "../config/config";
import {
  __resetCloudBaseUrlCache,
  ensureCloudTtsApiKeyAlias,
  resolveCloudTtsBaseUrl,
  resolveElevenLabsApiKeyForCloudMode,
} from "./server";

describe("cloud-backed ElevenLabs API key alias", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetCloudBaseUrlCache();
  });

  it("returns direct ElevenLabs key when present", () => {
    const env = {
      ELEVENLABS_API_KEY: "direct-key",
      ELIZAOS_CLOUD_USE_TTS: "true",
      ELIZAOS_CLOUD_API_KEY: "cloud-key",
    } as NodeJS.ProcessEnv;

    expect(resolveElevenLabsApiKeyForCloudMode(env)).toBe("direct-key");
  });

  it("falls back to cloud key when cloud TTS routing is enabled", () => {
    const env = {
      ELIZAOS_CLOUD_USE_TTS: "true",
      ELIZAOS_CLOUD_API_KEY: "cloud-key",
    } as NodeJS.ProcessEnv;

    expect(resolveElevenLabsApiKeyForCloudMode(env)).toBe("cloud-key");
  });

  it("does not resolve cloud key when cloud TTS is disabled", () => {
    const env = {
      ELIZAOS_CLOUD_USE_TTS: "true",
      ELIZAOS_CLOUD_API_KEY: "cloud-key",
      ELIZA_CLOUD_TTS_DISABLED: "true",
    } as NodeJS.ProcessEnv;

    expect(resolveElevenLabsApiKeyForCloudMode(env)).toBeNull();
  });

  it("aliases cloud key into ELEVENLABS_API_KEY when direct key is missing", () => {
    const env = {
      ELIZAOS_CLOUD_USE_TTS: "true",
      ELIZAOS_CLOUD_API_KEY: "cloud-key",
    } as NodeJS.ProcessEnv;

    expect(ensureCloudTtsApiKeyAlias(env)).toBe(true);
    expect(env.ELEVENLABS_API_KEY).toBe("cloud-key");
  });

  it("does not overwrite existing ELEVENLABS_API_KEY", () => {
    const env = {
      ELEVENLABS_API_KEY: "direct-key",
      ELIZAOS_CLOUD_USE_TTS: "true",
      ELIZAOS_CLOUD_API_KEY: "cloud-key",
    } as NodeJS.ProcessEnv;

    expect(ensureCloudTtsApiKeyAlias(env)).toBe(false);
    expect(env.ELEVENLABS_API_KEY).toBe("direct-key");
  });

  it("normalizes cloud base URL to include /api/v1 when missing", () => {
    const env = {
      ELIZAOS_CLOUD_BASE_URL: "https://www.elizacloud.ai",
    } as NodeJS.ProcessEnv;

    expect(resolveCloudTtsBaseUrl(env)).toBe(
      "https://www.elizacloud.ai/api/v1",
    );
  });

  it("uses milady.json cloud.baseUrl when ELIZAOS_CLOUD_BASE_URL is unset", () => {
    vi.spyOn(appConfig, "loadElizaConfig").mockReturnValue({
      cloud: { baseUrl: "https://staging.elizacloud.example" },
    } as appConfig.ElizaConfig);

    expect(resolveCloudTtsBaseUrl({} as NodeJS.ProcessEnv)).toBe(
      "https://staging.elizacloud.example/api/v1",
    );
  });
});
