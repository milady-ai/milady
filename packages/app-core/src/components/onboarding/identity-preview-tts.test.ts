import { describe, expect, it } from "vitest";
import {
  buildPreviewTtsRequestPlans,
  DEFAULT_PREVIEW_TTS_MODEL_ID,
  resolvePreviewTtsEndpoints,
} from "./identity-preview-tts";

describe("resolvePreviewTtsEndpoints", () => {
  it("prefers cloud route first for cloud-native voice IDs", () => {
    expect(resolvePreviewTtsEndpoints("nova")).toEqual([
      "/api/tts/cloud",
      "/api/tts/elevenlabs",
    ]);
    expect(resolvePreviewTtsEndpoints("  SHIMMER  ")).toEqual([
      "/api/tts/cloud",
      "/api/tts/elevenlabs",
    ]);
  });

  it("uses only elevenlabs route for preset/custom elevenlabs voice IDs", () => {
    expect(resolvePreviewTtsEndpoints("21m00Tcm4TlvDq8ikWAM")).toEqual([
      "/api/tts/elevenlabs",
    ]);
    expect(resolvePreviewTtsEndpoints("cNYrMw9glwJZXR8RwbuR")).toEqual([
      "/api/tts/elevenlabs",
    ]);
  });

  it("can prefer the cloud proxy first for preset voices during onboarding", () => {
    expect(
      resolvePreviewTtsEndpoints("EXAVITQu4vr4xnSDxMaL", {
        preferCloudProxy: true,
      }),
    ).toEqual(["/api/tts/cloud", "/api/tts/elevenlabs"]);
  });
});

describe("buildPreviewTtsRequestPlans", () => {
  it("builds cloud-first request plans for catchphrase previews", () => {
    expect(
      buildPreviewTtsRequestPlans({
        text: "what's the play?",
        voiceId: "nPczCjzI2devNBz1zQrb",
        preferCloudProxy: true,
      }),
    ).toEqual([
      {
        endpoint: "/api/tts/cloud",
        body: {
          text: "what's the play?",
          voiceId: "nPczCjzI2devNBz1zQrb",
          modelId: DEFAULT_PREVIEW_TTS_MODEL_ID,
          outputFormat: "mp3_44100_128",
        },
      },
      {
        endpoint: "/api/tts/elevenlabs",
        body: {
          text: "what's the play?",
          voiceId: "nPczCjzI2devNBz1zQrb",
          modelId: DEFAULT_PREVIEW_TTS_MODEL_ID,
          outputFormat: "mp3_44100_128",
        },
      },
    ]);
  });

  it("returns no requests for blank preview text", () => {
    expect(
      buildPreviewTtsRequestPlans({
        text: "   ",
        voiceId: "nPczCjzI2devNBz1zQrb",
      }),
    ).toEqual([]);
  });
});
