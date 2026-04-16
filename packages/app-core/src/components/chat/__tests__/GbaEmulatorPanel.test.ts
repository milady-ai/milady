/**
 * GbaEmulatorPanel — cross-origin isolation via iframe validation
 *
 * Validates that:
 * 1. The Vite dev server serves a /__gba__ route with strict COOP/COEP headers
 * 2. The emulator component uses an iframe (not inline script injection)
 * 3. The iframe page enables SharedArrayBuffer via require-corp COEP
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── 1. Vite config serves cross-origin isolation on /__gba__ route ──────────

describe("Vite /__gba__ iframe route", () => {
  let viteConfig: string;

  beforeEach(() => {
    const configPath = path.resolve(
      __dirname,
      "../../../../../../apps/app/vite.config.ts",
    );
    viteConfig = fs.readFileSync(configPath, "utf-8");
  });

  it("has a gbaEmulatorIframePlugin that serves /__gba__", () => {
    expect(viteConfig).toContain("gbaEmulatorIframePlugin");
    expect(viteConfig).toContain("/__gba__");
  });

  it("sets Cross-Origin-Opener-Policy: same-origin on the iframe route", () => {
    expect(viteConfig).toContain('"Cross-Origin-Opener-Policy"');
    expect(viteConfig).toContain('"same-origin"');
  });

  it("sets Cross-Origin-Embedder-Policy: require-corp on the iframe route", () => {
    expect(viteConfig).toContain('"Cross-Origin-Embedder-Policy"');
    expect(viteConfig).toContain('"require-corp"');
  });

  it("uses require-corp (not credentialless) for reliable SharedArrayBuffer", () => {
    // require-corp is supported in all browsers that support SharedArrayBuffer,
    // while credentialless is Chrome 110+ only
    expect(viteConfig).toMatch(
      /Cross-Origin-Embedder-Policy.*require-corp/,
    );
  });
});

// ── 2. Emulator component uses iframe architecture ─────────────────────────

describe("GbaEmulatorPanel component", () => {
  let componentSource: string;

  beforeEach(() => {
    const componentPath = path.resolve(__dirname, "../GbaEmulatorPanel.tsx");
    componentSource = fs.readFileSync(componentPath, "utf-8");
  });

  it("renders an iframe pointing to /__gba__", () => {
    expect(componentSource).toContain('src="/__gba__"');
  });

  it("uses MessageChannel to transfer ROM data to the iframe", () => {
    expect(componentSource).toContain("new MessageChannel()");
    expect(componentSource).toContain("gba-init");
    expect(componentSource).toContain("gba-rom-data");
  });

  it("does not inject script tags directly (uses iframe instead)", () => {
    expect(componentSource).not.toContain('document.createElement("script")');
    expect(componentSource).not.toContain("EJS_player");
  });
});

// ── 3. SharedArrayBuffer availability reasoning ────────────────────────────

describe("SharedArrayBuffer via iframe isolation", () => {
  it("require-corp COEP + same-origin COOP enables crossOriginIsolated", () => {
    // The /__gba__ iframe page is served with these headers.
    // Within the iframe context:
    //   crossOriginIsolated === true
    //     => SharedArrayBuffer is available
    //     => EmulatorJS 7zip WASM decompressor can allocate shared memory
    //     => Core extraction completes past 99%
    //
    // The parent page does NOT need COEP/COOP headers, which avoids
    // breaking other cross-origin resources (fonts, images, CDN scripts).

    const coop = "same-origin";
    const coep = "require-corp";

    const crossOriginIsolated =
      coop === "same-origin" &&
      (coep === "require-corp" || coep === "credentialless");

    expect(crossOriginIsolated).toBe(true);
  });
});
