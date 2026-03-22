import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ELECTROBUN_DIR = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
);
const SOURCE_PATH = join(
  ELECTROBUN_DIR,
  "native",
  "macos",
  "window-effects.mm",
);

describe("macOS native window effects build", () => {
  it("guards the macOS 15 resize cursor API behind an SDK check", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");

    expect(source).toContain("#if defined(MAC_OS_VERSION_15_0)");
    expect(source).toContain("frameResizeCursorFromPosition:");
    expect(source).toContain("NSCursorFrameResizePositionBottomRight");
    expect(source).toContain("NSCursorFrameResizeDirectionsAll");
    expect(source).toContain("return [NSCursor crosshairCursor];");
  });

  it.runIf(process.platform === "darwin")(
    "builds the native effects dylib on macOS",
    () => {
      const result = spawnSync("bash", ["scripts/build-macos-effects.sh"], {
        cwd: ELECTROBUN_DIR,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Built native macOS effects:");
    },
  );
});
