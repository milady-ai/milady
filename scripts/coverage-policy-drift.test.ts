import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  coverageDocReferences,
  coverageSurfaceGlobs,
  coverageSurfaceOverrides,
  coverageThresholds,
  formatCompactCoverageThresholds,
  formatCoverageThresholdSentence,
  getThresholdsForSurface,
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

describe("coverage policy — getThresholdsForSurface", () => {
  it("returns surface-specific overrides for packages/agent", () => {
    const thresholds = getThresholdsForSurface("packages/agent");
    expect(thresholds.lines).toBe(
      coverageSurfaceOverrides["packages/agent"].lines,
    );
    expect(thresholds.functions).toBe(
      coverageSurfaceOverrides["packages/agent"].functions,
    );
    expect(thresholds.statements).toBe(
      coverageSurfaceOverrides["packages/agent"].statements,
    );
    expect(thresholds.branches).toBe(
      coverageSurfaceOverrides["packages/agent"].branches,
    );
  });

  it("returns surface-specific overrides for packages/app-core", () => {
    const thresholds = getThresholdsForSurface("packages/app-core");
    expect(thresholds.lines).toBe(
      coverageSurfaceOverrides["packages/app-core"].lines,
    );
    expect(thresholds.branches).toBe(
      coverageSurfaceOverrides["packages/app-core"].branches,
    );
  });

  it("returns global defaults for surfaces without overrides", () => {
    const thresholds = getThresholdsForSurface("apps/app/electrobun");
    expect(thresholds).toBe(coverageThresholds);
  });

  it("returns global defaults for unknown surface names", () => {
    const thresholds = getThresholdsForSurface("nonexistent/package");
    expect(thresholds).toBe(coverageThresholds);
  });

  it("overrides are strictly higher than global defaults", () => {
    for (const [surface, override] of Object.entries(
      coverageSurfaceOverrides,
    )) {
      for (const [metric, value] of Object.entries(override)) {
        const globalValue =
          coverageThresholds[metric as keyof typeof coverageThresholds];
        expect(
          value,
          `${surface}.${metric} override (${value}) should be >= global (${globalValue})`,
        ).toBeGreaterThanOrEqual(globalValue);
      }
    }
  });

  it("merged result always contains every metric from global defaults", () => {
    const globalKeys = Object.keys(coverageThresholds);
    for (const surface of Object.keys(coverageSurfaceOverrides)) {
      const merged = getThresholdsForSurface(surface);
      for (const key of globalKeys) {
        expect(
          merged,
          `Merged thresholds for "${surface}" must contain "${key}"`,
        ).toHaveProperty(key);
        expect(typeof (merged as Record<string, unknown>)[key]).toBe("number");
      }
    }
  });

  it("merged result for overridden surface is a new object (not a reference to globals)", () => {
    for (const surface of Object.keys(coverageSurfaceOverrides)) {
      const merged = getThresholdsForSurface(surface);
      expect(merged).not.toBe(coverageThresholds);
    }
  });
});

describe("coverage policy — coverageSurfaceOverrides structure", () => {
  it("only overrides surfaces that exist in coverageSurfaceGlobs", () => {
    const validSurfaces = Object.keys(coverageSurfaceGlobs);
    for (const surface of Object.keys(coverageSurfaceOverrides)) {
      expect(
        validSurfaces,
        `Override surface "${surface}" must exist in coverageSurfaceGlobs`,
      ).toContain(surface);
    }
  });

  it("override keys are a subset of threshold metric keys", () => {
    const validMetrics = Object.keys(coverageThresholds);
    for (const [surface, override] of Object.entries(
      coverageSurfaceOverrides,
    )) {
      for (const metric of Object.keys(override)) {
        expect(
          validMetrics,
          `${surface} override metric "${metric}" must be a valid threshold key`,
        ).toContain(metric);
      }
    }
  });

  it("override values are positive numbers", () => {
    for (const [surface, override] of Object.entries(
      coverageSurfaceOverrides,
    )) {
      for (const [metric, value] of Object.entries(override)) {
        expect(typeof value).toBe("number");
        expect(
          value,
          `${surface}.${metric} must be positive`,
        ).toBeGreaterThan(0);
        expect(value, `${surface}.${metric} must be <= 100`).toBeLessThanOrEqual(
          100,
        );
      }
    }
  });
});

describe("coverage policy — formatter functions", () => {
  it("formatCompactCoverageThresholds produces expected format", () => {
    const result = formatCompactCoverageThresholds();
    expect(result).toBe(
      `${coverageThresholds.lines}% lines/functions/statements, ${coverageThresholds.branches}% branches`,
    );
  });

  it("formatCoverageThresholdSentence produces expected format", () => {
    const result = formatCoverageThresholdSentence();
    expect(result).toBe(
      `${coverageThresholds.lines}% for lines, functions, and statements, and ${coverageThresholds.branches}% for branches`,
    );
  });

  it("formatter output matches doc extraction regex", () => {
    const compact = formatCompactCoverageThresholds();
    const match = compact.match(COMPACT_RE);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(coverageThresholds.lines);
    expect(Number(match![2])).toBe(coverageThresholds.branches);
  });
});

describe("coverage policy — report-coverage-surfaces.mjs source-level checks", () => {
  it("report-coverage-surfaces.mjs imports getThresholdsForSurface", () => {
    const scriptSrc = fs.readFileSync(
      path.join(ROOT, "scripts/report-coverage-surfaces.mjs"),
      "utf8",
    );
    expect(scriptSrc).toContain("getThresholdsForSurface");
    expect(scriptSrc).toContain("coverageSurfaceGlobs");
  });

  it("report-coverage-surfaces.mjs uses per-surface thresholds", () => {
    const scriptSrc = fs.readFileSync(
      path.join(ROOT, "scripts/report-coverage-surfaces.mjs"),
      "utf8",
    );
    expect(scriptSrc).toContain("getThresholdsForSurface(surface.surface)");
    expect(scriptSrc).toContain("surface override");
  });

  it("coverageSurfaceGlobs entries match existing directories", () => {
    for (const [surface, globs] of Object.entries(coverageSurfaceGlobs)) {
      const surfacePath = path.join(ROOT, surface);
      expect(
        fs.existsSync(surfacePath),
        `Surface directory "${surface}" must exist`,
      ).toBe(true);
      expect(globs.length).toBeGreaterThan(0);
    }
  });
});
