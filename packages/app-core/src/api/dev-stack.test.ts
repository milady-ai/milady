import { describe, expect, it } from "vitest";
import {
  MILADY_DEV_STACK_SCHEMA,
  resolveDevStackFromEnv,
} from "./dev-stack.js";

describe("resolveDevStackFromEnv", () => {
  it("prefers MILADY_API_PORT for API listen", () => {
    const r = resolveDevStackFromEnv({
      MILADY_API_PORT: "4000",
      ELIZA_PORT: "31337",
    });
    expect(r.schema).toBe(MILADY_DEV_STACK_SCHEMA);
    expect(r.api.listenPort).toBe(4000);
    expect(r.api.baseUrl).toBe("http://127.0.0.1:4000");
    expect(r.desktopDevLog).toEqual({ filePath: null, apiTailPath: null });
  });

  it("falls back to ELIZA_PORT then 31337", () => {
    const r = resolveDevStackFromEnv({ ELIZA_PORT: "3001" });
    expect(r.api.listenPort).toBe(3001);
    expect(resolveDevStackFromEnv({}).api.listenPort).toBe(31337);
  });

  it("accepts ELIZA_API_PORT as the legacy dedicated API alias", () => {
    const r = resolveDevStackFromEnv({
      ELIZA_API_PORT: "4555",
      MILADY_PORT: "2138",
    });
    expect(r.api.listenPort).toBe(4555);
    expect(r.desktop.uiPort).toBe(2138);
  });

  it("includes desktop fields when set", () => {
    const r = resolveDevStackFromEnv({
      MILADY_PORT: "2138",
      MILADY_RENDERER_URL: "http://127.0.0.1:2138/",
      MILADY_DESKTOP_API_BASE: "http://127.0.0.1:31337",
    });
    expect(r.desktop).toEqual({
      rendererUrl: "http://127.0.0.1:2138/",
      uiPort: 2138,
      desktopApiBase: "http://127.0.0.1:31337",
    });
    expect(r.hints.length).toBeGreaterThan(0);
  });

  it("reports cursor screenshot when MILADY_ELECTROBUN_SCREENSHOT_URL is set", () => {
    const off = resolveDevStackFromEnv({});
    expect(off.cursorScreenshot).toEqual({
      available: false,
      path: null,
    });
    const on = resolveDevStackFromEnv({
      MILADY_ELECTROBUN_SCREENSHOT_URL: "http://127.0.0.1:31339",
    });
    expect(on.cursorScreenshot).toEqual({
      available: true,
      path: "/api/dev/cursor-screenshot",
    });
  });

  it("reports desktopDevLog when MILADY_DESKTOP_DEV_LOG_PATH is set", () => {
    const r = resolveDevStackFromEnv({
      MILADY_DESKTOP_DEV_LOG_PATH: "/repo/.milady/desktop-dev-console.log",
    });
    expect(r.desktopDevLog).toEqual({
      filePath: "/repo/.milady/desktop-dev-console.log",
      apiTailPath: "/api/dev/console-log",
    });
  });
});
