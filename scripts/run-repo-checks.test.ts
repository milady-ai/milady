import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs module, no declaration file.
import { miladyElizaTypecheckSteps, suites } from "./run-repo-checks.mjs";

describe("run-repo-checks", () => {
  it("scopes eliza typecheck to Milady-relevant packages", () => {
    expect(miladyElizaTypecheckSteps).toEqual([
      {
        label: "eliza app-core workspace typecheck",
        command: "bun",
        args: ["run", "verify:typecheck:workspace"],
      },
      {
        label: "eliza ui consumer typecheck",
        command: "bun",
        args: ["run", "--cwd", "apps/app", "typecheck"],
      },
      {
        label: "eliza agent typecheck",
        command: "bun",
        args: ["run", "--cwd", "eliza/packages/agent", "typecheck"],
      },
      {
        label: "eliza cloud plugin typecheck",
        command: "bun",
        args: [
          "run",
          "--cwd",
          "eliza/plugins/plugin-elizacloud/typescript",
          "typecheck",
        ],
      },
    ]);

    expect(suites.typecheck).not.toContainEqual({
      label: "eliza TypeScript typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck"],
    });
  });

  it("drops the full eliza TypeScript lint step", () => {
    expect(suites.lint).not.toContainEqual({
      label: "eliza TypeScript lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:check"],
    });
  });
});
