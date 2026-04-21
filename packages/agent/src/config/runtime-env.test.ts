import { describe, expect, it } from "vitest";
import {
  isLoopbackBindHost,
  resolveApiSecurityConfig,
  resolveDesktopApiPort,
  resolveDesktopUiPort,
  resolveRuntimePorts,
  resolveServerOnlyPort,
  stripOptionalHostPort,
  syncResolvedApiPort,
} from "./runtime-env";

describe("runtime-env", () => {
  it("prefers MILADY security env values over ELIZA aliases", () => {
    const resolved = resolveApiSecurityConfig({
      MILADY_API_BIND: "0.0.0.0",
      ELIZA_API_BIND: "127.0.0.1",
      MILADY_API_TOKEN: "milady-token",
      ELIZA_API_TOKEN: "eliza-token",
      MILADY_ALLOWED_ORIGINS: "https://milady.example",
      ELIZA_ALLOWED_ORIGINS: "https://legacy.example",
      MILADY_ALLOWED_HOSTS: "milady.local",
      ELIZA_ALLOWED_HOSTS: "legacy.local",
      MILADY_ALLOW_NULL_ORIGIN: "1",
      ELIZA_ALLOW_NULL_ORIGIN: "0",
      MILADY_DISABLE_AUTO_API_TOKEN: "1",
      ELIZA_DISABLE_AUTO_API_TOKEN: "0",
    });

    expect(resolved.bindHost).toBe("0.0.0.0");
    expect(resolved.token).toBe("milady-token");
    expect(resolved.allowedOrigins).toEqual(["https://milady.example"]);
    expect(resolved.allowedHosts).toEqual(["milady.local"]);
    expect(resolved.allowNullOrigin).toBe(true);
    expect(resolved.disableAutoApiToken).toBe(true);
    expect(resolved.isWildcardBind).toBe(true);
    expect(resolved.isLoopbackBind).toBe(false);
  });

  it("resolves split port contracts for server, desktop API, and desktop UI", () => {
    const env = {
      MILADY_PORT: "2138",
      MILADY_API_PORT: "31337",
      ELIZA_API_PORT: "4141",
      ELIZA_PORT: "5151",
    };
    const ports = resolveRuntimePorts(env);
    expect(ports.serverOnlyPort).toBe(2138);
    expect(ports.desktopApiPort).toBe(31337);
    expect(ports.desktopUiPort).toBe(2138);
    expect(resolveServerOnlyPort(env)).toBe(2138);
    expect(resolveDesktopApiPort(env)).toBe(31337);
    expect(resolveDesktopUiPort(env)).toBe(2138);
  });

  it("falls back to legacy API aliases for desktop API port without stealing UI port", () => {
    expect(resolveDesktopApiPort({ ELIZA_API_PORT: "4242" })).toBe(4242);
    expect(resolveDesktopUiPort({ ELIZA_PORT: "4242" })).toBe(2138);
  });

  it("syncs resolved API ports with optional UI overwrite", () => {
    const env: Record<string, string | undefined> = {};
    syncResolvedApiPort(env, 7777);
    expect(env.MILADY_API_PORT).toBe("7777");
    expect(env.ELIZA_API_PORT).toBe("7777");
    expect(env.ELIZA_PORT).toBe("7777");
    expect(env.MILADY_PORT).toBeUndefined();

    syncResolvedApiPort(env, 8888, { overwriteUiPort: true });
    expect(env.MILADY_PORT).toBe("8888");
  });

  it("normalizes bind hosts before loopback checks", () => {
    expect(stripOptionalHostPort("http://localhost:31337")).toBe("localhost");
    expect(stripOptionalHostPort("[::1]:31337")).toBe("::1");
    expect(isLoopbackBindHost("127.0.0.1:31337")).toBe(true);
    expect(isLoopbackBindHost("0.0.0.0")).toBe(false);
  });
});
