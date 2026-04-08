import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, "../index.ts");

describe("devtools toggle guard", () => {
  it("routes macOS devtools requests to a browser fallback by default", () => {
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

  it("keeps an escape hatch for unsafe native toggling", () => {
    const source = fs.readFileSync(indexPath, "utf8");
    expect(source).toContain(
      "const macOpenedDevtoolsWindowIds = new Set<number>()",
    );
    expect(source).toContain("macOpenedDevtoolsWindowIds.has(windowId)");
    expect(source).toContain(
      "Ignoring repeated toggle on macOS native renderer",
    );
  });
});
