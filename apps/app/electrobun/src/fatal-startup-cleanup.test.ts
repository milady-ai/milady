import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_PATH = path.resolve(__dirname, "index.ts");

describe("fatal startup cleanup", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf8");

  it("registers agentManager.stop in the shared cleanup list", () => {
    expect(source).toContain(
      "cleanupFns.push(() => getAgentManager().stop());",
    );
  });

  it("runs registered cleanup before exiting on fatal startup", () => {
    expect(source).toContain(
      'void runShutdownCleanup("fatal-startup").finally(() => {',
    );
    expect(source).toContain("process.exit(1);");
  });
});
