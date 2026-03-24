import { describe, expect, it } from "vitest";
import {
  formatBehindWarning,
  isBehavioralSourceFile,
  isTestFile,
  parseBehindCount,
  shouldFailForMissingTests,
} from "./pre-commit-review.mjs";

describe("pre-commit review helpers", () => {
  it("detects tests and behavioral files", () => {
    expect(isTestFile("packages/app-core/src/foo.test.ts")).toBe(true);
    expect(isTestFile("packages/app-core/src/__tests__/foo.ts")).toBe(true);
    expect(isBehavioralSourceFile("packages/app-core/src/foo.ts")).toBe(true);
    expect(isBehavioralSourceFile("docs/build-and-release.md")).toBe(false);
    expect(isBehavioralSourceFile("scripts/something.test.ts")).toBe(false);
  });

  it("parses behind count output", () => {
    expect(parseBehindCount("3\t12")).toBe(3);
    expect(parseBehindCount("0 5")).toBe(0);
    expect(parseBehindCount("nope")).toBe(0);
  });

  it("formats behind-base warning message", () => {
    expect(formatBehindWarning("origin/develop", 4)).toContain(
      "Rebase before push.",
    );
  });

  it("requires tests when behavioral files are staged", () => {
    expect(
      shouldFailForMissingTests([
        "packages/agent/src/api/server.ts",
        "docs/build-and-release.md",
      ]),
    ).toBe(true);
    expect(
      shouldFailForMissingTests([
        "packages/agent/src/api/server.ts",
        "packages/agent/src/api/server.test.ts",
      ]),
    ).toBe(false);
    expect(shouldFailForMissingTests(["docs/build-and-release.md"])).toBe(
      false,
    );
  });
});
