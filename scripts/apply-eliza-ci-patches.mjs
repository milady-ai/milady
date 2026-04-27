#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const elizaDir = path.join(repoRoot, "eliza");
const patchPath = path.join(
  repoRoot,
  "patches",
  "eliza",
  "ci-release-contracts.patch",
);

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", elizaDir, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!allowFailure && result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      stderr || `git ${args.join(" ")} failed with ${result.status}`,
    );
  }

  return result;
}

// Splits a unified diff into one chunk per `diff --git` header so we can apply
// each file independently. The whole-patch apply is all-or-nothing: if a single
// hunk has drifted upstream the entire overlay is dropped. Per-file apply lets
// the unaffected files still apply, surfacing drift as a precise list rather
// than masking everything.
function splitPatchByFile(patchText) {
  const lines = patchText.split("\n");
  const chunks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) chunks.push(current);
      current = { header: line, lines: [line] };
      const match = line.match(/^diff --git a\/(\S+) b\/(\S+)/);
      if (match) {
        current.path = match[2];
      }
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) chunks.push(current);

  return chunks.map((chunk) => ({
    path: chunk.path ?? "<unknown>",
    text: `${chunk.lines.join("\n")}\n`,
  }));
}

function tryApplyPatchChunk(chunk) {
  const tmpFile = path.join(
    os.tmpdir(),
    `eliza-ci-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`,
  );
  fs.writeFileSync(tmpFile, chunk.text);
  try {
    const reverseCheck = runGit(
      ["apply", "--unidiff-zero", "--reverse", "--check", tmpFile],
      { allowFailure: true },
    );
    if (reverseCheck.status === 0) return { status: "already-applied" };

    const forwardCheck = runGit(
      ["apply", "--unidiff-zero", "--check", tmpFile],
      { allowFailure: true },
    );
    if (forwardCheck.status !== 0) {
      return { status: "drift", stderr: forwardCheck.stderr.trim() };
    }

    runGit(["apply", "--unidiff-zero", tmpFile]);
    return { status: "applied" };
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function main() {
  if (!fs.existsSync(path.join(elizaDir, "package.json"))) {
    throw new Error(
      "eliza submodule is not initialized; run scripts/init-submodules.mjs first",
    );
  }
  if (!fs.existsSync(patchPath)) {
    throw new Error(
      `missing eliza CI patch file: ${path.relative(repoRoot, patchPath)}`,
    );
  }

  const wholeApplied = runGit(
    ["apply", "--unidiff-zero", "--reverse", "--check", patchPath],
    { allowFailure: true },
  );
  if (wholeApplied.status === 0) {
    console.log("[apply-eliza-ci-patches] eliza CI patches already applied");
    return;
  }

  const wholeCheck = runGit(["apply", "--unidiff-zero", "--check", patchPath], {
    allowFailure: true,
  });
  if (wholeCheck.status === 0) {
    runGit(["apply", "--unidiff-zero", patchPath]);
    console.log("[apply-eliza-ci-patches] applied eliza CI patches");
    return;
  }

  // Whole-patch apply failed — try per-file so unaffected files still get the
  // overlay and we can report precisely which files drifted.
  const chunks = splitPatchByFile(fs.readFileSync(patchPath, "utf8"));
  const applied = [];
  const alreadyApplied = [];
  const drifted = [];

  for (const chunk of chunks) {
    const result = tryApplyPatchChunk(chunk);
    if (result.status === "applied") {
      applied.push(chunk.path);
    } else if (result.status === "already-applied") {
      alreadyApplied.push(chunk.path);
    } else {
      drifted.push(chunk.path);
    }
  }

  if (applied.length > 0) {
    console.log(
      `[apply-eliza-ci-patches] applied ${applied.length} file(s) from eliza CI patch`,
    );
  }
  if (alreadyApplied.length > 0) {
    console.log(
      `[apply-eliza-ci-patches] ${alreadyApplied.length} file(s) already at patched state`,
    );
  }
  if (drifted.length > 0) {
    console.warn(
      `[apply-eliza-ci-patches] ${drifted.length} file(s) drifted from upstream and were skipped:\n  - ${drifted.join("\n  - ")}\nRegenerate patches/eliza/ci-release-contracts.patch against the current eliza submodule HEAD.`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[apply-eliza-ci-patches] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
