import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const elizaSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "eliza.ts"),
  "utf-8",
);

describe("trajectory runtime wiring", () => {
  it("uses the upstream trajectory context without a Milady-local bridge", () => {
    const prepareBlock =
      elizaSource.match(
        /async function prepareRuntimeForTrajectoryCapture\([\s\S]*?\n\}/m,
      )?.[0] ?? "";

    expect(prepareBlock).not.toContain(
      "installMiladyMessageTrajectoryStepBridge(runtime);",
    );
    expect(elizaSource).not.toContain('from "./trajectory-step-context"');
  });

  it("prepares trajectory capture after the initial runtime initialize", () => {
    const initBlock =
      elizaSource.match(
        /const initializeRuntimeServices = async \(\): Promise<void> => \{[\s\S]*?\n  \};/m,
      )?.[0] ?? "";

    expect(initBlock).toContain("await runtime.initialize();");
    expect(initBlock).toContain(
      'await prepareRuntimeForTrajectoryCapture(runtime, "runtime.initialize()");',
    );
  });

  it("prepares trajectory capture again after hot-reload initialize", () => {
    const hotReloadBlock =
      elizaSource.match(
        /await newRuntime\.initialize\(\);[\s\S]*?installActionAliases\(newRuntime\);/m,
      )?.[0] ?? "";

    expect(hotReloadBlock).toContain("await newRuntime.initialize();");
    expect(hotReloadBlock).toContain(
      'await prepareRuntimeForTrajectoryCapture(\n            newRuntime,\n            "hot-reload runtime.initialize()",\n          );',
    );
  });
});
