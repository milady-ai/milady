import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, "../index.ts");

describe("devtools toggle guard", () => {
  it("does not route macOS devtools through a second debug window", () => {
    const source = fs.readFileSync(indexPath, "utf8");
    expect(source).not.toContain("async function openDetachedDevtoolsWindow(");
    expect(source).not.toContain('title: "Milady Debug Tools"');
    expect(source).not.toContain(
      "void openDetachedDevtoolsWindow(targetWindow)",
    );
  });

  it("toggles devtools on the focused webview directly", () => {
    const source = fs.readFileSync(indexPath, "utf8");
    expect(source).toContain("function toggleFocusedWindowDevTools(): void {");
    expect(source).toContain("webview?.toggleDevTools");
    expect(source).toContain("webview?.openDevTools");
    expect(source).toContain(
      'if (typeof webview?.toggleDevTools === "function") {',
    );
  });
});
