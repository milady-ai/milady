/**
 * Discord Voice Capability — Unit Tests
 *
 * Validates:
 *   1. Voice capability detection works (ffmpeg + opus probing)
 *   2. voiceActionGuard returns graceful error when voice is unavailable
 *   3. The discord plugin loads successfully even when voice deps are missing
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectVoiceCapability,
  getVoiceCapability,
  isVoiceSupported,
  resetVoiceCapabilityCache,
  setVoiceCapabilityProbeOverridesForTests,
  voiceActionGuard,
} from "../src/plugins/discord-voice-capability";

// ---------------------------------------------------------------------------
// 1. Voice Capability Detection
// ---------------------------------------------------------------------------

describe("Discord Voice Capability Detection", () => {
  afterEach(() => {
    resetVoiceCapabilityCache();
    setVoiceCapabilityProbeOverridesForTests();
  });

  it("detectVoiceCapability reports support when ffmpeg and opus are available", async () => {
    const checkFfmpeg = vi.fn().mockResolvedValue(true);
    const checkOpus = vi.fn().mockResolvedValue(true);
    setVoiceCapabilityProbeOverridesForTests({ checkFfmpeg, checkOpus });

    const result = await detectVoiceCapability();

    expect(result).toEqual({
      supported: true,
      ffmpeg: true,
      opus: true,
      details: "Voice dependencies available",
    });
    expect(checkFfmpeg).toHaveBeenCalledOnce();
    expect(checkOpus).toHaveBeenCalledOnce();
  });

  it("caches the result after first call", async () => {
    const checkFfmpeg = vi.fn().mockResolvedValue(true);
    const checkOpus = vi.fn().mockResolvedValue(true);
    setVoiceCapabilityProbeOverridesForTests({ checkFfmpeg, checkOpus });

    const first = await detectVoiceCapability();
    const second = await detectVoiceCapability();

    expect(first).toBe(second); // same reference
    expect(checkFfmpeg).toHaveBeenCalledOnce();
    expect(checkOpus).toHaveBeenCalledOnce();
  });

  it("resetVoiceCapabilityCache clears cached result", async () => {
    await detectVoiceCapability();
    expect(getVoiceCapability()).toBeDefined();

    resetVoiceCapabilityCache();
    expect(getVoiceCapability()).toBeUndefined();
  });

  it("isVoiceSupported returns false before detection runs", () => {
    expect(isVoiceSupported()).toBe(false);
  });

  it("isVoiceSupported reflects detection result", async () => {
    setVoiceCapabilityProbeOverridesForTests({
      checkFfmpeg: vi.fn().mockResolvedValue(true),
      checkOpus: vi.fn().mockResolvedValue(true),
    });

    const result = await detectVoiceCapability();
    expect(isVoiceSupported()).toBe(result.supported);
  });

  it("reports missing deps in details when not supported", async () => {
    setVoiceCapabilityProbeOverridesForTests({
      checkFfmpeg: vi.fn().mockResolvedValue(false),
      checkOpus: vi.fn().mockResolvedValue(false),
    });

    const result = await detectVoiceCapability();

    expect(result).toEqual({
      supported: false,
      ffmpeg: false,
      opus: false,
      details: "Missing: ffmpeg, opus bindings (@discordjs/opus or opusscript)",
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Voice Action Guard — Graceful Degradation
// ---------------------------------------------------------------------------

describe("Voice Action Guard", () => {
  afterEach(() => {
    resetVoiceCapabilityCache();
    setVoiceCapabilityProbeOverridesForTests();
  });

  it("returns error string before detection has run", () => {
    const error = voiceActionGuard();
    expect(error).not.toBeNull();
    expect(error).toContain("not been checked yet");
  });

  it("returns null when voice is supported", async () => {
    setVoiceCapabilityProbeOverridesForTests({
      checkFfmpeg: vi.fn().mockResolvedValue(true),
      checkOpus: vi.fn().mockResolvedValue(true),
    });

    const result = await detectVoiceCapability();
    expect(result.supported).toBe(true);
    expect(voiceActionGuard()).toBeNull();
  });

  it("returns descriptive error when voice is not supported", async () => {
    setVoiceCapabilityProbeOverridesForTests({
      checkFfmpeg: vi.fn().mockResolvedValue(false),
      checkOpus: vi.fn().mockResolvedValue(true),
    });

    const result = await detectVoiceCapability();
    expect(result.supported).toBe(false);

    const error = voiceActionGuard();
    expect(error).not.toBeNull();
    expect(error).toContain("Voice is not available");
    expect(error).toContain("Missing: ffmpeg");
    expect(error).toContain("text channels");
  });
});

// ---------------------------------------------------------------------------
// 3. Discord Plugin Loads Without Voice Deps
// ---------------------------------------------------------------------------

describe("Discord Plugin Resilience", () => {
  afterEach(() => {
    resetVoiceCapabilityCache();
    setVoiceCapabilityProbeOverridesForTests();
  });

  it("discord plugin is listed in OPTIONAL_CORE_PLUGINS", async () => {
    const { OPTIONAL_CORE_PLUGINS } = await import(
      "../src/runtime/core-plugins"
    );
    expect(OPTIONAL_CORE_PLUGINS).toContain("@elizaos/plugin-discord");
  });

  it("voice capability module loads without throwing", async () => {
    // The module itself should always load, even if ffmpeg/opus are missing
    const mod = await import("../src/plugins/discord-voice-capability");
    expect(mod.detectVoiceCapability).toBeTypeOf("function");
    expect(mod.isVoiceSupported).toBeTypeOf("function");
    expect(mod.voiceActionGuard).toBeTypeOf("function");
  });

  it("detection completes without throwing even when deps are missing", async () => {
    setVoiceCapabilityProbeOverridesForTests({
      checkFfmpeg: vi.fn().mockResolvedValue(false),
      checkOpus: vi.fn().mockResolvedValue(false),
    });

    await expect(detectVoiceCapability()).resolves.toBeDefined();
  });

  it("guard provides actionable message for users", async () => {
    setVoiceCapabilityProbeOverridesForTests({
      checkFfmpeg: vi.fn().mockResolvedValue(false),
      checkOpus: vi.fn().mockResolvedValue(false),
    });

    await detectVoiceCapability();
    const result = getVoiceCapability();
    expect(result?.supported).toBe(false);

    const error = voiceActionGuard();
    expect(error).toMatch(/Missing:/);
    expect(error).toMatch(/text channels/);
  });
});
