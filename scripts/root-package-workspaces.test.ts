import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root package workspace config", () => {
  it("keeps CI stubs after the primary shipped workspaces", () => {
    const packageJsonPath = path.join(
      import.meta.dirname,
      "..",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      workspaces?: unknown;
    };

    expect(Array.isArray(pkg.workspaces)).toBe(true);
    const workspaces = pkg.workspaces as string[];

    expect(workspaces).not.toContain("scripts/ci-stubs/*");
  });

  it("keeps the root workspace typecheck scoped to root config files", () => {
    const packageJsonPath = path.join(
      import.meta.dirname,
      "..",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["verify:typecheck:workspace"]).toBe(
      "tsc --noEmit -p tsconfig.workspace.json",
    );
  });

  it("keeps app native plugin aliases source-backed for CI typecheck", () => {
    const tsconfigPath = path.join(
      import.meta.dirname,
      "..",
      "apps",
      "app",
      "tsconfig.json",
    );
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };

    expect(
      tsconfig.compilerOptions?.paths?.["@elizaos/capacitor-llama"],
    ).toEqual(["./eliza/packages/native-plugins/llama/src/index.ts"]);
  });
});
