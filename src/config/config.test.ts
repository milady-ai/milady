import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMiladyConfig } from "./config";

describe("loadMiladyConfig heartbeat defaults", () => {
  let tmpDir: string;
  let prevConfigPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-config-test-"));
    prevConfigPath = process.env.MILADY_CONFIG_PATH;
  });

  afterEach(() => {
    if (prevConfigPath === undefined) {
      delete process.env.MILADY_CONFIG_PATH;
    } else {
      process.env.MILADY_CONFIG_PATH = prevConfigPath;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps agents undefined when config file is missing", () => {
    const missingPath = path.join(tmpDir, "missing.json");
    process.env.MILADY_CONFIG_PATH = missingPath;

    const cfg = loadMiladyConfig();

    expect(cfg.logging?.level).toBe("error");
    expect(cfg.agents).toBeUndefined();
  });

  it("sets heartbeat.every to 20m when agents defaults exist but heartbeat is omitted", () => {
    const configPath = path.join(tmpDir, "milady.json");
    process.env.MILADY_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        agents: { defaults: {} },
      }),
      "utf-8",
    );

    const cfg = loadMiladyConfig();

    expect(cfg.agents?.defaults?.heartbeat?.every).toBe("20m");
  });

  it("does not override an explicit heartbeat interval", () => {
    const configPath = path.join(tmpDir, "milady.json");
    process.env.MILADY_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        agents: { defaults: { heartbeat: { every: "5m" } } },
      }),
      "utf-8",
    );

    const cfg = loadMiladyConfig();

    expect(cfg.agents?.defaults?.heartbeat?.every).toBe("5m");
  });
});
