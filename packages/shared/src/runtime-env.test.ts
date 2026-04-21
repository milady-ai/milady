import { describe, expect, it } from "vitest";
import {
  firstWinningEnvString,
  resolveAllowNullOrigin,
  resolveApiAllowedHosts,
  resolveApiAllowedOrigins,
  resolveApiBindHost,
  resolveConfiguredApiToken,
  resolveDesktopApiPort,
  resolveDesktopApiPortPreference,
  resolveDesktopUiPortPreference,
  resolveDisableAutoApiToken,
  resolveMiladyRuntimeEnv,
  resolveSingleProcessPort,
  resolveUiPort,
} from "./runtime-env";

describe("runtime env helpers", () => {
  it("prefers MILADY aliases over ELIZA aliases", () => {
    const env: NodeJS.ProcessEnv = {
      MILADY_API_BIND: "0.0.0.0",
      ELIZA_API_BIND: "127.0.0.1",
      MILADY_API_TOKEN: "milady-token",
      ELIZA_API_TOKEN: "eliza-token",
      MILADY_ALLOWED_ORIGINS: "https://a.example, https://b.example",
      ELIZA_ALLOWED_ORIGINS: "https://legacy.example",
      MILADY_ALLOWED_HOSTS: "host-a.example, host-b.example",
      ELIZA_ALLOWED_HOSTS: "legacy-host.example",
      MILADY_ALLOW_NULL_ORIGIN: "1",
      ELIZA_ALLOW_NULL_ORIGIN: "0",
      MILADY_DISABLE_AUTO_API_TOKEN: "1",
      ELIZA_DISABLE_AUTO_API_TOKEN: "0",
      MILADY_API_PORT: "4200",
      ELIZA_API_PORT: "4300",
      ELIZA_PORT: "4400",
      MILADY_PORT: "4500",
    };

    expect(resolveApiBindHost(env)).toBe("0.0.0.0");
    expect(resolveConfiguredApiToken(env)).toBe("milady-token");
    expect(resolveApiAllowedOrigins(env)).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    expect(resolveApiAllowedHosts(env)).toEqual([
      "host-a.example",
      "host-b.example",
    ]);
    expect(resolveAllowNullOrigin(env)).toBe(true);
    expect(resolveDisableAutoApiToken(env)).toBe(true);
    expect(resolveDesktopApiPort(env)).toBe(4200);
    expect(resolveSingleProcessPort(env)).toBe(4500);
    expect(resolveUiPort(env)).toBe(4500);
  });

  it("falls back through ELIZA aliases and defaults", () => {
    const env: NodeJS.ProcessEnv = {
      ELIZA_API_BIND: "localhost",
      ELIZA_API_TOKEN: "legacy-token",
      ELIZA_ALLOWED_ORIGINS: "https://legacy.example",
      ELIZA_ALLOWED_HOSTS: "legacy-host.example",
      ELIZA_ALLOW_NULL_ORIGIN: "1",
      ELIZA_DISABLE_AUTO_API_TOKEN: "1",
      ELIZA_PORT: "31338",
    };

    expect(resolveApiBindHost(env)).toBe("localhost");
    expect(resolveConfiguredApiToken(env)).toBe("legacy-token");
    expect(resolveApiAllowedOrigins(env)).toEqual(["https://legacy.example"]);
    expect(resolveApiAllowedHosts(env)).toEqual(["legacy-host.example"]);
    expect(resolveAllowNullOrigin(env)).toBe(true);
    expect(resolveDisableAutoApiToken(env)).toBe(true);
    expect(resolveDesktopApiPort(env)).toBe(31338);
    expect(resolveSingleProcessPort(env)).toBe(31338);
    expect(resolveDesktopApiPort({})).toBe(31337);
    expect(resolveUiPort({})).toBe(2138);
  });

  it("returns the canonical aggregate shape", () => {
    expect(
      resolveMiladyRuntimeEnv({
        MILADY_API_PORT: "4000",
        MILADY_PORT: "5000",
      }),
    ).toEqual({
      apiBind: "127.0.0.1",
      apiToken: undefined,
      allowedOrigins: [],
      allowedHosts: [],
      allowNullOrigin: false,
      disableAutoApiToken: false,
      desktopApiPort: 4000,
      singleProcessPort: 5000,
      uiPort: 5000,
    });
  });

  it("describeDesktopApiPortPreference reports winning env key", () => {
    const pref = resolveDesktopApiPortPreference({
      ELIZA_API_PORT: "31400",
      MILADY_API_PORT: "31399",
    });
    expect(pref.port).toBe(31399);
    expect(pref.winningKey).toBe("MILADY_API_PORT");
    expect(pref.sourceLabel).toContain("MILADY_API_PORT=31399");

    const def = resolveDesktopApiPortPreference({});
    expect(def.port).toBe(31337);
    expect(def.winningKey).toBeNull();
    expect(def.sourceLabel).toContain("built-in");
  });

  it("resolveDesktopUiPortPreference uses MILADY_PORT only", () => {
    const p = resolveDesktopUiPortPreference({ MILADY_PORT: "3000" });
    expect(p.port).toBe(3000);
    expect(p.winningKey).toBe("MILADY_PORT");
  });

  it("firstWinningEnvString returns first hit", () => {
    expect(
      firstWinningEnvString({ A: "", B: "x" }, ["A", "B"] as const),
    ).toEqual({ key: "B", value: "x" });
  });
});
