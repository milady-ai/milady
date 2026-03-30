export const coverageThresholds = Object.freeze({
  lines: 25,
  functions: 25,
  statements: 25,
  branches: 15,
});

/**
 * Per-surface overrides. Surfaces listed here are held to stricter thresholds
 * than the global defaults. Any metric key not specified falls back to
 * `coverageThresholds`.
 */
export const coverageSurfaceOverrides = Object.freeze({
  "packages/agent": Object.freeze({
    lines: 35,
    functions: 35,
    statements: 35,
    branches: 20,
  }),
  "packages/app-core": Object.freeze({
    lines: 30,
    functions: 30,
    statements: 30,
    branches: 18,
  }),
});

export const coverageSummaryReporters = Object.freeze([
  "text",
  "json-summary",
  "lcov",
]);

export const coverageDocReferences = Object.freeze([
  "CONTRIBUTING.md",
  "AGENTS.md",
  "docs/guides/contribution-guide.md",
  "docs/guides/contributing.md",
  "docs/plugins/publish.md",
  ".github/workflows/agent-review.yml",
]);

export const coverageSurfaceGlobs = Object.freeze({
  "packages/agent": ["packages/agent/src/**/*.ts"],
  "packages/app-core": ["packages/app-core/src/**/*.ts"],
  "apps/app/electrobun": ["apps/app/electrobun/src/**/*.ts"],
  "packages/shared": ["packages/shared/src/**/*.ts"],
});

/**
 * Returns the effective thresholds for a given surface, merging any
 * per-surface overrides on top of the global defaults.
 */
export function getThresholdsForSurface(surface) {
  const override = coverageSurfaceOverrides[surface];
  if (!override) return coverageThresholds;
  return { ...coverageThresholds, ...override };
}

export function formatCompactCoverageThresholds() {
  return `${coverageThresholds.lines}% lines/functions/statements, ${coverageThresholds.branches}% branches`;
}

export function formatCoverageThresholdSentence() {
  return `${coverageThresholds.lines}% for lines, functions, and statements, and ${coverageThresholds.branches}% for branches`;
}
