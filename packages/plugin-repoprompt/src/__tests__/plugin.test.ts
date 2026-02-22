import { beforeEach, describe, expect, it } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import { loadRepoPromptConfig } from "../config.ts";
import { repopromptPlugin } from "../plugin.ts";

const runtime = {} as IAgentRuntime;

describe("repopromptPlugin", () => {
  beforeEach(() => {
    delete process.env.REPOPROMPT_CLI_PATH;
    delete process.env.REPOPROMPT_TIMEOUT_MS;
    delete process.env.REPOPROMPT_ALLOWED_COMMANDS;
    delete process.env.REPOPROMPT_MAX_STDIN_BYTES;
    delete process.env.REPOPROMPT_WORKSPACE_ROOT;
  });

  it("exposes expected plugin metadata and wiring", () => {
    expect(repopromptPlugin.name).toBe("repoprompt");
    expect(repopromptPlugin.description).toContain(
      "RepoPrompt CLI integration",
    );
    expect(repopromptPlugin.services?.length).toBe(1);
    expect(repopromptPlugin.actions?.[0]?.name).toBe("REPOPROMPT_RUN");
    expect(repopromptPlugin.providers?.[0]?.name).toBe("REPOPROMPT_STATUS");
    expect(repopromptPlugin.routes?.length).toBe(2);
  });

  it("initializes config and keeps values available via process env", async () => {
    if (!repopromptPlugin.init) {
      throw new Error("repopromptPlugin.init missing");
    }

    await repopromptPlugin.init(
      {
        REPOPROMPT_CLI_PATH: "/usr/local/bin/rp-cli",
        REPOPROMPT_TIMEOUT_MS: "30000",
        REPOPROMPT_ALLOWED_COMMANDS: "context_builder,read_file",
      },
      runtime,
    );

    expect(process.env.REPOPROMPT_CLI_PATH).toBe("/usr/local/bin/rp-cli");
    expect(process.env.REPOPROMPT_TIMEOUT_MS).toBe("30000");

    const loaded = loadRepoPromptConfig(process.env);
    expect(loaded.cliPath).toBe("/usr/local/bin/rp-cli");
    expect(loaded.timeoutMs).toBe(30_000);
    expect(loaded.allowedCommands).toEqual(["context_builder", "read_file"]);
  });

  it("only writes REPOPROMPT_ prefixed config keys into process.env", async () => {
    if (!repopromptPlugin.init) {
      throw new Error("repopromptPlugin.init missing");
    }

    delete process.env.NODE_OPTIONS;

    await repopromptPlugin.init(
      {
        REPOPROMPT_CLI_PATH: "/usr/local/bin/rp-cli",
        REPOPROMPT_TIMEOUT_MS: "30000",
        NODE_OPTIONS: "--inspect=0.0.0.0:9229",
      },
      runtime,
    );

    expect(process.env.REPOPROMPT_TIMEOUT_MS).toBe("30000");
    expect(process.env.NODE_OPTIONS).toBeUndefined();
  });

  it("throws a config error when values are invalid", async () => {
    if (!repopromptPlugin.init) {
      throw new Error("repopromptPlugin.init missing");
    }

    await expect(
      repopromptPlugin.init(
        {
          REPOPROMPT_TIMEOUT_MS: "10",
        },
        runtime,
      ),
    ).rejects.toThrow("configuration error");
  });
});
