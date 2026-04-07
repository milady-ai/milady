import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classificationFromInputs,
  decisionFromFindings,
  getBaseRef,
  isSourceCode,
  isTestExempt,
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

  it("identifies TypeScript/JavaScript source files for pattern scanning", () => {
    expect(isSourceCode("packages/app-core/src/runtime/eliza.ts")).toBe(true);
    expect(isSourceCode("apps/app/src/main.tsx")).toBe(true);
    expect(isSourceCode("scripts/run-node.mjs")).toBe(true);
    expect(isSourceCode("packages/ui/src/Button.jsx")).toBe(true);
    expect(isSourceCode(".eslintrc.cjs")).toBe(true);

    // Non-source files — must NOT be scanned for TS-specific patterns
    expect(isSourceCode(".claude/agents/milady-code-reviewer.md")).toBe(false);
    expect(isSourceCode(".github/workflows/agent-review.yml")).toBe(false);
    expect(isSourceCode(".claude/settings.json")).toBe(false);
    expect(isSourceCode(".claude/hooks/check-node-path.sh")).toBe(false);
    expect(isSourceCode("docs/plugin-setup-guide.md")).toBe(false);
    expect(isSourceCode("bun.lock")).toBe(false);
  });

  it("identifies files whose changes do not require regression tests", () => {
    // Docs
    expect(isTestExempt("docs/plugin-setup-guide.md")).toBe(true);
    expect(isTestExempt("README.md")).toBe(true);
    expect(isTestExempt("CHANGELOG.txt")).toBe(true);

    // Agent tooling
    expect(isTestExempt(".claude/agents/milady-architect.md")).toBe(true);
    expect(isTestExempt(".claude/hooks/check-node-path.sh")).toBe(true);
    expect(isTestExempt(".claude/settings.json")).toBe(true);

    // CI workflows and config
    expect(isTestExempt(".github/workflows/agent-review.yml")).toBe(true);
    expect(isTestExempt(".github/actionlint.yaml")).toBe(true);

    // Editor rules
    expect(isTestExempt(".cursor/rules/elizaos-branding.mdc")).toBe(true);

    // Generated artifacts
    expect(isTestExempt("scripts/generated/static-asset-manifest.json")).toBe(
      true,
    );

    // Runtime source — NOT exempt
    expect(isTestExempt("packages/app-core/src/runtime/eliza.ts")).toBe(false);
    expect(isTestExempt("apps/app/src/main.tsx")).toBe(false);
    expect(isTestExempt("scripts/run-node.mjs")).toBe(false);
    expect(isTestExempt("packages/agent/src/api/misc-routes.ts")).toBe(false);
  });

  it("does not flag TS patterns in Markdown prose describing code rules", () => {
    // The literal string `api as any` appears in agent documentation
    // describing antipatterns; this must NOT be flagged when the scan
    // correctly filters to source files only. Note that scanDiffTextForBlockedPatterns
    // itself operates on raw text, so this test asserts isSourceCode would
    // have excluded the file before the scan ran.
    expect(isSourceCode(".claude/agents/milady-code-reviewer.md")).toBe(false);
    expect(
      isSourceCode(".github/workflows/agent-review-greptile-weighted.yml"),
    ).toBe(false);
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

  it("flags agent doc files that use literal TypeScript any patterns in prose", () => {
    // Agent instruction markdown files (e.g. .claude/agents/*.md) that reference
    // TypeScript antipatterns using the exact pattern string (e.g. `api as any`)
    // will trigger the scanner, because the scanner is content-agnostic.
    // Authors must rephrase such descriptions to avoid the literal pattern.
    const docWithLiteralAnyPattern = `
+ 3. Grep for antipatterns: hardcoded ports, \`api as any\`, bare console.log.
`;
    const docIssues = scanDiffTextForBlockedPatterns(docWithLiteralAnyPattern);
    expect(docIssues.some((issue) => issue.includes("`any` usage"))).toBe(true);

    // Rewording to avoid the literal TypeScript cast pattern does not trigger.
    const docWithRephrasedPattern = `
+ 3. Grep for antipatterns: hardcoded ports, unsafe \`any\` casts, bare console.log.
`;
    const safeDocIssues = scanDiffTextForBlockedPatterns(
      docWithRephrasedPattern,
    );
    expect(safeDocIssues.some((issue) => issue.includes("`any` usage"))).toBe(
      false,
    );
  });
});
