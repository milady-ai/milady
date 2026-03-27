# Stream S1 - Issue #1170 Execution

## Goal

Execute issue `#1170` strictly in listed order, one task at a time, one commit per task.

## Branch / PR

- Branch: `codex/issue-1170`
- PR: `#1343` (active)

## Rules

- Baseline must be current `origin/develop`.
- No batching across tasks.
- Validate each task before moving to next.
- If task already fixed on `develop`, mark as already resolved and continue.

## Checklist

- [ ] Rebase `codex/issue-1170` to latest `origin/develop`
- [ ] Resolve conflicts cleanly
- [ ] Continue ordered tasks from current stopping point
- [ ] Keep commit format `fix(issue-1170): TNN ...`
- [ ] Run task-local tests after each task
- [ ] Update tracking checklist after each validated task

## Acceptance

- All issue `#1170` tasks completed or marked already resolved with evidence.
- CI green on PR.
- No unrelated fixes mixed into this branch.
