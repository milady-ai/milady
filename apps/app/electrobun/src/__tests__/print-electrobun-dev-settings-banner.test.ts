import { afterEach, describe, expect, it, vi } from "vitest";
import { printElectrobunDevSettingsBanner } from "../print-electrobun-dev-settings-banner";

describe("printElectrobunDevSettingsBanner", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDev = process.env.ELECTROBUN_DEV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevDev === undefined) delete process.env.ELECTROBUN_DEV;
    else process.env.ELECTROBUN_DEV = prevDev;
    vi.restoreAllMocks();
  });

  it("does not print when NODE_ENV is test", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ELECTROBUN_DEV;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printElectrobunDevSettingsBanner({});
    expect(log).not.toHaveBeenCalled();
  });

  it("includes winning external API env key in Source when ELECTROBUN_DEV is set", () => {
    process.env.NODE_ENV = "development";
    process.env.ELECTROBUN_DEV = "1";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printElectrobunDevSettingsBanner({
      MILADY_API_BASE_URL: "https://api.example.test",
    });
    expect(log).toHaveBeenCalled();
    const text = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(text).toContain("env set — MILADY_API_BASE_URL");
  });
});
