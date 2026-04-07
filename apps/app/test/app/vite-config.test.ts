import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const APP_DIR = path.resolve(TEST_DIR, "../..");
const CONFIG_PATH = path.join(APP_DIR, "vite.config.ts");

function getPluginNames(plugins: unknown[]): string[] {
  const names: string[] = [];

  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      names.push(...getPluginNames(plugin));
      continue;
    }

    if (
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      typeof plugin.name === "string"
    ) {
      names.push(plugin.name);
    }
  }

  return names;
}

describe("app vite config", () => {
  it("loads through Vite's bundled config loader", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "test" },
      CONFIG_PATH,
      APP_DIR,
    );

    expect(loaded).not.toBeNull();

    const pluginNames = getPluginNames(loaded?.config.plugins ?? []);
    expect(pluginNames).toContain("desktop-cors");
  });

  it("uses app-local Vite cache dir and ignores Electrobun native build output", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      CONFIG_PATH,
      APP_DIR,
    );
    expect(loaded?.config.cacheDir).toBe(path.join(APP_DIR, ".vite"));
    const ignored = loaded?.config.server?.watch?.ignored;
    expect(ignored).toEqual(
      expect.arrayContaining([
        "**/electrobun/build/**",
        "**/electrobun/artifacts/**",
      ]),
    );
  });

  it("defines MILADY_SETTINGS_DEBUG for client settings trace", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      CONFIG_PATH,
      APP_DIR,
    );
    const define = loaded?.config.define as Record<string, string> | undefined;
    expect(define?.["import.meta.env.MILADY_SETTINGS_DEBUG"]).toBeDefined();
    expect(
      define?.["import.meta.env.VITE_MILADY_SETTINGS_DEBUG"],
    ).toBeDefined();
  });

  it("aliases capacitor mobile-signals to the local workspace source", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "test" },
      CONFIG_PATH,
      APP_DIR,
    );
    const aliases = loaded?.config.resolve?.alias;

    expect(aliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          replacement: path.join(
            APP_DIR,
            "plugins",
            "mobile-signals",
            "src",
            "index.ts",
          ),
        }),
      ]),
    );
  });
});
