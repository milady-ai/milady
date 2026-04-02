import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  resolveCurrentGitSha,
  resolveValidationGitRef,
} from "./validate-cdn-assets.mjs";

describe("validate-cdn-assets", () => {
  it("prefers the explicit release tag when one is provided", () => {
    expect(
      resolveValidationGitRef({
        env: {
          GITHUB_SHA: "deadbeef",
          MILADY_RELEASE_TAG: "2.0.0-alpha.131",
        },
      }),
    ).toBe("v2.0.0-alpha.131");
  });

  it("falls back to GITHUB_SHA when the release tag is missing", () => {
    expect(
      resolveValidationGitRef({
        env: {
          GITHUB_SHA: "deadbeef",
        },
      }),
    ).toBe("deadbeef");
  });

  it("falls back to the current checkout SHA when workflow env is absent", () => {
    const expected = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();

    expect(resolveCurrentGitSha({ env: {}, cwd: process.cwd() })).toBe(
      expected,
    );
    expect(resolveValidationGitRef({ env: {}, cwd: process.cwd() })).toBe(
      expected,
    );
  });
});
