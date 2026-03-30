// @vitest-environment jsdom
import { setBootConfig } from "@miladyai/app-core/config";
import { resolveApiUrl } from "@miladyai/app-core/utils";
import { beforeEach, describe, expect, it } from "vitest";

describe("resolveApiUrl (sessionStorage, jsdom)", () => {
  beforeEach(() => {
    setBootConfig({ branding: {} });
    window.sessionStorage.removeItem("milady_api_base");
  });

  it("prefers sessionStorage milady_api_base over boot when both are set", () => {
    window.sessionStorage.setItem(
      "milady_api_base",
      "http://127.0.0.1:31337",
    );
    setBootConfig({ branding: {}, apiBase: "http://localhost:2138" });
    expect(resolveApiUrl("/api/tts/cloud")).toBe(
      "http://127.0.0.1:31337/api/tts/cloud",
    );
  });

  it("uses sessionStorage when boot apiBase is unset", () => {
    window.sessionStorage.setItem(
      "milady_api_base",
      "http://127.0.0.1:40000",
    );
    expect(resolveApiUrl("/api/status")).toBe(
      "http://127.0.0.1:40000/api/status",
    );
  });

  it("prefers __MILADY_API_BASE__ over boot when session is unset (desktop TTS)", () => {
    const w = window as Window & { __MILADY_API_BASE__?: string };
    w.__MILADY_API_BASE__ = "http://127.0.0.1:31337";
    setBootConfig({ branding: {}, apiBase: "http://127.0.0.1:2138" });
    expect(resolveApiUrl("/api/tts/cloud")).toBe(
      "http://127.0.0.1:31337/api/tts/cloud",
    );
    delete w.__MILADY_API_BASE__;
  });
});
