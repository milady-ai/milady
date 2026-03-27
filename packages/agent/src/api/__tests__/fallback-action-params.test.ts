import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "server.ts"),
  "utf-8",
);

describe("fallback action parser extracts params from response text", () => {
  it("parseFallbackActionBlocks accepts responseText parameter", () => {
    expect(serverSource).toMatch(
      /function parseFallbackActionBlocks\(\s*value:\s*unknown,\s*responseText\?:\s*string/,
    );
  });

  it("extracts params from standalone <ACTION_NAME> blocks in response text", () => {
    expect(serverSource).toContain("extractXmlParams");
    expect(serverSource).toContain("actionBlockRe");
  });
});

describe("double-spawn guard prevents fallback when core handled actions", () => {
  it("checks resultRecord.mode before running fallback execution", () => {
    expect(serverSource).toContain('resultRecord.mode === "actions"');
    expect(serverSource).toContain("coreHandledActions");
  });

  it("skips fallback when coreHandledActions is true", () => {
    expect(serverSource).toContain("!coreHandledActions");
  });
});
