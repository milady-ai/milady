import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptText = fs.readFileSync(
  path.join(here, "cleanup-desktop-orphans.mjs"),
  "utf8",
);

describe("cleanup-desktop-orphans", () => {
  it("matches Linux Electrobun dev bundle orphans", () => {
    expect(scriptText).toContain("build/dev-linux-x64/Milady-dev/bin/launcher");
    expect(scriptText).toContain(
      "build/dev-linux-x64/Milady-dev/bin/../Resources/main.js",
    );
  });

  it("keeps macOS Electrobun orphan coverage", () => {
    expect(scriptText).toContain("Milady-dev.app/Contents/MacOS/launcher");
    expect(scriptText).toContain(
      "Milady-dev.app/Contents/MacOS/../Resources/main.js",
    );
  });
});
