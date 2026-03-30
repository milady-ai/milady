# Stream S4 - zh-CN Companion Input Lock

## Goal

Fix reported bug where companion input remains disabled after agent responds in Chinese-localized usage.

## Tracking

- GitHub issue: `#1359`
- Branch: `codex/zh-cn-input-lock`
- PR: `to open`

## Hypothesis

- UI state machine for “agent thinking/responding” is not resetting under one localized/event path.

## Plan

1. Reproduce
- [ ] Reproduce on zh-CN locale with companion mode.
- [ ] Capture event/state transition logs around response completion.

2. Root Cause
- [ ] Identify stuck state source (`loading`, `streaming`, or pending action flag).
- [ ] Confirm whether path differs between zh-CN and en.

3. Fix
- [ ] Ensure completion/error/cancel paths all unlock input.
- [ ] Add guard to avoid permanent lock on dropped events.

4. Tests
- [ ] Add regression test for companion input re-enable after response.
- [ ] Add locale-agnostic assertion so this cannot regress by translation.

## Acceptance

- Input is always re-enabled after response lifecycle ends.
- Bug reproducible before fix and gone after fix.
- Tests pass in CI.
