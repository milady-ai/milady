import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, "../index.ts");

describe("devtools toggle guard", () => {
  it("keeps the browser fallback path for guarded macOS devtools", () => {
    const source = fs.readFileSync(indexPath, "utf8");
    expect(source).toContain("async function openBrowserDevtoolsFallback(");
    expect(source).toContain("function shouldUseBrowserDevtoolsFallback()");
    expect(source).toContain(
      'process.env.MILADY_ALLOW_UNSAFE_NATIVE_DEVTOOLS !== "1"',
    );
    expect(source).toContain("!shouldForceMainWindowCef(process.env)");
    expect(source).toContain("void openBrowserDevtoolsFallback(targetWindow)");
    expect(source).toContain("Opened Renderer in Browser");
    expect(source).toContain("WKWebView crash/layout bug");
  });

  it("opens a dedicated macOS debug window instead of docking devtools into the main window", () => {
    const source = fs.readFileSync(indexPath, "utf8");
    expect(source).toContain("async function openDetachedDevtoolsWindow(");
    expect(source).toContain('title: "Milady Debug Tools"');
    expect(source).toContain("wireSettingsRpc(debugWindow)");
    expect(source).toContain("debugWebview?.openDevTools?.()");
    expect(source).toContain("void openDetachedDevtoolsWindow(targetWindow)");
  });

  it("keeps an escape hatch for unsafe native toggling", () => {
    const source = fs.readFileSync(indexPath, "utf8");
    expect(source).toContain(
      "const macOpenedDevtoolsWindowIds = new Set<number>()",
    );
    expect(source).toContain("MILADY_ALLOW_UNSAFE_NATIVE_DEVTOOLS");
    expect(source).toContain("shouldUseBrowserDevtoolsFallback()");
  });
});
