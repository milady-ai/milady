import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  discoverInstalledPlugins,
  discoverPluginsFromManifest,
} from "./server";

type PluginManifest = {
  plugins?: Array<{
    id?: string;
    description?: string;
    tags?: string[];
  }>;
};

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("plugin metadata discovery", () => {
  it("fills fallback descriptions and tags for social connectors", () => {
    const discovered = discoverPluginsFromManifest();
    const manifestCandidates = [
      path.resolve(process.cwd(), "plugins.json"),
      path.resolve(process.cwd(), "..", "..", "plugins.json"),
      path.resolve(__dirname, "../../../../../plugins.json"),
    ];
    const manifestPath = manifestCandidates.find((candidate) =>
      existsSync(candidate),
    );
    const plugins =
      discovered.length > 0
        ? discovered
        : ((
            JSON.parse(
              readFileSync(manifestPath ?? manifestCandidates[0], "utf8"),
            ) as PluginManifest
          ).plugins ?? []);

    const telegram = plugins.find((plugin) => plugin.id === "telegram");
    const github = plugins.find((plugin) => plugin.id === "github");

    expect(telegram?.description).toBeTruthy();
    expect(telegram?.tags).toEqual(
      expect.arrayContaining(["connector", "social-chat", "messaging"]),
    );
    expect(github?.tags).not.toContain("social-chat");
  });

  it("hydrates config schemas for bundled providers and connectors", () => {
    const plugins = discoverPluginsFromManifest();
    const telegram = plugins.find((plugin) => plugin.id === "telegram");
    const openai = plugins.find((plugin) => plugin.id === "openai");

    expect(telegram?.configKeys).toEqual(
      expect.arrayContaining(["TELEGRAM_BOT_TOKEN"]),
    );
    expect(
      telegram?.parameters.some(
        (parameter) =>
          parameter.key === "TELEGRAM_BOT_TOKEN" &&
          parameter.required === true &&
          parameter.sensitive === true,
      ),
    ).toBe(true);

    expect(openai?.configKeys).toEqual(
      expect.arrayContaining(["OPENAI_API_KEY"]),
    );
    expect(
      openai?.parameters.some(
        (parameter) =>
          parameter.key === "OPENAI_API_KEY" &&
          parameter.required === true &&
          parameter.sensitive === true,
      ),
    ).toBe(true);
  });

  it("enriches installed plugins with homepage, repository, and setup links", () => {
    const installPath = makeTempDir("plugin-twitch-");
    writeFileSync(
      path.join(installPath, "package.json"),
      JSON.stringify(
        {
          name: "@elizaos/plugin-twitch",
          description: "Twitch streaming plugin",
          homepage: "https://twitch.tv",
          repository: {
            type: "git",
            url: "git+https://github.com/elizaos/eliza.git",
          },
          keywords: ["streaming", "video", "creator"],
          agentConfig: {
            pluginParameters: {
              TWITCH_STREAM_KEY: {
                type: "string",
                description: "Stream key",
                required: true,
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const plugins = discoverInstalledPlugins(
      {
        plugins: {
          installs: {
            "@elizaos/plugin-twitch": {
              installPath,
              version: "0.1.0",
            },
          },
        },
      } as never,
      new Set<string>(),
    );

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.homepage).toBe("https://twitch.tv");
    expect(plugins[0]?.repository).toBe("https://github.com/elizaos/eliza");
    expect(plugins[0]?.tags).toEqual(
      expect.arrayContaining(["streaming", "video", "creator"]),
    );
    expect(plugins[0]?.parameters[0]?.key).toBe("TWITCH_STREAM_KEY");
  });
});
