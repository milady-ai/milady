import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pluginsRoot = path.resolve(import.meta.dirname, "..", "..", "plugins");

const PLUGIN_DIRS = [
  "agent",
  "camera",
  "canvas",
  "desktop",
  "gateway",
  "location",
  "mobile-signals",
  "screencapture",
  "swabble",
  "talkmode",
  "websiteblocker",
];

describe("capacitor plugin package metadata", () => {
  it.each(
    PLUGIN_DIRS,
  )("%s exposes the ESM build to bundlers", (pluginDirName) => {
    const packageJsonPath = path.join(
      pluginsRoot,
      pluginDirName,
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    expect(pkg.module).toBe("./dist/esm/index.js");
    expect(pkg.exports?.["."]?.import).toBe("./dist/esm/index.js");
  });

  it("websiteblocker metadata describes the current support matrix truthfully", () => {
    const packageJsonPath = path.join(
      pluginsRoot,
      "websiteblocker",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    expect(pkg.milady.platforms).toEqual(["browser", "android", "ios"]);
    expect(pkg.milady.platformDetails.browser).toContain(
      "Milady runtime HTTP API",
    );
    expect(pkg.milady.platformDetails.android).toContain("VPN DNS blocker");
    expect(pkg.milady.platformDetails.ios).toContain("Safari content blocker");
  });
});
