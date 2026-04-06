import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const appDir = path.join(repoRoot, "apps", "app");
const configPath = path.join(appDir, "vite.config.ts");

describe("apps/app vite config", () => {
  it("aligns optimizeDeps esbuild target with build target", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      configPath,
      appDir,
    );

    expect(loaded?.config.esbuild?.target).toBe("es2022");
    expect(loaded?.config.optimizeDeps?.esbuildOptions?.target).toBe("es2022");
  });
});
