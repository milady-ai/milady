# UI Improvements Task Plan

## Goal
Implement obvious, minimal UI behavior improvements in `apps/app` that improve interaction reliability and accessibility without visual redesign.

## Scope Guardrails
- Keep changes to small, targeted component behavior.
- No theme, styling, or layout redesigns.
- Add tests for each behavior fix.
- After each fix: run relevant tests, then inspect diff before continuing.

## Detailed Specs

### Fix 1: Command Palette keyboard edge cases
- File: `apps/app/src/components/CommandPalette.tsx`
- Problem:
  - Arrow key navigation can compute invalid indices when there are zero filtered commands.
  - Active index can drift out of bounds when filtered list length changes.
- Change:
  - Ignore arrow/enter selection logic when `filteredCommands.length === 0`.
  - Clamp `commandActiveIndex` to the valid range whenever command list size changes.
- Acceptance:
  - No negative index updates are emitted.
  - Enter on empty results does nothing and does not crash.

### Fix 2: Save Command modal IME-safe submit and a11y labels
- File: `apps/app/src/components/SaveCommandModal.tsx`
- Problem:
  - Enter key can submit while IME composition is still active.
  - Dialog/input labeling is minimal for assistive tech.
- Change:
  - Ignore Enter submit when composition is active.
  - Add explicit label association and error description wiring.
- Acceptance:
  - Composing text with IME does not trigger save.
  - Input has label and error state announced via ARIA attributes.

## Checklist
- [x] Implement Fix 1 in `CommandPalette.tsx`
- [x] Add/extend tests for Fix 1
- [x] Run tests for Fix 1
- [x] Review git diff for Fix 1 before starting Fix 2
- [x] Implement Fix 2 in `SaveCommandModal.tsx`
- [x] Add/extend tests for Fix 2
- [x] Run tests for Fix 2
- [x] Review full git diff and diffstat
- [ ] Commit on fresh branch
- [ ] Push branch to `origin`
- [ ] Open PR into `develop`

## Verification Commands
- `bun run --cwd apps/app test`
- `git diff -- apps/app/src/components/CommandPalette.tsx`
- `git diff -- apps/app/src/components/SaveCommandModal.tsx`
- `git diff --stat`

## Review
- Fix 1 verification:
  - `bun run --cwd apps/app test -- test/app/command-palette.test.tsx`
  - Result: 1 file passed, 3 tests passed.
- Fix 2 verification:
  - `bun run --cwd apps/app test -- test/app/command-palette.test.tsx test/app/save-command-modal.test.tsx`
  - Result: 2 files passed, 6 tests passed.
- Diff review:
  - Confirmed changes are scoped to command palette and save-command modal behavior plus new targeted tests.
