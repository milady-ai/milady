import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { capacitorPluginsBuildNeeded } from "./capacitor-plugin-build-needed.mjs";

describe("capacitorPluginsBuildNeeded", () => {
  it("returns true when dist is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "cap-plug-"));
    try {
      mkdirSync(join(root, "p1", "src"), { recursive: true });
      writeFileSync(join(root, "p1", "src", "index.ts"), "export {};\n");
      expect(capacitorPluginsBuildNeeded(root, ["p1"])).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns false when dist is newer than src", () => {
    const root = mkdtempSync(join(tmpdir(), "cap-plug-"));
    try {
      const plugin = join(root, "p1");
      mkdirSync(join(plugin, "src"), { recursive: true });
      mkdirSync(join(plugin, "dist", "esm"), { recursive: true });
      const src = join(plugin, "src", "index.ts");
      const dist = join(plugin, "dist", "esm", "index.js");
      writeFileSync(src, "export {};\n");
      writeFileSync(dist, "export {};\n");
      const old = new Date("2000-01-01");
      const newer = new Date("2020-01-01");
      utimesSync(src, old, old);
      utimesSync(dist, newer, newer);
      expect(capacitorPluginsBuildNeeded(root, ["p1"])).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns true when src is newer than dist", () => {
    const root = mkdtempSync(join(tmpdir(), "cap-plug-"));
    try {
      const plugin = join(root, "p1");
      mkdirSync(join(plugin, "src"), { recursive: true });
      mkdirSync(join(plugin, "dist", "esm"), { recursive: true });
      const src = join(plugin, "src", "index.ts");
      const dist = join(plugin, "dist", "esm", "index.js");
      writeFileSync(src, "export {};\n");
      writeFileSync(dist, "export {};\n");
      const old = new Date("2000-01-01");
      const newer = new Date("2020-01-01");
      utimesSync(dist, old, old);
      utimesSync(src, newer, newer);
      expect(capacitorPluginsBuildNeeded(root, ["p1"])).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
