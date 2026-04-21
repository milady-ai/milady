import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHROME_EXTENSION_DOC_PATH = path.join(
  ROOT,
  "docs/apps/chrome-extension.md",
);

const RELEASE_SURFACE_FILES = [
  "AGENTS.md",
  "docs/apps/dashboard.md",
  "docs/apps/overview.md",
  "docs/changelog.mdx",
  "docs/docs.json",
  "docs/guides/beginners-development-guide.md",
  "docs/guides/beginners-user-guide.md",
  "docs/guides/contributing.md",
  "docs/guides/contribution-guide.md",
] as const;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Chrome extension release surface", () => {
  it("keeps the extension out of the shipped release-125 surface docs", () => {
    for (const relativePath of RELEASE_SURFACE_FILES) {
      const content = read(relativePath);
      expect(content).not.toContain("apps/chrome-extension/");
      expect(content).not.toContain('"apps/chrome-extension"');
      expect(content).not.toContain("/apps/chrome-extension");
    }
  });

  it("keeps one source-of-truth doc that marks the extension as out of scope", () => {
    const content = fs.readFileSync(CHROME_EXTENSION_DOC_PATH, "utf8");

    expect(content).toContain("Release status");
    expect(content).toContain("v2.0.0-alpha.125");
    expect(content).toContain("not part of the shipped release surface");
    expect(content).toContain("@elizaos/plugin-browser");
    expect(content).not.toContain("Clone the Milady repository and locate");
    expect(content).not.toContain("Load unpacked");
    expect(content).not.toContain("apps/chrome-extension/");
  });
});
