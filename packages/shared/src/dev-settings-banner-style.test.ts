import { afterEach, describe, expect, it, vi } from "vitest";
import {
  colorizeDevSettingsBanner,
  colorizeDevSettingsStartupBanner,
} from "./dev-settings-banner-style.js";

describe("colorizeDevSettingsBanner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns plain text when NO_COLOR is set", () => {
    vi.stubEnv("NO_COLOR", "1");
    const plain = "╭── test ──╮\n│ row      │\n╰──────────╯";
    expect(colorizeDevSettingsBanner(plain)).toBe(plain);
  });

  it("returns plain text when FORCE_COLOR=0", () => {
    vi.stubEnv("FORCE_COLOR", "0");
    const plain = "╭── x ──╮";
    expect(colorizeDevSettingsBanner(plain)).toBe(plain);
  });
});

describe("colorizeDevSettingsStartupBanner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns plain when NO_COLOR even with figlet prefix", () => {
    vi.stubEnv("NO_COLOR", "1");
    const plain = "  _ \n╭──╮\n╰──╯";
    expect(colorizeDevSettingsStartupBanner(plain)).toBe(plain);
  });
});
