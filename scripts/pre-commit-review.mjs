import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
      stderr: error?.stderr ? String(error.stderr) : String(error?.message),
    };
  }
}

function getBaseRef() {
  const candidates = [
    "origin/develop",
    "develop",
    "origin/main",
    "main",
    "HEAD~1",
  ];
  for (const ref of candidates) {
    const result = runGit(["rev-parse", "--verify", ref]);
    if (result.ok) return ref;
  }
  return "HEAD~1";
}

function getStagedFiles() {
  const result = runGit([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
  ]);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isTestFile(file) {
  return /(?:^|\/)(?:__tests__\/.*|.*\.(?:e2e\.)?test\.[jt]sx?)$/i.test(file);
}

export function isBehavioralSourceFile(file) {
  if (!/\.(?:[cm]?js|[jt]sx?)$/i.test(file)) return false;
  if (isTestFile(file)) return false;
  return (
    file.startsWith("packages/") ||
    file.startsWith("apps/") ||
    file.startsWith("scripts/")
  );
}

export function parseBehindCount(leftRightCountStdout) {
  const [behindRaw] = String(leftRightCountStdout).split(/\s+/);
  const behind = Number(behindRaw);
  return Number.isFinite(behind) ? behind : 0;
}

export function formatBehindWarning(baseRef, behindCount) {
  return `[pre-commit-review] Branch is behind ${baseRef} by ${behindCount} commit(s). Rebase before push.`;
}

function getBehindCount(baseRef) {
  const result = runGit([
    "rev-list",
    "--left-right",
    "--count",
    `${baseRef}...HEAD`,
  ]);
  if (!result.ok) return 0;
  return parseBehindCount(result.stdout);
}

export function shouldFailForMissingTests(stagedFiles) {
  const behavioralFiles = stagedFiles.filter(isBehavioralSourceFile);
  const stagedTests = stagedFiles.filter(isTestFile);
  return behavioralFiles.length > 0 && stagedTests.length === 0;
}

function getUpstreamOverlaps(baseRef, stagedFiles) {
  if (stagedFiles.length === 0) return [];
  const mergeBase = runGit(["merge-base", "HEAD", baseRef]);
  if (!mergeBase.ok || !mergeBase.stdout) return [];

  const changedUpstream = runGit([
    "diff",
    "--name-only",
    `${mergeBase.stdout}..${baseRef}`,
    "--",
    ...stagedFiles,
  ]);
  if (!changedUpstream.ok || !changedUpstream.stdout) return [];
  return changedUpstream.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function failWith(lines) {
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}

function main() {
  if (process.env.MILADY_SKIP_PRE_COMMIT_REVIEW === "1") {
    process.exit(0);
  }

  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const baseRef = getBaseRef();
  const failures = [];
  const warnings = [];

  const behindCount = getBehindCount(baseRef);
  if (behindCount > 0) {
    warnings.push(formatBehindWarning(baseRef, behindCount));
  }

  const overlaps = getUpstreamOverlaps(baseRef, stagedFiles);
  if (overlaps.length > 0) {
    warnings.push(
      `[pre-commit-review] Upstream touched staged paths since branch point: ${overlaps.join(", ")}`,
    );
  }

  const behavioralFiles = stagedFiles.filter(isBehavioralSourceFile);
  if (shouldFailForMissingTests(stagedFiles)) {
    failures.push(
      "[pre-commit-review] Behavioral source files are staged without any staged tests. Add/update a test or split commit.",
    );
    warnings.push(
      `[pre-commit-review] Behavioral files: ${behavioralFiles.join(", ")}`,
    );
  }

  for (const warning of warnings) {
    console.warn(warning);
  }

  if (failures.length > 0) {
    failWith([
      "",
      ...failures,
      "[pre-commit-review] Set MILADY_SKIP_PRE_COMMIT_REVIEW=1 to bypass once (not recommended).",
      "",
    ]);
  }

  process.exit(0);
}

const invokedScript = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentScript = fileURLToPath(import.meta.url);
if (invokedScript && invokedScript === currentScript) {
  main();
}
