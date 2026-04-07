import { describe, expect, it } from "vitest";

import {
  parseTrackedSubmodules,
  shouldSkipSubmoduleInit,
} from "./init-submodules.mjs";

describe("parseTrackedSubmodules", () => {
  it("parses submodule names and paths from git config output", () => {
    expect(
      parseTrackedSubmodules(
        [
          "submodule.eliza.path eliza",
          "submodule.plugins/plugin-agent-orchestrator.path plugins/plugin-agent-orchestrator",
        ].join("\n"),
      ),
    ).toEqual([
      { name: "eliza", path: "eliza" },
      {
        name: "plugins/plugin-agent-orchestrator",
        path: "plugins/plugin-agent-orchestrator",
      },
    ]);
  });
});

describe("shouldSkipSubmoduleInit", () => {
  it("skips plugin-openrouter until the upstream Windows-invalid paths are fixed", () => {
    expect(
      shouldSkipSubmoduleInit("plugins/plugin-openrouter", {
        skipLocal: false,
      }),
    ).toBe(true);
  });

  it("skips the repo-local eliza checkout when local upstreams are disabled", () => {
    expect(shouldSkipSubmoduleInit("eliza", { skipLocal: true })).toBe(true);
    expect(
      shouldSkipSubmoduleInit("plugins/plugin-agent-orchestrator", {
        skipLocal: true,
      }),
    ).toBe(false);
  });
});
