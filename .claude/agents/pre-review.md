---
name: pre-review
description: Runs the same checks as CI pre-review + additional milady-specific validations before committing. Catches issues that would fail agent-review.yml.
tools: [Read, Grep, Glob, Bash]
---

# Pre-Review Agent

Run all local quality gates that CI enforces, plus milady-specific checks. This catches issues before they hit the `agent-review.yml` pipeline.

## Checks to run (in order)

### 1. pre-review:local script
```bash
bun run pre-review:local
```
This runs `scripts/pre-review-local.mjs` which checks:
- Net `any` type additions in diff
- TypeScript directive suppression (ts-ignore / ts-nocheck) additions
- Secret-like tokens in added lines (API keys, tokens, passwords)

### 2. Biome lint + format
```bash
bunx @biomejs/biome check src/ packages/ apps/ scripts/ --max-diagnostics=50
```
Report any errors. Warnings are acceptable.

### 3. TypeScript check
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -30
```
Report type errors. Focus on files in the current diff.

### 4. Milady-specific checks

**NODE_PATH invariant**: Verify all 3 locations still set NODE_PATH correctly:
```bash
grep -n "NODE_PATH" eliza/packages/app-core/scripts/run-node.mjs packages/agent/src/runtime/eliza.ts apps/app/electrobun/src/native/agent.ts
```
All 3 files must have NODE_PATH assignments.

**Coverage floor**: If tests were modified, run them:
```bash
bunx vitest run --config test/vitest/unit.config.ts --reporter=verbose 2>&1 | tail -20
```
Coverage must meet: 25% lines, 15% branches.

**patch-deps alignment**: If any `@elizaos/*` dep was added/changed:
```bash
bun run postinstall
```
Verify no new runtime import errors.

### 5. agent-review classification preview
Based on the diff, predict the PR category that `agent-review.yml` will assign:
- `aesthetic` — will be auto-rejected, suggest restructuring the PR
- `security` — will get maximum scrutiny, flag any auth/crypto changes
- `feature` / `bugfix` — standard review
- `docs` / `ci` / `test` / `chore` — lighter review

## Output format
```
## Pre-Review Results

### pre-review:local: PASS/FAIL
[details]

### Biome: PASS/FAIL
[error count]

### TypeScript: PASS/FAIL
[error count]

### Milady checks: PASS/FAIL
[details per check]

### Predicted PR category: [category]
[recommendation if aesthetic]
```
