import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — .mjs module, no declaration file
import { syncElizaEnvAliases } from "./sync-eliza-env-aliases.mjs";

describe("syncElizaEnvAliases", () => {
  /** Snapshot env keys we touch so we can restore them. */
  const touchedKeys = [
    "MILADY_NAMESPACE",
    "ELIZA_NAMESPACE",
    "MILADY_STATE_DIR",
    "ELIZA_STATE_DIR",
    "MILADY_CONFIG_PATH",
    "ELIZA_CONFIG_PATH",
    "MILADY_API_PORT",
    "ELIZA_API_PORT",
    "MILADY_HOME_PORT",
    "ELIZA_HOME_PORT",
    "MILADY_GATEWAY_PORT",
    "ELIZA_GATEWAY_PORT",
    "MILADY_PORT",
    "ELIZA_UI_PORT",
    "MILADY_API_TOKEN",
    "ELIZA_API_TOKEN",
    "MILADY_API_BASE",
    "ELIZA_API_BASE",
    "MILADY_API_BASE_URL",
    "ELIZA_API_BASE_URL",
    "MILADY_DESKTOP_API_BASE",
    "ELIZA_DESKTOP_API_BASE",
    "MILADY_DESKTOP_TEST_API_BASE",
    "ELIZA_DESKTOP_TEST_API_BASE",
    "MILADY_DESKTOP_SKIP_EMBEDDED_AGENT",
    "ELIZA_DESKTOP_SKIP_EMBEDDED_AGENT",
    "MILADY_RENDERER_URL",
    "ELIZA_RENDERER_URL",
    "ELIZA_CLOUD_MANAGED_AGENTS_API_SEGMENT",
    "ELIZA_APP_ROUTE_PLUGIN_MODULES",
    "ORBIT_API_PORT",
    "ORBIT_PORT",
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of touchedKeys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of touchedKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("copies MILADY_* to ELIZA_* when ELIZA_* is unset", () => {
    process.env.MILADY_NAMESPACE = "milady";
    process.env.MILADY_STATE_DIR = "/tmp/milady-state";
    process.env.MILADY_API_PORT = "31337";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_NAMESPACE).toBe("milady");
    expect(process.env.ELIZA_STATE_DIR).toBe("/tmp/milady-state");
    expect(process.env.ELIZA_API_PORT).toBe("31337");
  });

  it("can set the Milady namespace default before app-core scripts run", () => {
    syncElizaEnvAliases({ defaultNamespace: "milady" });

    expect(process.env.ELIZA_NAMESPACE).toBe("milady");
  });

  it("does not override an explicit branded namespace with the default", () => {
    process.env.MILADY_NAMESPACE = "custom";

    syncElizaEnvAliases({ defaultNamespace: "milady" });

    expect(process.env.ELIZA_NAMESPACE).toBe("custom");
  });

  it("can sync a provided env object without mutating process.env", () => {
    const env: Record<string, string | undefined> = {
      MILADY_NAMESPACE: "milady",
      MILADY_STATE_DIR: "/state",
    };

    syncElizaEnvAliases({ env });

    expect(env.ELIZA_NAMESPACE).toBe("milady");
    expect(env.ELIZA_STATE_DIR).toBe("/state");
    expect(process.env.ELIZA_NAMESPACE).toBeUndefined();
    expect(process.env.ELIZA_STATE_DIR).toBeUndefined();
  });

  it("does not overwrite existing ELIZA_* values", () => {
    process.env.MILADY_NAMESPACE = "milady";
    process.env.ELIZA_NAMESPACE = "eliza-original";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_NAMESPACE).toBe("eliza-original");
  });

  it("treats an empty ELIZA_* value as intentional and does not overwrite it", () => {
    process.env.MILADY_API_TOKEN = "milady-token";
    process.env.ELIZA_API_TOKEN = "";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_API_TOKEN).toBe("");
  });

  it("maps MILADY_PORT to ELIZA_UI_PORT (asymmetric alias)", () => {
    process.env.MILADY_PORT = "2138";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_UI_PORT).toBe("2138");
  });

  it("maps Milady desktop API base env into the elizaOS runtime keys", () => {
    process.env.MILADY_API_BASE = "http://127.0.0.1:31337";
    process.env.MILADY_API_BASE_URL = "http://127.0.0.1:31338";
    process.env.MILADY_DESKTOP_API_BASE = "http://127.0.0.1:31339";
    process.env.MILADY_DESKTOP_TEST_API_BASE = "http://127.0.0.1:31340";
    process.env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT = "1";
    process.env.MILADY_RENDERER_URL = "http://127.0.0.1:2138";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_API_BASE).toBe("http://127.0.0.1:31337");
    expect(process.env.ELIZA_API_BASE_URL).toBe("http://127.0.0.1:31338");
    expect(process.env.ELIZA_DESKTOP_API_BASE).toBe("http://127.0.0.1:31339");
    expect(process.env.ELIZA_DESKTOP_TEST_API_BASE).toBe(
      "http://127.0.0.1:31340",
    );
    expect(process.env.ELIZA_DESKTOP_SKIP_EMBEDDED_AGENT).toBe("1");
    expect(process.env.ELIZA_RENDERER_URL).toBe("http://127.0.0.1:2138");
  });

  it("maps Milady companion ports into elizaOS runtime keys", () => {
    process.env.MILADY_HOME_PORT = "2142";
    process.env.MILADY_GATEWAY_PORT = "18789";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_HOME_PORT).toBe("2142");
    expect(process.env.ELIZA_GATEWAY_PORT).toBe("18789");
  });

  it("sets ELIZA_CLOUD_MANAGED_AGENTS_API_SEGMENT default to milady", () => {
    syncElizaEnvAliases();

    expect(process.env.ELIZA_CLOUD_MANAGED_AGENTS_API_SEGMENT).toBe("milady");
  });

  it("does not overwrite existing ELIZA_CLOUD_MANAGED_AGENTS_API_SEGMENT", () => {
    process.env.ELIZA_CLOUD_MANAGED_AGENTS_API_SEGMENT = "custom";

    syncElizaEnvAliases();

    expect(process.env.ELIZA_CLOUD_MANAGED_AGENTS_API_SEGMENT).toBe("custom");
  });

  it("skips copy when MILADY_* is not set", () => {
    syncElizaEnvAliases();

    expect(process.env.ELIZA_NAMESPACE).toBeUndefined();
    expect(process.env.ELIZA_STATE_DIR).toBeUndefined();
    expect(process.env.ELIZA_API_PORT).toBeUndefined();
  });

  it("handles all alias pairs without throwing", () => {
    process.env.MILADY_NAMESPACE = "m";
    process.env.MILADY_STATE_DIR = "/s";
    process.env.MILADY_CONFIG_PATH = "/c";
    process.env.MILADY_API_PORT = "1";
    process.env.MILADY_PORT = "2";
    process.env.MILADY_API_TOKEN = "tok";

    expect(() => syncElizaEnvAliases()).not.toThrow();

    expect(process.env.ELIZA_NAMESPACE).toBe("m");
    expect(process.env.ELIZA_STATE_DIR).toBe("/s");
    expect(process.env.ELIZA_CONFIG_PATH).toBe("/c");
    expect(process.env.ELIZA_API_PORT).toBe("1");
    expect(process.env.ELIZA_UI_PORT).toBe("2");
    expect(process.env.ELIZA_API_TOKEN).toBe("tok");
  });

  it("supports a custom branded prefix", () => {
    process.env.ORBIT_API_PORT = "4242";
    process.env.ORBIT_PORT = "5151";

    syncElizaEnvAliases({ brandedPrefix: "orbit" });

    expect(process.env.ELIZA_API_PORT).toBe("4242");
    expect(process.env.ELIZA_UI_PORT).toBe("5151");
  });
});
