import { describe, expect, it } from "vitest";
import {
  classificationFromInputs,
  isTestExempt,
  scanDiffTextForBlockedPatterns,
  splitRunnableTestFiles,
} from "./pre-review-local.mjs";

describe("isTestExempt", () => {
  it("exempts files under docs/", () => {
    expect(isTestExempt("docs/index.md")).toBe(true);
    expect(isTestExempt("docs/quickstart.mdx")).toBe(true);
    expect(isTestExempt("docs/guides/foo.md")).toBe(true);
  });

  it("exempts .md and .mdx files regardless of path", () => {
    expect(isTestExempt("apps/web/src/docs/content/beginner/welcome.mdx")).toBe(
      true,
    );
    expect(isTestExempt("some/path/README.md")).toBe(true);
    expect(isTestExempt("CHANGELOG.mdx")).toBe(true);
  });

  it("exempts .txt files", () => {
    expect(isTestExempt("notes.txt")).toBe(true);
  });

  it("exempts .claude/ agent definitions and settings", () => {
    expect(isTestExempt(".claude/agents/foo.md")).toBe(true);
    expect(isTestExempt(".claude/settings.json")).toBe(true);
  });

  it("exempts .github/ workflow YAML", () => {
    expect(isTestExempt(".github/workflows/ci.yml")).toBe(true);
  });

  it("exempts .cursor/ editor rules", () => {
    expect(isTestExempt(".cursor/rules/foo.mdc")).toBe(true);
  });

  it("exempts shell scripts", () => {
    expect(isTestExempt(".claude/hooks/check-node-path.sh")).toBe(true);
  });

  it("does not exempt TypeScript source files", () => {
    expect(isTestExempt("packages/app-core/src/runtime/eliza.ts")).toBe(false);
    expect(isTestExempt("apps/web/src/router.tsx")).toBe(false);
    expect(isTestExempt("apps/web/src/docs/registry.ts")).toBe(false);
  });

  it("does not exempt package.json or config files", () => {
    expect(isTestExempt("apps/web/package.json")).toBe(false);
    expect(isTestExempt("apps/web/vite.config.ts")).toBe(false);
  });
});

describe("classificationFromInputs", () => {
  it("classifies docs/ branches as docs", () => {
    expect(
      classificationFromInputs({
        branch: "docs/consumer-mvp",
        message: "docs(web): add consumer docs shell",
      }),
    ).toBe("docs");
  });

  it("classifies branch containing docs as docs even if message is generic", () => {
    expect(
      classificationFromInputs({
        branch: "docs/something",
        message: "polish and cleanup",
      }),
    ).toBe("docs");
  });

  it("classifies fix/ branches as bugfix", () => {
    expect(
      classificationFromInputs({
        branch: "fix/telegram-reconnect",
        message: "fix telegram reconnect on rate limit",
      }),
    ).toBe("bugfix");
  });

  it("classifies security-related changes correctly", () => {
    expect(
      classificationFromInputs({
        branch: "security/session-token-storage",
        message: "security: remove session token from logs",
      }),
    ).toBe("security");
  });

  it("classifies aesthetic-only changes correctly", () => {
    expect(
      classificationFromInputs({
        branch: "chore/dark-mode",
        message: "redesign sidebar layout",
      }),
    ).toBe("aesthetic");
  });

  it("falls back to feature for unrecognized branch/message", () => {
    expect(
      classificationFromInputs({
        branch: "chore/update-deps",
        message: "bump elizaos packages",
      }),
    ).toBe("feature");
  });
});

describe("scanDiffTextForBlockedPatterns", () => {
  it("detects added any usage", () => {
    const diff = `--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x: string = '';\n+const x: any = '';`;
    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((i) => i.includes("`any`"))).toBe(true);
  });

  it("detects added ts-ignore", () => {
    const diff = `--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-// ok\n+// @ts-ignore`;
    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((i) => i.includes("@ts-ignore"))).toBe(true);
  });

  it("passes clean diffs", () => {
    const diff = `--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;`;
    expect(scanDiffTextForBlockedPatterns(diff)).toHaveLength(0);
  });
});

describe("splitRunnableTestFiles", () => {
  it("routes homepage tests to homepageTests", () => {
    const { homepageTests, repoTests } = splitRunnableTestFiles([
      "apps/homepage/src/foo.test.ts",
    ]);
    expect(homepageTests).toContain("src/foo.test.ts");
    expect(repoTests).toHaveLength(0);
  });

  it("routes repo tests to repoTests", () => {
    const { repoTests } = splitRunnableTestFiles([
      "scripts/pre-review-local.test.ts",
    ]);
    expect(repoTests).toContain("scripts/pre-review-local.test.ts");
  });
});
