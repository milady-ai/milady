import { describe, expect, it } from "vitest";
import { resolvePreviewTtsEndpoints } from "./identity-preview-tts";

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
});

