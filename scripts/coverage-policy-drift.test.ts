import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  coverageDocReferences,
  coverageThresholds,
} from "./coverage-policy.mjs";

/**
 * MW-01: Coverage policy drift detection.
 *
 * Ensures the canonical coverage policy declared in scripts/coverage-policy.mjs
 * stays in sync with configs, docs, and workflow contract checks.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

/** Compact notation used in most docs: "25% lines/functions/statements, 15% branches" */
const COMPACT_RE = /(\d+)%\s*lines\/functions\/statements.*?(\d+)%\s*branches/;

/** Prose notation: "25% for lines, functions, and statements, and 15% for branches" */
const PROSE_RE =
  /(\d+)%.*?\blines\b.*?\bfunctions\b.*?\bstatements\b.*?(\d+)%.*?\bbranches\b/;

function extractFromDoc(content: string): { lfs: number; br: number } | null {
  const compact = content.match(COMPACT_RE);
  if (compact) return { lfs: Number(compact[1]), br: Number(compact[2]) };
  const prose = content.match(PROSE_RE);
  if (prose) return { lfs: Number(prose[1]), br: Number(prose[2]) };
  return null;
}

describe("MW-01 — coverage policy drift detection", () => {
  it("vitest.config.ts imports the shared coverage policy", () => {
    const configSrc = fs.readFileSync(
      path.join(ROOT, "vitest.config.ts"),
      "utf8",
    );

    expect(configSrc).toContain("./scripts/coverage-policy.mjs");
    expect(configSrc).toContain("coverageSummaryReporters");
    expect(configSrc).toContain("coverageThresholds");
  });

  it("apps/app/electrobun/vitest.config.ts imports the shared coverage policy", () => {
    const configSrc = fs.readFileSync(
      path.join(ROOT, "apps/app/electrobun/vitest.config.ts"),
      "utf8",
    );

    expect(configSrc).toContain("../../../scripts/coverage-policy.mjs");
    expect(configSrc).toContain("coverageThresholds");
  });

  for (const relPath of coverageDocReferences) {
    it(`${relPath} matches canonical thresholds`, () => {
      const absPath = path.join(ROOT, relPath);
      expect(fs.existsSync(absPath), `${relPath} must exist`).toBe(true);

      const content = fs.readFileSync(absPath, "utf8");
      const extracted = extractFromDoc(content);
      expect(
        extracted,
        `${relPath} must reference coverage thresholds`,
      ).not.toBeNull();
      expect(extracted?.lfs).toBe(coverageThresholds.lines);
      expect(extracted?.br).toBe(coverageThresholds.branches);
    });
  }

  it("CI workflow runs bun run test:coverage", () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, ".github/workflows/test.yml"),
      "utf8",
    );
    expect(workflow).toContain("bun run test:coverage");
  });

  it("test:coverage reports per-surface coverage after Vitest", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:coverage"]).toContain(
      "node scripts/report-coverage-surfaces.mjs",
    );
  });
});
