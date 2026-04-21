export const coverageThresholds = Object.freeze({
  lines: 25,
  functions: 25,
  statements: 25,
  branches: 15,
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

export function formatCompactCoverageThresholds() {
  return `${coverageThresholds.lines}% lines/functions/statements, ${coverageThresholds.branches}% branches`;
}

export function formatCoverageThresholdSentence() {
  return `${coverageThresholds.lines}% for lines, functions, and statements, and ${coverageThresholds.branches}% for branches`;
}
