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
  it("delegates published-workspace fallback dependencies to the shared helper", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    expect(script).toContain(
      'bash "$REPO_ROOT/scripts/install-published-workspace-fallback-deps.sh"',
    );
    expect(script).not.toContain("bun add --no-save --dev");
  });
});
