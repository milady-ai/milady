import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChecks } from "./pre-review-local.mjs";

const SECURITY_PATTERNS = [
  "security",
  "vulnerability",
  "cve",
  "injection",
  "xss",
  "csrf",
  "sqli",
  "auth bypass",
];
const DOCS_PATTERNS = ["docs:", "documentation", "readme", "changelog"];
const BUG_PATTERNS = [
  "fix:",
  "bug",
  "regression",
  "broken",
  "crash",
  "error",
  "hotfix",
  "resolve",
];
const FEATURE_PATTERNS = [
  "feat:",
  "feature",
  "add ",
  "introduce",
  "implement",
  "support",
  "new ",
];
const REFACTOR_PATTERNS = ["refactor", "cleanup", "simplify", "restructure"];
const CHORE_PATTERNS = [
  "chore:",
  "maintenance",
  "deps",
  "dependency bump",
  "housekeeping",
];
const AESTHETIC_PATTERNS = [
  "redesign",
  "restyle",
  "theme",
  "color",
  "colour",
  "font",
  "layout",
  "css",
  "styling",
  "ui overhaul",
  "visual",
  "dark mode",
  "light mode",
  "icon",
  "logo",
  "spacing",
  "typography",
];
const TECHNICAL_PATTERNS = [
  "api",
  "endpoint",
  "migration",
  "security",
  "performance",
  "config",
  "dependency",
  "dependencies",
  "build",
  "deploy",
  "ci",
  "test",
  "runtime",
  "provider",
  "convex",
  "plugin",
  "schema",
];

function runGit(args) {
  try {
    return {
      ok: true,
      stdout: execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error?.stderr
        ? String(error.stderr).trim()
        : String(error?.message),
    };
  }
}

function anyMatch(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function allPathsMatch(paths, regex) {
  return paths.length > 0 && paths.every((file) => regex.test(file));
}

function anyPathMatch(paths, regex) {
  return paths.some((file) => regex.test(file));
}

export function classifyContribution({ title = "", body = "", files = [] }) {
  const text = `${title}\n${body}`.toLowerCase();
  const paths = files.map((file) => String(file).toLowerCase());
  const hasFiles = paths.length > 0;
  const isDocsOnly = allPathsMatch(
    paths,
    /(^docs\/)|(^|\/)readme\.md$|\.mdx?$/,
  );
  const isCiOnly = allPathsMatch(paths, /^\.github\/(workflows|actions)\//);
  const isTestsOnly = allPathsMatch(
    paths,
    /(^test\/)|(\.test\.[tj]sx?$)|(\.spec\.[tj]sx?$)|vitest.*config/,
  );

  if (anyMatch(text, SECURITY_PATTERNS)) return "security";
  if (isDocsOnly || (anyMatch(text, DOCS_PATTERNS) && !hasFiles)) return "docs";
  if (isCiOnly) return "ci";
  if (isTestsOnly) return "test";
  if (
    anyMatch(text, REFACTOR_PATTERNS) &&
    !anyMatch(text, BUG_PATTERNS) &&
    !anyMatch(text, FEATURE_PATTERNS)
  ) {
    return "refactor";
  }
  if (anyMatch(text, CHORE_PATTERNS) && !anyMatch(text, FEATURE_PATTERNS)) {
    return "chore";
  }

  const bugScore =
    (anyMatch(text, BUG_PATTERNS) ? 2 : 0) +
    (anyPathMatch(paths, /(fix|bug|regression|hotfix)/) ? 1 : 0);
  const featureScore =
    (anyMatch(text, FEATURE_PATTERNS) ? 2 : 0) +
    (anyPathMatch(paths, /(^src\/)|(^apps\/app\/src\/)/) ? 1 : 0);
  const isAesthetic = anyMatch(text, AESTHETIC_PATTERNS);
  const isTechnical = anyMatch(text, TECHNICAL_PATTERNS);

  if (isAesthetic && !isTechnical) return "aesthetic";
  if (bugScore >= featureScore + 1) return "bugfix";
  return "feature";
}

export function scopeVerdictFor(category) {
  if (category === "aesthetic") return "out of scope";
  if (category === "feature") return "needs deep review";
  return "in scope";
}

export function decisionFor({ scopeVerdict, checksExitCode }) {
  if (scopeVerdict === "out of scope") return "CLOSE";
  if (checksExitCode !== 0) return "REQUEST CHANGES";
  return "APPROVE";
}

function printLine(index, label, value) {
  console.log(`${index}. **${label}:** ${value}`);
}

export function collectReviewContext() {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const title = runGit(["log", "-1", "--pretty=%s"]);
  const body = runGit(["log", "-1", "--pretty=%b"]);
  const baseRef = runGit(["rev-parse", "--verify", "origin/develop"]).ok
    ? "origin/develop"
    : "develop";
  const changed = runGit(["diff", "--name-only", `${baseRef}...HEAD`]);
  const files = changed.ok
    ? changed.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return {
    branch: branch.stdout || "HEAD",
    title: title.stdout,
    body: body.stdout,
    files,
  };
}

function main() {
  const ctx = collectReviewContext();
  const classification = classifyContribution({
    title: `${ctx.branch} ${ctx.title}`,
    body: ctx.body,
    files: ctx.files,
  });
  const scopeVerdict = scopeVerdictFor(classification);
  const checks = runChecks();
  const decision = decisionFor({
    scopeVerdict,
    checksExitCode: checks.exitCode,
  });

  printLine(1, "Classification", classification);
  printLine(2, "Scope verdict", scopeVerdict);
  printLine(3, "Code quality", checks.codeQuality);
  printLine(4, "Security", checks.security);
  printLine(5, "Tests", checks.tests);
  printLine(6, "Decision", decision);

  if (checks.details?.length || checks.checklist?.length) {
    const details = [
      ...new Set([...(checks.checklist || []), ...(checks.details || [])]),
    ];
    console.log("\n### Required changes (if any):");
    for (const detail of details) {
      console.log(`- [ ] ${detail}`);
    }
  }

  if (decision !== "APPROVE") {
    process.exit(1);
  }
}

const invokedScript = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentScript = fileURLToPath(import.meta.url);
if (invokedScript && invokedScript === currentScript) {
  main();
}
