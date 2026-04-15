import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs module, no declaration file.
import {
  miladyCloudTypecheckSteps,
  miladyElizaCrossLanguageChecks,
  miladyElizaTypecheckSteps,
  miladySidecarTypecheckSteps,
  suites,
} from "./run-repo-checks.mjs";

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

  it("skips upstream-wide eliza rust/python sweeps", () => {
    expect(miladyElizaCrossLanguageChecks).toEqual([]);

    expect(suites.lint).not.toContainEqual({
      label: "eliza Rust lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:rust"],
    });
    expect(suites.lint).not.toContainEqual({
      label: "eliza Python lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:python"],
    });
    expect(suites.typecheck).not.toContainEqual({
      label: "eliza Rust typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:rust"],
    });
    expect(suites.typecheck).not.toContainEqual({
      label: "eliza Python typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:python"],
    });
  });

  it("skips unrelated eliza/cloud monorepo split checks", () => {
    expect(miladyCloudTypecheckSteps).toEqual([]);

    expect(
      suites.lint.find((step) => step.label === "cloud lint"),
    ).toBeUndefined();

    for (const label of [
      "cloud app typecheck",
      "cloud tests typecheck",
      "cloud UI typecheck",
      "cloud agent-server typecheck",
      "cloud gateway-discord typecheck",
      "cloud gateway-webhook typecheck",
    ]) {
      expect(
        suites.typecheck.find((step) => step.label === label),
      ).toBeUndefined();
    }
  });

  it("skips unrelated sidecar workspace typechecks", () => {
    expect(miladySidecarTypecheckSteps).toEqual([]);
    expect(
      suites.typecheck.find((step) => step.label === "steward-fi typecheck"),
    ).toBeUndefined();
  });
});
