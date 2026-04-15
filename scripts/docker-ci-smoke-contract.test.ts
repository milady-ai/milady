import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dockerSmokeScriptPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "docker-ci-smoke.sh",
);

describe("docker CI smoke contract", () => {
  it("installs published-workspace fallback dependencies", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    const installsViaHelper = script.includes(
      "bash scripts/install-published-workspace-fallback-deps.sh",
    );
    const installsInline = script.includes("bun add --no-save --dev");

    expect(installsViaHelper || installsInline).toBe(true);
  });
});
