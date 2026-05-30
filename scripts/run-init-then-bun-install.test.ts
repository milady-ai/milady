import { describe, expect, it } from "vitest";
import { parseArgs } from "./run-init-then-bun-install.mjs";

describe("install wrapper argument parsing", () => {
  it("parses explicit profiles and trailing bun install args", () => {
    expect(
      parseArgs(["--profile", "local", "--", "--frozen-lockfile"]),
    ).toEqual({
      help: false,
      profiles: ["local"],
      bunInstallArgs: ["--frozen-lockfile"],
      interactive: true,
    });
  });

  it("keeps unknown arguments for bun install", () => {
    expect(parseArgs(["--all", "--filter=@milady/app", "--yes"])).toEqual({
      help: false,
      profiles: ["all"],
      bunInstallArgs: ["--filter=@milady/app"],
      interactive: false,
    });
  });

  it("supports comma separated profile values", () => {
    expect(parseArgs(["--profiles=packages,local"]).profiles).toEqual([
      "packages",
      "local",
    ]);
  });
});
