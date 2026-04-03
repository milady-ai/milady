import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classificationFromInputs,
  decisionFromFindings,
  getBaseRef,
  resolveRunnableTestFiles,
  runChecks,
  scanDiffTextForBlockedPatterns,
  scopeVerdictFor,
  splitRunnableTestFiles,
} from "../../../../scripts/pre-review-local.mjs";

describe("pre-review-local helpers", () => {
  it("classifies branch/message context", () => {
    expect(
      classificationFromInputs({
        branch: "feature/new-theme",
        message: "ui redesign pass",
      }),
    ).toBe("aesthetic");

    expect(
      classificationFromInputs({
        branch: "hardening/auth-guard",
        message: "security leak fix",
      }),
    ).toBe("security");

    expect(
      classificationFromInputs({
        branch: "bugfix/runtime-crash",
        message: "fix regression in parser",
      }),
    ).toBe("bugfix");

    expect(
      classificationFromInputs({
        branch: "chore/ci-parity",
        message: "add helper script",
      }),
    ).toBe("feature");

    expect(
      classificationFromInputs({
        branch: "feat/add-wechat-connector",
        message: "add connector wiring",
      }),
    ).toBe("feature");

    expect(
      classificationFromInputs({
        branch: "docs/update-connectors",
        message: "add Matrix connector docs",
      }),
    ).toBe("docs");

    expect(
      classificationFromInputs({
        branch: "chore/readme-update",
        message: "update README.md",
      }),
    ).toBe("docs");
  });

  it("maps classification to scope verdict", () => {
    expect(scopeVerdictFor("aesthetic")).toBe("out of scope");
    expect(scopeVerdictFor("docs")).toBe("in scope");
    expect(scopeVerdictFor("feature")).toBe("needs deep review");
    expect(scopeVerdictFor("bugfix")).toBe("in scope");
    expect(scopeVerdictFor("security")).toBe("in scope");
  });

  it("treats feature classification as advisory when objective checks pass", () => {
    expect(
      decisionFromFindings({
        classification: "feature",
        issues: [],
      }),
    ).toBe("APPROVE");

    expect(
      decisionFromFindings({
        classification: "feature",
        issues: ["bun run lint failed."],
      }),
    ).toBe("REQUEST CHANGES");

    expect(
      decisionFromFindings({
        classification: "aesthetic",
        issues: [],
      }),
    ).toBe("APPROVE");

    expect(
      decisionFromFindings({
        classification: "aesthetic",
        issues: ["lint failed"],
      }),
    ).toBe("REQUEST CHANGES");
  });

  it("flags TypeScript any usage without matching plain English text", () => {
    const plainEnglishDiff = `
+ // allow any reviewer to run this
+ const label = "any"
+ const notes = "at any time"
`;
    const plainIssues = scanDiffTextForBlockedPatterns(plainEnglishDiff);
    expect(plainIssues.some((issue) => issue.includes("`any` usage"))).toBe(
      false,
    );

    const typedAnyDiff = `
+ const payload: any = value
+ const normalized = value as any
+ const casted = <any>value
`;
    const typedIssues = scanDiffTextForBlockedPatterns(typedAnyDiff);
    expect(typedIssues.some((issue) => issue.includes("`any` usage"))).toBe(
      true,
    );
  });

  it("ignores deleted any usage in unified diffs", () => {
    const diff = `
diff --git a/src/example.ts b/src/example.ts
index 1234567..89abcde 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
-const payload: any = value;
+const payload: unknown = value;
`;

    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((issue) => issue.includes("`any` usage"))).toBe(false);
  });

  it("ignores formatting-only any diffs when count stays flat", () => {
    const diff = `
diff --git a/src/example.ts b/src/example.ts
index 1234567..89abcde 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1 +1,3 @@
-  setAnimationLoop?: (callback: ((time: number, frame?: any) => void) | null) => void;
+  setAnimationLoop?: (
+    callback: ((time: number, frame?: any) => void) | null,
+  ) => void;
`;

    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((issue) => issue.includes("`any` usage"))).toBe(false);
  });

  it("flags ts-ignore and secret-like assignments", () => {
    const diff = `
+ // @ts-ignore temporary
+ const api_key = "sk-1234567890abcdefghijklmnopqrst"
`;

    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((issue) => issue.includes("`@ts-ignore` usage"))).toBe(
      true,
    );
    expect(issues.some((issue) => issue.includes("secret-like string"))).toBe(
      true,
    );
  });

  it("ignores short apiKey placeholders in docs examples", () => {
    const diff = `
+      "apiKey": "<key>",
+      "proxyUrl": "https://proxy.example.com"
`;

    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((issue) => issue.includes("secret-like string"))).toBe(
      false,
    );
  });

  it("approves when branch has no changed files compared to base", () => {
    const originalCwd = process.cwd();
    const repoDir = mkdtempSync(path.join(tmpdir(), "eliza-prereview-"));

    try {
      execSync("git init -b main", { cwd: repoDir, stdio: "pipe" });
      execSync('git config user.email "test@example.com"', {
        cwd: repoDir,
        stdio: "pipe",
      });
      execSync('git config user.name "Test User"', {
        cwd: repoDir,
        stdio: "pipe",
      });
      writeFileSync(path.join(repoDir, "README.md"), "seed\n");
      execSync("git add README.md", { cwd: repoDir, stdio: "pipe" });
      execSync('git commit -m "seed"', { cwd: repoDir, stdio: "pipe" });
      execSync("git checkout -b feature/no-diff", {
        cwd: repoDir,
        stdio: "pipe",
      });

      process.chdir(repoDir);
      const result = runChecks();

      expect(result.decision).toBe("APPROVE");
      expect(result.classification).toBe("other");
      expect(result.changedFiles).toEqual([]);
      expect(result.tests).toContain("not applicable");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses explicit pre-review base ref from env when valid", () => {
    const originalCwd = process.cwd();
    const originalBase = process.env.MILADY_PRE_REVIEW_BASE;
    const repoDir = mkdtempSync(path.join(tmpdir(), "eliza-prereview-base-"));

    try {
      execSync("git init -b main", { cwd: repoDir, stdio: "pipe" });
      execSync('git config user.email "test@example.com"', {
        cwd: repoDir,
        stdio: "pipe",
      });
      execSync('git config user.name "Test User"', {
        cwd: repoDir,
        stdio: "pipe",
      });
      writeFileSync(path.join(repoDir, "README.md"), "seed\n");
      execSync("git add README.md", { cwd: repoDir, stdio: "pipe" });
      execSync('git commit -m "seed"', { cwd: repoDir, stdio: "pipe" });

      process.chdir(repoDir);
      process.env.MILADY_PRE_REVIEW_BASE = "main";
      expect(getBaseRef()).toBe("main");
    } finally {
      process.chdir(originalCwd);
      if (originalBase === undefined) {
        delete process.env.MILADY_PRE_REVIEW_BASE;
      } else {
        process.env.MILADY_PRE_REVIEW_BASE = originalBase;
      }
    }
  });

  it("filters deleted test files out of targeted test runs", () => {
    const repoDir = mkdtempSync(path.join(tmpdir(), "eliza-prereview-files-"));
    const kept = path.join(repoDir, "kept.test.ts");
    writeFileSync(kept, "export {};\n");

    const resolved = resolveRunnableTestFiles(
      ["kept.test.ts", "deleted.test.ts"],
      repoDir,
    );

    expect(resolved).toEqual(["kept.test.ts"]);
  });

  it("routes only root e2e tests to the e2e config runner", () => {
    const actual = splitRunnableTestFiles([
      "packages/app-core/src/components/SettingsView.test.tsx",
      "packages/app-core/test/app/settings-sections.e2e.test.ts",
      "test/health-endpoint.e2e.test.ts",
      "apps/homepage/src/routes/home.test.tsx",
    ]);

    expect({
      ...actual,
      homepageTests: actual.homepageTests.map((file) =>
        file.replaceAll("\\", "/"),
      ),
    }).toEqual({
      repoTests: ["packages/app-core/src/components/SettingsView.test.tsx"],
      repoE2eTests: ["test/health-endpoint.e2e.test.ts"],
      homepageTests: ["src/routes/home.test.tsx"],
    });
  });
});
