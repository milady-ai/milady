import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectWorkspaceMaps, expandPattern } from "./workspace-discovery.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("workspace-discovery", () => {
  it("expandPattern finds packages/app-core from literal workspace pattern", () => {
    const dirs = expandPattern(repoRoot, "packages/app-core");
    const expected = join(repoRoot, "packages", "app-core");
    expect(dirs).toContain(expected);
    expect(existsSync(join(expected, "package.json"))).toBe(true);
  });

  it("collectWorkspaceMaps includes root and maps @miladyai/app-core", () => {
    const rootPkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { workspaces: string[] };
    const { nameToDir, nameToVersion } = collectWorkspaceMaps(
      repoRoot,
      rootPkg.workspaces,
    );
    expect(nameToDir.has("@miladyai/app-core")).toBe(true);
    const v = nameToVersion.get("@miladyai/app-core");
    expect(v).toBeDefined();
    expect(v).toMatch(/^\d+\./);
  });
});
