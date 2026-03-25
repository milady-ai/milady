import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_PATH = path.resolve(import.meta.dirname, "..", "index.ts");
const source = readFileSync(INDEX_PATH, "utf-8");

describe("close-to-background behavior", () => {
  it("ensureBackgroundWindow does NOT create a new BrowserWindow", () => {
    // Find the ensureBackgroundWindow function body
    const fnStart = source.indexOf("async function ensureBackgroundWindow");
    expect(fnStart).toBeGreaterThan(-1);

    // Get the function body (up to the next top-level function)
    const fnBody = source.slice(fnStart, fnStart + 500);

    // Must NOT contain createMainWindow — that was the bug
    expect(fnBody).not.toContain("createMainWindow");
    // Must NOT contain attachMainWindow
    expect(fnBody).not.toContain("attachMainWindow");
    // Should show the background notification
    expect(fnBody).toContain("showBackgroundRunNoticeOnce");
  });

  it("restoreWindow function exists and creates window when needed", () => {
    const fnStart = source.indexOf("async function restoreWindow");
    expect(fnStart).toBeGreaterThan(-1);

    const fnBody = source.slice(fnStart, fnStart + 600);

    // Should handle existing window (unminimize + focus)
    expect(fnBody).toContain("unminimize");
    expect(fnBody).toContain("focus");
    // Should create new window when none exists
    expect(fnBody).toContain("createMainWindow");
    expect(fnBody).toContain("attachMainWindow");
    expect(fnBody).toContain("injectApiBase");
  });

  it("setupDockReopen wires the Electrobun reopen event", () => {
    const fnStart = source.indexOf("function setupDockReopen");
    expect(fnStart).toBeGreaterThan(-1);

    const fnBody = source.slice(fnStart, fnStart + 200);
    expect(fnBody).toContain('"reopen"');
    expect(fnBody).toContain("restoreWindow");
  });

  it("setupDockReopen is called during initialization", () => {
    expect(source).toContain("setupDockReopen();");
  });

  it("application-menu-clicked restores window when main window is gone", () => {
    const menuHandler = source.indexOf('"application-menu-clicked"');
    expect(menuHandler).toBeGreaterThan(-1);

    const handlerBody = source.slice(menuHandler, menuHandler + 600);
    expect(handlerBody).toContain("!currentWindow");
    expect(handlerBody).toContain("restoreWindow");
  });

  it("showMainSurface restores window before sending renderer message", () => {
    const fnStart = source.indexOf("async function showMainSurface");
    expect(fnStart).toBeGreaterThan(-1);

    const fnBody = source.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain("!currentWindow");
    expect(fnBody).toContain("restoreWindow");
    expect(fnBody).toContain("sendToActiveRenderer");
  });

  it("exitOnLastWindowClosed is false in electrobun config", () => {
    const candidates = [
      path.resolve(import.meta.dirname, "..", "electrobun.config.ts"),
      path.resolve("apps/app/electrobun/electrobun.config.ts"),
    ];
    let configSource = "";
    for (const p of candidates) {
      try {
        configSource = readFileSync(p, "utf-8");
        break;
      } catch {}
    }
    expect(configSource.length).toBeGreaterThan(0);
    expect(configSource).toContain("exitOnLastWindowClosed: false");
  });
});
