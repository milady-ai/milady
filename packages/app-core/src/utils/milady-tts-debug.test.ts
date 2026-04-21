import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMiladyTtsDebugEnabled,
  miladyTtsDebug,
  miladyTtsDebugTextPreview,
} from "./milady-tts-debug";

describe("miladyTtsDebugTextPreview", () => {
  it("collapses whitespace and newlines", () => {
    expect(miladyTtsDebugTextPreview("a\nb\tc")).toBe("a↵ b c");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "x".repeat(200);
    const out = miladyTtsDebugTextPreview(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("isMiladyTtsDebugEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches miladyTtsDebug gating", () => {
    vi.stubEnv("MILADY_TTS_DEBUG", "");
    expect(isMiladyTtsDebugEnabled()).toBe(false);
    vi.stubEnv("MILADY_TTS_DEBUG", "1");
    expect(isMiladyTtsDebugEnabled()).toBe(true);
  });
});

describe("miladyTtsDebug", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not log when MILADY_TTS_DEBUG is unset", () => {
    vi.stubEnv("MILADY_TTS_DEBUG", "");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    miladyTtsDebug("phase", { k: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("emits console.info when MILADY_TTS_DEBUG is truthy", () => {
    vi.stubEnv("MILADY_TTS_DEBUG", "1");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    miladyTtsDebug("phase", { k: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("[milady][tts] phase");
  });

  it("omits second argument when detail is empty", () => {
    vi.stubEnv("MILADY_TTS_DEBUG", "true");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    miladyTtsDebug("tick");
    expect(spy).toHaveBeenCalledWith("[milady][tts] tick");
  });
});
