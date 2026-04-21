import { describe, expect, it } from "vitest";
import { shouldBuildPluginForHost } from "../scripts/plugin-build.mjs";

describe("shouldBuildPluginForHost", () => {
  it("builds when no platforms are declared", () => {
    expect(shouldBuildPluginForHost({}, "win32")).toBe(true);
  });

  it("builds when platforms include runtime targets", () => {
    const pkg = { milady: { platforms: ["browser", "node"] } };
    expect(shouldBuildPluginForHost(pkg, "win32")).toBe(true);
  });

  it("skips pure OS allowlist plugins that exclude host", () => {
    const pkg = { milady: { platforms: ["darwin"] } };
    expect(shouldBuildPluginForHost(pkg, "win32")).toBe(false);
  });

  it("builds pure OS allowlist plugins when host matches", () => {
    const pkg = { elizaos: { platforms: ["win32"] } };
    expect(shouldBuildPluginForHost(pkg, "win32")).toBe(true);
  });
});
