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
  it("keeps blocking typecheck sweep limited to stable checks", () => {
    expect(suites.typecheck).toEqual([
      {
        label: "Root workspace typecheck",
        command: "bun",
        args: ["run", "verify:typecheck:workspace"],
      },
    ]);

    expect(suites.typecheck).not.toContainEqual({
      label: "@elizaos/app-core typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"],
    });
    expect(suites.typecheck).not.toContainEqual({
      label: "@elizaos/ui typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/packages/ui", "typecheck"],
    });
    expect(suites.typecheck).not.toContainEqual({
      label: "apps/app typecheck",
      command: "bun",
      args: ["run", "--cwd", "apps/app", "typecheck"],
    });
    expect(suites.typecheck).not.toContainEqual({
      label: "apps/homepage typecheck",
      command: "bun",
      args: ["run", "--cwd", "apps/homepage", "typecheck"],
    });
  });

  it("keeps extended typecheck aligned with shipped eliza packages", () => {
    expect(miladyElizaTypecheckSteps).toEqual([
      {
        label: "@elizaos/app-core typecheck",
        command: "bun",
        args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"],
      },
      {
        label: "@elizaos/ui typecheck",
        command: "bun",
        args: ["run", "--cwd", "eliza/packages/ui", "typecheck"],
      },
    ]);

    expect(suites["typecheck:extended"]).toContainEqual({
      label: "@elizaos/app-core typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"],
    });
    expect(suites["typecheck:extended"]).toContainEqual({
      label: "@elizaos/ui typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/packages/ui", "typecheck"],
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
    expect(suites["typecheck:extended"]).not.toContainEqual({
      label: "eliza Rust typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:rust"],
    });
    expect(suites["typecheck:extended"]).not.toContainEqual({
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
      suites.lint.find((step) => step.label === "steward-fi lint"),
    ).toBeUndefined();
    expect(
      suites.typecheck.find((step) => step.label === "steward-fi typecheck"),
    ).toBeUndefined();
  });
});
