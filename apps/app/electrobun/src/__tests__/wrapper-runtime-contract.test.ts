import path from "node:path";

import { describe, expect, it } from "vitest";

import { collectMacCodeSignTargets } from "../../scripts/local-adhoc-sign-macos";
import { resolveRequiredRuntimeBinaryNames } from "../../scripts/postwrap-diagnostics";

describe("wrapper runtime contract", () => {
  it("repairs the macOS wrapper with the launcher-side runtime binaries", () => {
    expect(resolveRequiredRuntimeBinaryNames("macos")).toEqual(
      expect.arrayContaining([
        "bun",
        "libNativeWrapper.dylib",
        "libwebgpu_dawn.dylib",
        "extractor",
        "process_helper",
        "zig-zstd",
        "bspatch",
        "libasar.dylib",
      ]),
    );
  });

  it("signs the repaired macOS launcher binaries alongside the app bundle", () => {
    const appBundlePath = "/tmp/Milady-canary.app";
    const targets = collectMacCodeSignTargets(appBundlePath);
    const binaryDir = path.join(appBundlePath, "Contents", "MacOS");

    expect(targets).toEqual(
      expect.arrayContaining([
        path.join(binaryDir, "launcher"),
        path.join(binaryDir, "bun"),
        path.join(binaryDir, "libNativeWrapper.dylib"),
        path.join(binaryDir, "libwebgpu_dawn.dylib"),
        path.join(binaryDir, "extractor"),
        path.join(binaryDir, "process_helper"),
        path.join(binaryDir, "zig-zstd"),
        path.join(binaryDir, "bspatch"),
        appBundlePath,
      ]),
    );
  });
});
