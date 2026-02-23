import { beforeEach, describe, expect, it } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import { loadMoltbookConfig } from "../config.ts";
import { moltbookPlugin } from "../plugin.ts";

const runtime = {} as IAgentRuntime;

describe("moltbookPlugin", () => {
  beforeEach(() => {
    delete process.env.MOLTBOOK_API_BASE_URL;
    delete process.env.MOLTBOOK_API_KEY;
    delete process.env.MOLTBOOK_TIMEOUT_MS;
    delete process.env.MOLTBOOK_MAX_RESPONSE_CHARS;
  });

  it("exposes expected plugin metadata and wiring", () => {
    expect(moltbookPlugin.name).toBe("moltbook");
    expect(moltbookPlugin.description).toContain("Moltbook integration");
    expect(moltbookPlugin.services?.length).toBe(1);
    expect(moltbookPlugin.actions?.[0]?.name).toBe("MOLTBOOK_ONBOARD");
    expect(moltbookPlugin.providers?.[0]?.name).toBe("MOLTBOOK_STATUS");
    expect(moltbookPlugin.routes?.length).toBe(3);
  });

  it("initializes config and keeps values available via process env", async () => {
    if (!moltbookPlugin.init) {
      throw new Error("moltbookPlugin.init missing");
    }

    await moltbookPlugin.init(
      {
        MOLTBOOK_API_BASE_URL: "https://www.moltbook.com/api/v1",
        MOLTBOOK_TIMEOUT_MS: "20000",
        MOLTBOOK_MAX_RESPONSE_CHARS: "12000",
      },
      runtime,
    );

    expect(process.env.MOLTBOOK_TIMEOUT_MS).toBe("20000");

    const loaded = loadMoltbookConfig(process.env);
    expect(loaded.apiBaseUrl).toBe("https://www.moltbook.com/api/v1");
    expect(loaded.timeoutMs).toBe(20_000);
    expect(loaded.maxResponseChars).toBe(12_000);
  });

  it("only writes MOLTBOOK_ prefixed config keys into process.env", async () => {
    if (!moltbookPlugin.init) {
      throw new Error("moltbookPlugin.init missing");
    }

    delete process.env.NODE_OPTIONS;

    await moltbookPlugin.init(
      {
        MOLTBOOK_API_BASE_URL: "https://www.moltbook.com/api/v1",
        NODE_OPTIONS: "--inspect=0.0.0.0:9229",
      },
      runtime,
    );

    expect(process.env.NODE_OPTIONS).toBeUndefined();
  });

  it("throws a config error when values are invalid", async () => {
    if (!moltbookPlugin.init) {
      throw new Error("moltbookPlugin.init missing");
    }

    await expect(
      moltbookPlugin.init(
        {
          MOLTBOOK_API_BASE_URL: "https://moltbook.com/api/v1",
        },
        runtime,
      ),
    ).rejects.toThrow("www.moltbook.com");
  });
});
