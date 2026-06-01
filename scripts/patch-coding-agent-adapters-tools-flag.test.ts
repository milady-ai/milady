import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveRepoRootFromScriptUrl } from "./patch-coding-agent-adapters-tools-flag.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const scriptPath = path.join(
  repoRoot,
  "scripts",
  "patch-coding-agent-adapters-tools-flag.mjs",
);

describe("patch-coding-agent-adapters-tools-flag", () => {
  it("resolves the repo root through fileURLToPath", () => {
    expect(resolveRepoRootFromScriptUrl(pathToFileURL(scriptPath).href)).toBe(
      repoRoot,
    );
  });

  it("does not use URL pathname for filesystem paths", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    expect(source).toContain("fileURLToPath");
    expect(source).not.toContain("new URL(import.meta.url).pathname");
  });
});
