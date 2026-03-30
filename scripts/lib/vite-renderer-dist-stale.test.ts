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

import { viteRendererBuildNeeded } from "./vite-renderer-dist-stale.mjs";

describe("viteRendererBuildNeeded", () => {
  it("is true when dist/index.html is missing", () => {
    const app = mkdtempSync(join(tmpdir(), "vite-app-"));
    try {
      mkdirSync(join(app, "src"), { recursive: true });
      writeFileSync(join(app, "src", "main.tsx"), "export {}\n");
      expect(viteRendererBuildNeeded(app, app)).toBe(true);
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  });

  it("is false when dist is newer than src", () => {
    const app = mkdtempSync(join(tmpdir(), "vite-app-"));
    try {
      mkdirSync(join(app, "src"), { recursive: true });
      mkdirSync(join(app, "dist"), { recursive: true });
      writeFileSync(join(app, "src", "main.tsx"), "export {}\n");
      writeFileSync(join(app, "dist", "index.html"), "<html></html>\n");
      const old = new Date("2000-01-01");
      const newer = new Date("2020-01-01");
      utimesSync(join(app, "src", "main.tsx"), old, old);
      utimesSync(join(app, "dist", "index.html"), newer, newer);
      expect(viteRendererBuildNeeded(app, app)).toBe(false);
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  });

  it("is true when src is newer than dist", () => {
    const app = mkdtempSync(join(tmpdir(), "vite-app-"));
    try {
      mkdirSync(join(app, "src"), { recursive: true });
      mkdirSync(join(app, "dist"), { recursive: true });
      writeFileSync(join(app, "src", "main.tsx"), "export {}\n");
      writeFileSync(join(app, "dist", "index.html"), "<html></html>\n");
      const old = new Date("2000-01-01");
      const newer = new Date("2020-01-01");
      utimesSync(join(app, "dist", "index.html"), old, old);
      utimesSync(join(app, "src", "main.tsx"), newer, newer);
      expect(viteRendererBuildNeeded(app, app)).toBe(true);
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  });

  it("is true when packages/app-core/src is newer than app dist", () => {
    const root = mkdtempSync(join(tmpdir(), "vite-repo-"));
    const app = join(root, "apps", "app");
    try {
      mkdirSync(join(app, "src"), { recursive: true });
      mkdirSync(join(app, "dist"), { recursive: true });
      mkdirSync(join(root, "packages", "app-core", "src"), { recursive: true });
      writeFileSync(join(app, "src", "main.tsx"), "export {}\n");
      writeFileSync(join(app, "dist", "index.html"), "<html></html>\n");
      writeFileSync(
        join(root, "packages", "app-core", "src", "x.ts"),
        "export {}\n",
      );
      const old = new Date("2000-01-01");
      const mid = new Date("2010-01-01");
      const newer = new Date("2020-01-01");
      utimesSync(join(app, "dist", "index.html"), old, old);
      utimesSync(join(app, "src", "main.tsx"), mid, mid);
      utimesSync(
        join(root, "packages", "app-core", "src", "x.ts"),
        newer,
        newer,
      );
      expect(viteRendererBuildNeeded(app, root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
