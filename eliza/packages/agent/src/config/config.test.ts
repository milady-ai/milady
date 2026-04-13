import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadElizaConfig } from "./config.js";

describe("loadElizaConfig", () => {
  const originalEnv = { ...process.env };
  let stateDir: string;
  let configPath: string;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-config-"));
    configPath = path.join(stateDir, "milady.json");
    process.env = {
      ...originalEnv,
      MILADY_STATE_DIR: stateDir,
      MILADY_CONFIG_PATH: configPath,
    };
    delete process.env.WALLET_SOURCE_EVM;
    delete process.env.MILADY_CLOUD_EVM_ADDRESS;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("hydrates persisted config.env values into process.env and the resolved config", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        logging: { level: "error" },
        env: {
          WALLET_SOURCE_EVM: "local",
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(stateDir, "config.env"),
      [
        "WALLET_SOURCE_EVM=cloud",
        "MILADY_CLOUD_EVM_ADDRESS=0x1234567890abcdef1234567890abcdef12345678",
      ].join("\n") + "\n",
      "utf8",
    );

    const config = loadElizaConfig();

    expect(process.env.WALLET_SOURCE_EVM).toBe("cloud");
    expect(process.env.MILADY_CLOUD_EVM_ADDRESS).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(
      (config.env as Record<string, string | undefined>).WALLET_SOURCE_EVM,
    ).toBe("cloud");
    expect(
      (config.env as Record<string, string | undefined>)
        .MILADY_CLOUD_EVM_ADDRESS,
    ).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });
});
