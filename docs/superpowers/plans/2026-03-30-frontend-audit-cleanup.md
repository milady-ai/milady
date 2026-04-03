# Frontend Audit & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up 61 frontend issues across three independent workstreams: dead code removal + dark mode fixes, token/z-index centralization, and homepage alignment.

**Architecture:** Three parallel workstreams that can be developed and merged independently. WS1 (dead code & dark mode) is purely subtractive/corrective. WS2 (tokens & z-index) adds infrastructure then migrates consumers. WS3 (homepage alignment) imports shared tokens and replaces hardcoded colors. No visual changes intended — same rendering, cleaner source.

**Tech Stack:** React 19, Tailwind CSS v4, CSS custom properties, CVA, Radix UI

**Spec:** `docs/superpowers/specs/2026-03-30-frontend-audit-cleanup-design.md`

---

## Workstream 1: Dead Code & Dark Mode Fixes

### Task 1: Delete unused UI components

**Files:**
- Delete: `packages/ui/src/components/ui/chat-atoms.tsx`
- Delete: `packages/ui/src/components/ui/confirm-delete.tsx`
- Delete: `packages/ui/src/components/ui/search-bar.tsx`
- Delete: `packages/ui/src/components/ui/search-input.tsx`
- Delete: `packages/ui/src/components/ui/tag-editor.tsx`
- Delete: `packages/ui/src/components/ui/tag-input.tsx`
- Delete: `packages/ui/src/components/ui/sonner.tsx`
- Delete: `packages/ui/src/components/ui/tooltip-extended.tsx`
- Modify: `packages/ui/src/index.ts` (remove 8 export lines)
- Delete: any test files for the above (`*.test.tsx` in same directory)
- Delete: any story files for the above (in `packages/ui/src/stories/`)

- [ ] **Step 1: Verify no imports exist for these components**

Run a search to confirm zero imports before deleting. This is a safety check.

```bash
bun run --filter @miladyai/ui build 2>&1 | head -20
grep -r "chat-atoms\|confirm-delete\|search-bar\|search-input\|tag-editor\|tag-input\|sonner\|tooltip-extended" \
  packages/app-core/src/ apps/app/src/ apps/homepage/src/ \
  --include="*.ts" --include="*.tsx" \
  -l
```

Expected: No files returned (or only the component files themselves). If any app-code imports these, stop and investigate before deleting.

- [ ] **Step 2: Delete the 8 component files**

```bash
rm packages/ui/src/components/ui/chat-atoms.tsx
rm packages/ui/src/components/ui/confirm-delete.tsx
rm packages/ui/src/components/ui/search-bar.tsx
rm packages/ui/src/components/ui/search-input.tsx
rm packages/ui/src/components/ui/tag-editor.tsx
rm packages/ui/src/components/ui/tag-input.tsx
rm packages/ui/src/components/ui/sonner.tsx
rm packages/ui/src/components/ui/tooltip-extended.tsx
```

- [ ] **Step 3: Delete corresponding test files**

```bash
rm -f packages/ui/src/components/ui/chat-atoms.test.tsx
rm -f packages/ui/src/components/ui/confirm-delete.test.tsx
rm -f packages/ui/src/components/ui/search-bar.test.tsx
rm -f packages/ui/src/components/ui/search-input.test.tsx
rm -f packages/ui/src/components/ui/tag-editor.test.tsx
rm -f packages/ui/src/components/ui/tag-input.test.tsx
rm -f packages/ui/src/components/ui/sonner.test.tsx
rm -f packages/ui/src/components/ui/tooltip-extended.test.tsx
```

- [ ] **Step 4: Delete corresponding story files**

```bash
rm -f packages/ui/src/stories/ChatAtoms.stories.tsx
rm -f packages/ui/src/stories/ConfirmDelete.stories.tsx
rm -f packages/ui/src/stories/SearchBar.stories.tsx
rm -f packages/ui/src/stories/SearchInput.stories.tsx
rm -f packages/ui/src/stories/TagEditor.stories.tsx
rm -f packages/ui/src/stories/TagInput.stories.tsx
rm -f packages/ui/src/stories/Sonner.stories.tsx
rm -f packages/ui/src/stories/TooltipExtended.stories.tsx
```

- [ ] **Step 5: Remove barrel exports from `packages/ui/src/index.ts`**

Remove these 8 lines (exact line numbers may shift after prior edits — match by content):

```
export * from "./components/ui/chat-atoms";
export * from "./components/ui/confirm-delete";
export * from "./components/ui/search-bar";
export * from "./components/ui/search-input";
export * from "./components/ui/sonner";
export * from "./components/ui/tag-editor";
export * from "./components/ui/tag-input";
export * from "./components/ui/tooltip-extended";
```

- [ ] **Step 6: Build and test**

```bash
bun run build
bun run test
```

Expected: Build succeeds, all tests pass. No broken imports.

- [ ] **Step 7: Commit**

```bash
git add -A packages/ui/
git commit -m "chore: remove 8 unused UI components

Remove chat-atoms, confirm-delete, search-bar, search-input,
tag-editor, tag-input, sonner, tooltip-extended — exported but
never imported anywhere in the codebase."
```

---

### Task 2: Delete unused CSS (animations and variables)

**Files:**
- Modify: `packages/app-core/src/styles/styles.css` (remove `avatar-loader-progress` keyframe)
- Modify: `packages/app-core/src/styles/base.css` (remove `--duration-fast` and `--duration-slow`)
- Modify: `apps/homepage/src/styles.css` (remove `slide-in-left` and `marquee-vertical` keyframes)

- [ ] **Step 1: Remove `avatar-loader-progress` keyframe from styles.css**

In `packages/app-core/src/styles/styles.css`, find and remove the entire `@keyframes avatar-loader-progress` block (starts at line ~165):

```css
@keyframes avatar-loader-progress {
  0% {
    width: 20%;
    opacity: 0.6;
  }

  50% {
    width: 70%;
    opacity: 1;
  }

  100% {
    width: 20%;
    opacity: 0.6;
  }
}
```

- [ ] **Step 2: Remove unused duration variables from base.css**

In `packages/app-core/src/styles/base.css`, in the `:root` block (around lines 90-92), remove:

```css
  --duration-fast: 100ms;
  --duration-slow: 250ms;
```

Keep `--duration-normal: 150ms;` (it is used).

In the `[data-theme="dark"], .dark` block (around lines 194-196), remove:

```css
  --duration-fast: 150ms;
  --duration-slow: 300ms;
```

Keep `--duration-normal: 200ms;`.

Also remove the corresponding Tailwind mappings in `packages/app-core/src/styles/styles.css` inside the `@theme inline` block if `--duration-fast` or `--duration-slow` are mapped there. Search for them first.

- [ ] **Step 3: Remove unused keyframes from homepage styles**

In `apps/homepage/src/styles.css`, find and remove the `@keyframes slide-in-left` and `@keyframes marquee-vertical` blocks. Search for them by name to find exact locations.

- [ ] **Step 4: Build and test**

```bash
bun run build
bun run test
```

Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/styles/styles.css packages/app-core/src/styles/base.css apps/homepage/src/styles.css
git commit -m "chore: remove unused CSS animations and variables

Delete avatar-loader-progress, slide-in-left, marquee-vertical
keyframes and --duration-fast/--duration-slow variables — none
are referenced anywhere in the codebase."
```

---

### Task 3: Fix dark mode — switch thumb and toggle thumb

**Files:**
- Modify: `packages/ui/src/components/ui/switch.tsx:20`
- Modify: `packages/app-core/src/config/ui-renderer.tsx:669`

- [ ] **Step 1: Fix switch thumb in `packages/ui/src/components/ui/switch.tsx`**

On line 20, the switch thumb has `bg-white` which is invisible in light mode. Replace:

```
bg-white
```

with:

```
bg-[var(--card)]
```

The full className string on line 20 should change from:
```
"pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
```
to:
```
"pointer-events-none block h-5 w-5 rounded-full bg-[var(--card)] shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
```

- [ ] **Step 2: Fix toggle thumb in `packages/app-core/src/config/ui-renderer.tsx`**

On line 669, the toggle thumb has `bg-white`. Replace:

```
className={`absolute top-0.5 w-[14px] h-[14px] bg-white transition-all ${checked ? "left-5" : "left-0.5"}`}
```

with:

```
className={`absolute top-0.5 w-[14px] h-[14px] bg-[var(--card)] transition-all ${checked ? "left-5" : "left-0.5"}`}
```

- [ ] **Step 3: Run existing switch tests**

```bash
bun run test -- --filter switch
```

Expected: Tests pass (the test verifies rendering, not specific color).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ui/switch.tsx packages/app-core/src/config/ui-renderer.tsx
git commit -m "fix: switch/toggle thumb invisible in light mode

Replace hardcoded bg-white with bg-[var(--card)] so the thumb
adapts to the active theme."
```

---

### Task 4: Fix dark mode — confirm dialog warn tone

**Files:**
- Modify: `packages/ui/src/components/ui/confirm-dialog.tsx:31`

- [ ] **Step 1: Fix warn tone text color**

On line 31, the warn tone button class includes `text-black`. Replace the entire warn entry:

```typescript
warn: "border-warn/55 bg-warn/92 text-black hover:border-warn hover:bg-warn",
```

with:

```typescript
warn: "border-warn/55 bg-warn/92 text-[var(--accent-foreground)] hover:border-warn hover:bg-warn",
```

`--accent-foreground` is defined as `#0b0e11` in light mode and `#0b0e11` in dark mode (jet black in brand-gold.css), which provides correct contrast against the warn/gold background in both themes.

- [ ] **Step 2: Run confirm dialog tests**

```bash
bun run test -- --filter confirm-dialog
```

Expected: Tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/confirm-dialog.tsx
git commit -m "fix: warn button text unreadable in dark mode

Replace hardcoded text-black with text-[var(--accent-foreground)]
for proper contrast on gold background in both themes."
```

---

### Task 5: Fix dark mode — ConnectionFailedBanner

**Files:**
- Modify: `packages/app-core/src/components/ConnectionFailedBanner.tsx:72`

- [ ] **Step 1: Fix retry button colors**

On line 72, replace:

```
className="rounded bg-white px-3 py-1 text-[12px] font-semibold text-red-700 hover:bg-red-50 border-transparent"
```

with:

```
className="rounded bg-[var(--card)] px-3 py-1 text-[12px] font-semibold text-[var(--destructive)] hover:bg-[var(--bg-hover)] border-transparent"
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/ConnectionFailedBanner.tsx
git commit -m "fix: retry button invisible in dark mode

Replace bg-white and text-red-700 with semantic tokens."
```

---

### Task 6: Fix dark mode — WhatsAppQrOverlay

**Files:**
- Modify: `packages/app-core/src/components/WhatsAppQrOverlay.tsx:159`

- [ ] **Step 1: Fix QR code container**

On line 159, the QR code container uses `bg-white`. QR codes require a light background for scanning, so we keep white in dark mode but adapt for light mode:

Replace:
```
className="w-48 h-48 bg-white"
```

with:
```
className="w-48 h-48 bg-white dark:bg-white"
```

Note: QR codes genuinely need white backgrounds for scanner readability. Adding explicit `dark:bg-white` documents this as intentional rather than a bug. If the QR code were ever placed in a theme-aware context, this prevents accidental removal.

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/WhatsAppQrOverlay.tsx
git commit -m "fix: document QR code white background as intentional

Add explicit dark:bg-white to signal this is not a theme bug —
QR codes require light backgrounds for scanner readability."
```

---

### Task 7: Fix dark mode — LoadingScreen

**Files:**
- Modify: `packages/app-core/src/components/LoadingScreen.tsx:108,116-118`

- [ ] **Step 1: Replace hardcoded colors in LoadingScreen**

On line 108, replace:
```
bg-[#0c0e14]
```
with:
```
bg-[var(--bg)]
```

On line 116, replace:
```
bg-white/10
```
with:
```
bg-[var(--bg-accent)]
```

On line 118, replace:
```
bg-white/85
```
with:
```
bg-[var(--accent)]
```

Also on line 118, replace:
```
shadow-[0_0_8px_rgba(255,255,255,0.3)]
```
with:
```
shadow-[0_0_8px_var(--accent-subtle)]
```

On line 110, replace:
```
text-white/70
```
with:
```
text-[var(--text)]/70
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/LoadingScreen.tsx
git commit -m "fix: loading screen uses hardcoded colors

Replace bg-[#0c0e14], bg-white/*, text-white with semantic
tokens so loading screen respects the active theme."
```

---

### Task 8: Fix dark mode — VrmStage

**Files:**
- Modify: `packages/app-core/src/components/VrmStage.tsx:238`

- [ ] **Step 1: Replace hardcoded background**

On line 238, replace:
```
bg-[#030711]
```
with:
```
bg-[var(--bg)]
```

The full className:
```
className="fixed inset-0 z-0 overflow-hidden bg-[#030711]"
```
becomes:
```
className="fixed inset-0 z-0 overflow-hidden bg-[var(--bg)]"
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/VrmStage.tsx
git commit -m "fix: VRM stage background ignores theme

Replace hardcoded bg-[#030711] with bg-[var(--bg)]."
```

---

### Task 9: WS1 final verification

- [ ] **Step 1: Full build and test**

```bash
bun run build
bun run check
bun run test
```

Expected: All pass. No regressions.

- [ ] **Step 2: Visual spot-check**

```bash
bun run dev
```

Open the app in a browser. Toggle between light and dark mode. Verify:
- Switch components have visible thumbs in both themes
- Loading screen renders correctly in both themes
- VRM stage background matches theme
- No missing components or broken imports

---

## Workstream 2: Token System & Z-Index Constants

### Task 10: Expand z-index constants in `floating-layers.ts`

**Files:**
- Modify: `packages/ui/src/lib/floating-layers.ts`

- [ ] **Step 1: Add z-index scale constants**

Replace the entire contents of `packages/ui/src/lib/floating-layers.ts` with:

```typescript
// ── Z-index scale ──────────────────────────────────────────────
// Every z-index in the app must come from this file.
// Values are intentionally sparse so new layers can be inserted.

export const Z_BASE = 0;
export const Z_DROPDOWN = 10;
export const Z_STICKY = 20;
export const Z_MODAL_BACKDROP = 50;
export const Z_MODAL = 100;
export const Z_DIALOG_OVERLAY = 160;
export const Z_DIALOG = 170;
export const Z_OVERLAY = 200;
export const Z_TOOLTIP = 300;
export const Z_SYSTEM_BANNER = 9998;
export const Z_SYSTEM_CRITICAL = 9999;
export const Z_SHELL_OVERLAY = 10000;
export const Z_GLOBAL_EMOTE = 11000;
export const Z_SELECT_FLOAT = 12000;

// ── Legacy aliases (preserved for backwards compat) ───────────
export const SELECT_FLOATING_LAYER_NAME = "config-select";
export const SELECT_FLOATING_LAYER_Z_INDEX = Z_SELECT_FLOAT;
export const SELECT_FLOATING_LAYER_CLASSNAME = `z-[${Z_SELECT_FLOAT}]`;
```

- [ ] **Step 2: Build to verify no breakage**

```bash
bun run build
```

Expected: Build succeeds. Existing code still imports `SELECT_FLOATING_LAYER_*` and those still work.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/floating-layers.ts
git commit -m "feat: add complete z-index scale to floating-layers.ts

Define 14 named z-index constants covering every layer in the
app. Existing SELECT_FLOATING_LAYER_* aliases preserved."
```

---

### Task 11: Migrate components to z-index constants

**Files:**
- Modify: `packages/ui/src/components/ui/themed-select.tsx:191`
- Modify: `packages/ui/src/components/ui/drawer-sheet.tsx:22`
- Modify: `packages/ui/src/components/ui/dialog.tsx:22`
- Modify: `packages/app-core/src/App.tsx:724`
- Modify: `packages/app-core/src/components/ChatModalView.tsx:16`
- Modify: `packages/app-core/src/components/OwnerNamePrompt.tsx:86`
- Modify: `packages/app-core/src/components/ShellOverlays.tsx:23`
- Modify: `packages/app-core/src/components/EmotePicker.tsx:383`
- Modify: `apps/homepage/src/App.tsx:155`

Note: Files from packages that deleted components (tooltip-extended z-[200]/z-[300]) are already gone from WS1. SystemWarningBanner, RestartBanner, ConnectionFailedBanner, and GlobalEmoteOverlay also need updating — search for all remaining z-[NNNN] usages.

- [ ] **Step 1: Search for all ad-hoc z-index values**

```bash
grep -rn 'z-\[1[0-9][0-9]\]\|z-\[2[0-9][0-9]\]\|z-\[3[0-9][0-9]\]\|z-\[9[0-9][0-9][0-9]\]\|z-\[1[0-9][0-9][0-9][0-9]\]' \
  packages/ui/src/ packages/app-core/src/ apps/homepage/src/ apps/app/src/ \
  --include="*.tsx" --include="*.ts"
```

This gives you the full list of files to update. For each file:

- [ ] **Step 2: Update `packages/ui/` components**

In each file, add the import at the top:
```typescript
import { Z_MODAL, Z_DIALOG_OVERLAY } from "../lib/floating-layers";
```

Then replace the hardcoded values:
- `themed-select.tsx:191` — replace `z-[100]` with `` z-[${Z_MODAL}] `` (template literal in className)
- `drawer-sheet.tsx:22` — replace `z-[160]` with `` z-[${Z_DIALOG_OVERLAY}] ``
- `dialog.tsx:22` — replace `z-[160]` with `` z-[${Z_DIALOG_OVERLAY}] ``

For Tailwind to pick up dynamic class names, the z-index values are numeric constants that resolve at build time, so `z-[${Z_DIALOG_OVERLAY}]` works because `Z_DIALOG_OVERLAY` is `160` — Tailwind sees `z-[160]` in the output. Since the values haven't changed, no Tailwind safelist is needed.

- [ ] **Step 3: Update `packages/app-core/` components**

In each file, add the import:
```typescript
import { Z_MODAL, Z_OVERLAY, Z_SYSTEM_CRITICAL, Z_SHELL_OVERLAY, Z_GLOBAL_EMOTE, Z_SYSTEM_BANNER } from "@miladyai/ui";
```

Then replace hardcoded values:
- `App.tsx:724` — replace `z-[100]` with `` z-[${Z_MODAL}] ``
- `ChatModalView.tsx:16` — replace `z-[100]` with `` z-[${Z_MODAL}] ``
- `OwnerNamePrompt.tsx:86` — replace `z-[200]` with `` z-[${Z_OVERLAY}] ``
- `ShellOverlays.tsx:23` — replace `z-[10000]` with `` z-[${Z_SHELL_OVERLAY}] ``
- `EmotePicker.tsx:383` — replace `z-[9999]` with `` z-[${Z_SYSTEM_CRITICAL}] ``

Search for and update any remaining files: `SystemWarningBanner.tsx` (z-[9998] -> Z_SYSTEM_BANNER), `RestartBanner.tsx` (z-[9998] -> Z_SYSTEM_BANNER), `ConnectionFailedBanner.tsx` (z-[9999] -> Z_SYSTEM_CRITICAL), `GlobalEmoteOverlay.tsx` (z-[11000] -> Z_GLOBAL_EMOTE).

- [ ] **Step 4: Update `apps/homepage/src/App.tsx`**

```typescript
import { Z_MODAL } from "@miladyai/ui";
```

Replace `z-[100]` with `` z-[${Z_MODAL}] ``.

- [ ] **Step 5: Verify no remaining ad-hoc z-index values**

```bash
grep -rn 'z-\[1[0-9][0-9]\]\|z-\[2[0-9][0-9]\]\|z-\[3[0-9][0-9]\]\|z-\[9[0-9][0-9][0-9]\]\|z-\[1[0-9][0-9][0-9][0-9]\]' \
  packages/ui/src/ packages/app-core/src/ apps/homepage/src/ apps/app/src/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "floating-layers.ts" \
  | grep -v "node_modules"
```

Expected: No results (all ad-hoc z-values migrated to constants).

- [ ] **Step 6: Build and test**

```bash
bun run build
bun run test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: migrate all z-index values to floating-layers constants

Replace 13+ ad-hoc z-[NNNN] values across the codebase with
named imports from floating-layers.ts."
```

---

### Task 12: Add status color tokens

**Files:**
- Modify: `packages/app-core/src/styles/base.css` (add `--status-*` variables)
- Modify: `packages/app-core/src/styles/styles.css` (add `--color-status-*` Tailwind mappings)

- [ ] **Step 1: Add status tokens to base.css light theme**

In `packages/app-core/src/styles/base.css`, in the `:root` block, after the `--info` line (~line 51), add:

```css
  /* Status semantic aliases */
  --status-success: var(--ok);
  --status-success-bg: var(--ok-subtle);
  --status-danger: var(--danger);
  --status-danger-bg: var(--destructive-subtle);
  --status-warning: var(--warn);
  --status-warning-bg: var(--warn-subtle);
  --status-info: #3b82f6;
  --status-info-bg: rgba(59, 130, 246, 0.12);
```

- [ ] **Step 2: Add dark mode overrides**

In the `[data-theme="dark"], .dark` block, after the existing info line, add:

```css
  --status-success: var(--ok);
  --status-success-bg: var(--ok-subtle);
  --status-danger: var(--danger);
  --status-danger-bg: var(--destructive-subtle);
  --status-warning: var(--warn);
  --status-warning-bg: var(--warn-subtle);
  --status-info: #60a5fa;
  --status-info-bg: rgba(96, 165, 250, 0.12);
```

Note: `--status-info` uses a lighter blue (`#60a5fa`) in dark mode for readability.

- [ ] **Step 3: Add Tailwind mappings in styles.css**

In `packages/app-core/src/styles/styles.css`, inside the `@theme inline` block, after the existing status color mappings (~line 58), add:

```css
  --color-status-success: var(--status-success);
  --color-status-success-bg: var(--status-success-bg);
  --color-status-danger: var(--status-danger);
  --color-status-danger-bg: var(--status-danger-bg);
  --color-status-warning: var(--status-warning);
  --color-status-warning-bg: var(--status-warning-bg);
  --color-status-info: var(--status-info);
  --color-status-info-bg: var(--status-info-bg);
```

This enables Tailwind classes: `text-status-success`, `bg-status-danger-bg`, etc.

- [ ] **Step 4: Build to verify**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/styles/base.css packages/app-core/src/styles/styles.css
git commit -m "feat: add semantic status color tokens

Add --status-success, --status-danger, --status-warning,
--status-info with light/dark variants and Tailwind mappings."
```

---

### Task 13: Migrate hardcoded status colors in app-core components

**Files:**
- Modify: `packages/app-core/src/components/BscTradePanel.tsx`
- Modify: `packages/app-core/src/components/CustomActionsPanel.tsx`
- Modify: `packages/app-core/src/components/CharacterEditor.tsx`
- Modify: `packages/app-core/src/components/steward/StatusBadge.tsx`
- Modify: `packages/app-core/src/components/steward/ApprovalQueue.tsx`
- Modify: `packages/app-core/src/components/inventory/WalletTabBar.tsx`
- Modify: `packages/app-core/src/config/ui-renderer.tsx`

- [ ] **Step 1: Search for all hardcoded status colors**

```bash
grep -rn 'text-red-\|text-green-\|text-emerald-\|text-blue-\|text-yellow-\|text-purple-\|bg-red-\|bg-green-\|bg-emerald-\|bg-blue-\|bg-yellow-\|bg-purple-\|border-red-\|border-green-\|border-emerald-' \
  packages/app-core/src/ \
  --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Replace in each file using this mapping**

| Old class | New class |
|-----------|-----------|
| `text-red-400`, `text-red-500`, `text-red-700` | `text-status-danger` |
| `text-green-400`, `text-green-500`, `text-emerald-400` | `text-status-success` |
| `text-blue-400` | `text-status-info` |
| `text-yellow-400`, `text-yellow-300` | `text-status-warning` |
| `text-purple-400` | `text-accent` (purple is used for code/shell actions — keep as accent or define a new token if needed) |
| `bg-red-500/10`, `bg-red-500/15`, `bg-red-500/20` | `bg-status-danger-bg` |
| `bg-green-500/10`, `bg-green-400/10`, `bg-emerald-500/10` | `bg-status-success-bg` |
| `bg-blue-500/10`, `bg-blue-500/15`, `bg-blue-500/20` | `bg-status-info-bg` |
| `bg-yellow-500/10`, `bg-yellow-500/15` | `bg-status-warning-bg` |
| `border-red-500/20`, `border-red-500/30` | `border-status-danger/20` |
| `border-green-400/20`, `border-green-500/20` | `border-status-success/20` |
| `bg-red-500 text-white` (notification badge) | `bg-status-danger text-[var(--destructive-foreground)]` |

Apply these replacements file by file. For each file, read the current content, apply the mapping, and verify the change makes sense in context. Some instances may be intentionally different (e.g., purple for shell actions) — use judgment.

- [ ] **Step 3: Build and test**

```bash
bun run build
bun run test
```

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/
git commit -m "refactor: replace hardcoded status colors with semantic tokens

Migrate ~20 component files from text-red-400, bg-green-500/10
etc. to text-status-danger, bg-status-success-bg etc."
```

---

### Task 14: Update chain colors to use CSS variables

**Files:**
- Modify: `packages/app-core/src/components/chainConfig.ts`

- [ ] **Step 1: Replace hardcoded hex values with CSS variable references**

In `packages/app-core/src/components/chainConfig.ts`, the chain configs define `color` properties with hex values. The `@theme inline` block in `styles.css` already defines `--color-chain-eth`, `--color-chain-base`, etc. Update each chain config:

| Chain | Old value | New value |
|-------|-----------|-----------|
| ethereum | `"#627eea"` | `"var(--color-chain-eth)"` |
| base | `"#0052ff"` | `"var(--color-chain-base)"` |
| arbitrum | `"#12aaff"` | `"var(--color-chain-arb)"` |
| optimism | `"#ff0420"` | `"var(--color-chain-op)"` |
| polygon | `"#8247e5"` | `"var(--color-chain-pol)"` |
| solana | `"#9945ff"` | `"var(--color-chain-sol)"` |
| bsc | `"#f3ba2f"` | `"var(--color-chain-bsc)"` |

Note: Check how the `color` property is consumed. If it's used in inline styles (`style={{ color: config.color }}`), `var()` works. If it's used in Tailwind arbitrary values (`text-[${config.color}]`), `var()` also works. If it's used for canvas/chart rendering, `var()` won't work — in that case, keep the hex value and add a comment referencing the CSS variable.

- [ ] **Step 2: Verify arbitrum color alignment**

The audit found `chainConfig.ts` uses `#12aaff` for arbitrum but `styles.css` defines `--color-chain-arb: #28a0f0`. Align them: update `styles.css` to match the actual Arbitrum brand color, or update `chainConfig.ts` to match `styles.css`. Check the official Arbitrum brand guidelines and pick the correct one.

- [ ] **Step 3: Build and test**

```bash
bun run build
bun run test
```

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/components/chainConfig.ts packages/app-core/src/styles/styles.css
git commit -m "refactor: chain colors reference CSS variables

Replace hardcoded hex values in chainConfig.ts with var()
references to --color-chain-* tokens."
```

---

### Task 15: Standardize prop naming (tone -> variant)

**Files:**
- Modify: `packages/ui/src/components/ui/status-badge.tsx`
- Modify: `packages/ui/src/components/ui/confirm-dialog.tsx`
- Modify: `packages/ui/src/components/ui/status-badge.test.tsx`
- Modify: `packages/ui/src/stories/StatusBadge.stories.tsx`
- Modify: `packages/ui/src/stories/ConfirmDialog.stories.tsx`
- Modify: all consumer files that pass `tone` prop

- [ ] **Step 1: Rename in StatusBadge**

In `packages/ui/src/components/ui/status-badge.tsx`:

1. Rename the type: `StatusTone` -> `StatusVariant` (line 4)
2. Update the styles record type: `Record<StatusTone, ...>` -> `Record<StatusVariant, ...>` (line 6)
3. Rename the prop: `tone: StatusTone` -> `variant: StatusVariant` (line 37)
4. Update the destructuring in the component body: `tone` -> `variant`
5. Update the lookup: `STATUS_TONE_STYLES[tone]` -> `STATUS_VARIANT_STYLES[variant]`
6. Rename the constant: `STATUS_TONE_STYLES` -> `STATUS_VARIANT_STYLES`

Full type export becomes:
```typescript
export type StatusVariant = "success" | "warning" | "danger" | "muted";
```

Full interface becomes:
```typescript
export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  variant: StatusVariant;
  withDot?: boolean;
}
```

- [ ] **Step 2: Rename in ConfirmDialog**

In `packages/ui/src/components/ui/confirm-dialog.tsx`:

1. Rename the type: `ConfirmTone` -> `ConfirmVariant` (line 15)
2. Update the styles record: `TONE_CLASSES` -> `VARIANT_CLASSES` (line 28)
3. Rename the prop: `tone?: ConfirmTone` -> `variant?: ConfirmVariant` (line 23)
4. Update the destructuring and lookup in the component body

Full type export becomes:
```typescript
export type ConfirmVariant = "danger" | "warn" | "default";
```

- [ ] **Step 3: Update test and story files**

Update `status-badge.test.tsx` and all story files to use `variant` instead of `tone`.

- [ ] **Step 4: Update all consumer call sites**

Search for all files that pass `tone` to StatusBadge or ConfirmDialog:

```bash
grep -rn 'tone=' packages/app-core/src/ apps/ --include="*.tsx" --include="*.ts"
```

Update each instance: `tone="success"` -> `variant="success"`, etc.

- [ ] **Step 5: Update barrel exports**

In `packages/ui/src/index.ts`, the exports are `*` re-exports so the renamed types will flow through automatically. No change needed.

- [ ] **Step 6: Build and test**

```bash
bun run build
bun run test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename tone prop to variant in StatusBadge and ConfirmDialog

Standardize on 'variant' across all UI components. Updates all
consumer call sites, tests, and stories."
```

---

### Task 16: WS2 final verification

- [ ] **Step 1: Full build and test**

```bash
bun run build
bun run check
bun run test
```

- [ ] **Step 2: Verify no remaining ad-hoc values**

```bash
# Z-index check
grep -rn 'z-\[[0-9]' packages/ apps/ --include="*.tsx" --include="*.ts" | grep -v floating-layers | grep -v node_modules

# Hardcoded status color check
grep -rn 'text-red-\|text-green-\|text-emerald-\|bg-red-\|bg-green-\|bg-emerald-' packages/app-core/src/ --include="*.tsx" --include="*.ts"
```

Expected: Minimal or zero results.

---

## Workstream 3: Homepage Alignment

### Task 17: Import shared tokens into homepage

**Files:**
- Modify: `apps/homepage/src/styles.css`

- [ ] **Step 1: Add shared base.css import**

At the top of `apps/homepage/src/styles.css`, after the existing `@import "tailwindcss"` line, add:

```css
@import "@miladyai/app-core/styles/base.css";
```

This brings in all the shared CSS custom properties (`--bg`, `--text`, `--accent`, `--border`, `--ok`, `--danger`, `--warn`, etc.) with light and dark mode support.

- [ ] **Step 2: Remap the @theme inline block**

Replace the homepage's `@theme inline` block. Keep homepage-only tokens, remap shared ones:

```css
@theme inline {
  /* Fonts — homepage uses DM Sans (branded); app uses system stack */
  --font-sans: "DM Sans", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "Courier New", monospace;
  --font-display: "DM Sans", "Helvetica Neue", Arial, sans-serif;

  /* Map to shared tokens */
  --color-dark: var(--bg);
  --color-dark-secondary: var(--bg-elevated);
  --color-light: var(--text);
  --color-brand: var(--accent);
  --color-brand-hover: var(--accent-hover);
  --color-brand-muted: var(--accent-muted);
  --color-accent: var(--accent);
  --color-text-light: var(--text);
  --color-text-dark: var(--text-strong);
  --color-text-muted: var(--muted);
  --color-text-subtle: var(--muted-strong);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--bg-elevated);
  --color-surface-hover: var(--bg-hover);
  --color-border: var(--border);
  --color-border-subtle: var(--border);

  /* Homepage-only status tokens */
  --color-status-running: var(--ok);
  --color-status-paused: var(--warn);
  --color-status-stopped: var(--danger);
  --color-status-provisioning: var(--warn);
}
```

This preserves all the `--color-*` class names that homepage components use (so `text-text-muted`, `bg-dark`, `border-border` all keep working) while sourcing values from the shared system.

- [ ] **Step 3: Build homepage to verify**

```bash
bun run build --filter homepage
```

Expected: Build succeeds. Colors now come from shared tokens.

- [ ] **Step 4: Commit**

```bash
git add apps/homepage/src/styles.css
git commit -m "refactor: homepage tokens now reference shared base.css

Import @miladyai/app-core/styles/base.css and remap all homepage
color tokens to shared variables. Values align automatically."
```

---

### Task 18: Remove duplicate font loading

**Files:**
- Modify: `apps/homepage/index.html`

- [ ] **Step 1: Remove the Google Fonts `<link>` from index.html**

In `apps/homepage/index.html`, remove line 17:

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet" />
```

The `@import url(...)` in `apps/homepage/src/styles.css` line 1 already loads DM Sans and JetBrains Mono. The HTML `<link>` is a duplicate load.

- [ ] **Step 2: Build and verify fonts still load**

```bash
bun run build --filter homepage
```

Serve the built homepage and confirm DM Sans renders correctly in the browser (DevTools > Network > Fonts tab should show one Google Fonts request, not two).

- [ ] **Step 3: Commit**

```bash
git add apps/homepage/index.html
git commit -m "perf: remove duplicate Google Fonts link from homepage

DM Sans was loaded both via CSS @import and HTML <link>.
Keep only the CSS @import."
```

---

### Task 19: Replace hardcoded status colors in homepage components

**Files:**
- Modify: `apps/homepage/src/components/dashboard/AgentCard.tsx`
- Modify: `apps/homepage/src/components/dashboard/CreditsPanel.tsx`
- Modify: `apps/homepage/src/components/dashboard/PolicyControls.tsx`
- Modify: `apps/homepage/src/components/dashboard/WalletsPanel.tsx`
- Modify: `apps/homepage/src/components/dashboard/LogsPanel.tsx`
- Modify: `apps/homepage/src/components/dashboard/AuthGate.tsx`
- Modify: `apps/homepage/src/components/dashboard/CreateAgentForm.tsx`
- Modify: `apps/homepage/src/components/dashboard/AgentDetail.tsx`
- Modify: `apps/homepage/src/components/dashboard/ApprovalQueue.tsx`
- Modify: `apps/homepage/src/components/dashboard/AgentGrid.tsx`
- Modify: `apps/homepage/src/components/dashboard/ExportPanel.tsx`
- Modify: `apps/homepage/src/components/dashboard/TransactionHistory.tsx`
- Modify: `apps/homepage/src/components/dashboard/WalletOverview.tsx`
- Modify: `apps/homepage/src/components/dashboard/SourceBar.tsx`

- [ ] **Step 1: Replace colors in AgentCard.tsx STATE_CONFIG**

In `apps/homepage/src/components/dashboard/AgentCard.tsx`, replace the STATE_CONFIG object (lines 31-70):

```typescript
const STATE_CONFIG: Record<
  string,
  { color: string; bg: string; bgLight: string; label: string; border: string }
> = {
  running: {
    color: "text-status-running",
    bg: "bg-status-running",
    bgLight: "bg-status-running/10",
    border: "border-status-running/20",
    label: "LIVE",
  },
  paused: {
    color: "text-brand",
    bg: "bg-brand",
    bgLight: "bg-brand/10",
    border: "border-brand/20",
    label: "PAUSED",
  },
  stopped: {
    color: "text-status-stopped",
    bg: "bg-status-stopped",
    bgLight: "bg-status-stopped/10",
    border: "border-status-stopped/20",
    label: "STOPPED",
  },
  provisioning: {
    color: "text-brand",
    bg: "bg-brand",
    bgLight: "bg-brand/10",
    border: "border-brand/20",
    label: "STARTING",
  },
  unknown: {
    color: "text-text-muted",
    bg: "bg-text-muted",
    bgLight: "bg-text-muted/10",
    border: "border-text-muted/20",
    label: "OFFLINE",
  },
};
```

- [ ] **Step 2: Apply the replacement mapping across all other dashboard files**

Use this mapping for all remaining files:

| Old class | New class |
|-----------|-----------|
| `text-emerald-400` | `text-status-running` |
| `bg-emerald-500` | `bg-status-running` |
| `bg-emerald-500/10` | `bg-status-running/10` |
| `border-emerald-500/20` | `border-status-running/20` |
| `text-red-400` | `text-status-stopped` |
| `bg-red-500` | `bg-status-stopped` |
| `bg-red-500/10` | `bg-status-stopped/10` |
| `border-red-500/20` | `border-status-stopped/20` |
| `border-red-500/30` | `border-status-stopped/30` |

Apply file by file: CreditsPanel, PolicyControls, WalletsPanel, LogsPanel, AuthGate, CreateAgentForm, AgentDetail, ApprovalQueue, AgentGrid, ExportPanel, TransactionHistory, WalletOverview, SourceBar.

- [ ] **Step 3: Build and test**

```bash
bun run build --filter homepage
```

- [ ] **Step 4: Commit**

```bash
git add apps/homepage/src/
git commit -m "refactor: replace hardcoded status colors in homepage components

Migrate ~60 instances of text-emerald-400, text-red-400,
bg-emerald-500, bg-red-500 to semantic token classes."
```

---

### Task 20: Homepage accessibility fixes

**Files:**
- Modify: `apps/homepage/src/components/Nav.tsx`
- Modify: `apps/homepage/src/App.tsx`
- Modify: `apps/homepage/src/components/Footer.tsx`
- Modify: `apps/homepage/src/components/Hero.tsx`

- [ ] **Step 1: Add aria-label to Nav**

In `apps/homepage/src/components/Nav.tsx`, line 11, add `aria-label`:

```tsx
<nav
  aria-label="Main navigation"
  className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-dark/95 backdrop-blur-md"
  style={{ paddingTop: "var(--safe-area-top, 0px)" }}
>
```

- [ ] **Step 2: Add `<main>` landmark to App.tsx**

In `apps/homepage/src/App.tsx` (the Homepage component), wrap the main content area in a `<main>` element. Find the content div (after the Nav component) and wrap it:

Replace the inner content wrapper `<div className="relative z-10 min-h-screen flex flex-col">` with:

```tsx
<main className="relative z-10 min-h-screen flex flex-col">
```

And close with `</main>` instead of `</div>`.

- [ ] **Step 3: Fix Footer watermark and decorative images**

In `apps/homepage/src/components/Footer.tsx`:

Replace the watermark `<h1>` (line 8-10):
```tsx
<h1 className="text-[24vw] sm:text-[18vw] font-black leading-none tracking-tighter text-white/[0.02] uppercase whitespace-nowrap">
  MILADY APP
</h1>
```

with:
```tsx
<span aria-hidden="true" className="block text-[24vw] sm:text-[18vw] font-black leading-none tracking-tighter text-white/[0.02] uppercase whitespace-nowrap select-none">
  MILADY APP
</span>
```

Add `aria-hidden="true"` to the decorative images container (the div wrapping the three `<img>` elements, around line 18):
```tsx
<div className="absolute inset-0 w-full h-full" aria-hidden="true">
```

- [ ] **Step 4: Fix Hero heading hierarchy**

In `apps/homepage/src/components/Hero.tsx`, the `<h1>` on lines 98-106 contains both "MILADY" and the typewriter text. Split into h1 + subtitle:

Replace:
```tsx
<motion.h1
  variants={itemVariants}
  className="text-[13vw] sm:text-[11vw] lg:text-[13vw] font-black leading-[0.76] tracking-tighter uppercase text-white/95 flex flex-col items-center pointer-events-none select-none mt-16 sm:mt-12 max-w-none"
>
  <span>MILADY</span>
  <span className="w-full break-words hyphens-none text-center text-[11vw] text-brand drop-shadow-[0_10px_28px_rgba(240,185,11,0.18)] sm:text-[9vw] lg:text-[11vw]">
    <TypewriterLoop />
  </span>
</motion.h1>
```

with:
```tsx
<motion.div
  variants={itemVariants}
  className="flex flex-col items-center pointer-events-none select-none mt-16 sm:mt-12 max-w-none"
>
  <h1 className="text-[13vw] sm:text-[11vw] lg:text-[13vw] font-black leading-[0.76] tracking-tighter uppercase text-white/95">
    MILADY
  </h1>
  <p className="w-full break-words hyphens-none text-center text-[11vw] text-brand drop-shadow-[0_10px_28px_rgba(240,185,11,0.18)] sm:text-[9vw] lg:text-[11vw] font-black leading-[0.76] tracking-tighter uppercase" aria-live="polite">
    <TypewriterLoop />
  </p>
</motion.div>
```

The `aria-live="polite"` ensures screen readers announce the changing typewriter text.

- [ ] **Step 5: Build and verify**

```bash
bun run build --filter homepage
```

- [ ] **Step 6: Commit**

```bash
git add apps/homepage/src/
git commit -m "a11y: fix homepage landmarks, heading hierarchy, and decorative markup

Add aria-label to nav, wrap content in <main>, replace watermark
h1 with aria-hidden span, split Hero h1 into h1 + p."
```

---

### Task 21: Homepage SEO meta tags

**Files:**
- Modify: `apps/homepage/index.html`

- [ ] **Step 1: Add Open Graph and Twitter Card meta tags**

In `apps/homepage/index.html`, after the existing `<meta name="description">` tag, add:

```html
<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:title" content="Milady" />
<meta property="og:description" content="Local-first AI assistant" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:url" content="https://milady.app" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Milady" />
<meta name="twitter:description" content="Local-first AI assistant" />
<meta name="twitter:image" content="/og-image.png" />

<!-- Canonical -->
<link rel="canonical" href="https://milady.app" />
```

Note: Adjust the description and URL to match the actual production values. Check if `og-image.png` exists in `apps/homepage/public/` — if not, use the one from `apps/app/public/og-image.png` or create one.

- [ ] **Step 2: Commit**

```bash
git add apps/homepage/index.html
git commit -m "seo: add Open Graph, Twitter Card, and canonical meta tags"
```

---

### Task 22: Remove unused @tailwindcss/typography dependency

**Files:**
- Modify: `apps/homepage/package.json`

- [ ] **Step 1: Verify no prose classes are used**

```bash
grep -rn 'prose' apps/homepage/src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

Expected: No results (or only false positives like variable names).

- [ ] **Step 2: Remove the dependency**

```bash
cd apps/homepage && bun remove @tailwindcss/typography && cd ../..
```

- [ ] **Step 3: Build to verify**

```bash
bun run build --filter homepage
```

- [ ] **Step 4: Commit**

```bash
git add apps/homepage/package.json bun.lock
git commit -m "chore: remove unused @tailwindcss/typography from homepage"
```

---

### Task 23: WS3 final verification

- [ ] **Step 1: Full build and test**

```bash
bun run build
bun run check
bun run test
```

- [ ] **Step 2: Visual spot-check**

Serve the homepage locally and verify:
- Colors match the main app's dark theme
- Fonts render correctly (DM Sans)
- Status badges in dashboard show correct colors
- No visual regressions in Hero, Nav, Footer
- Nav has visible focus styles for keyboard navigation

- [ ] **Step 3: Verify no remaining hardcoded colors**

```bash
grep -rn 'text-emerald-\|text-red-\|bg-emerald-\|bg-red-' apps/homepage/src/ --include="*.tsx" --include="*.ts"
```

Expected: Zero results (all migrated to semantic tokens).

---

## Spec Deviations

- **brand-gold.css "duplicate" variables (WS1):** The spec says to remove lines 27-34 as duplicates of lines 116-171. Verification shows these are DIFFERENT variables (`--accent`, `--accent-rgb`, etc. vs `--onboarding-accent-border`, `--onboarding-accent-foreground`, etc.). Not removing — would break onboarding theming.
- **Homepage color token names (WS3):** The spec says to use `text-ok`/`text-danger`. The plan uses `text-status-running`/`text-status-stopped` (homepage-specific tokens mapped to shared values). This preserves semantic meaning (running/stopped/paused) rather than generic (ok/danger/warn).

## Dependency Notes

- **WS1, WS2, WS3 are independent** and can be developed on separate branches and merged in any order.
- **Within WS1:** Tasks 1-2 (deletions) are independent of Tasks 3-8 (dark mode fixes). Task 9 is the final verification.
- **Within WS2:** Task 10 must complete before Task 11. Task 12 must complete before Task 13. Tasks 14 and 15 are independent of each other. Task 16 is the final verification.
- **Within WS3:** Task 17 must complete before Task 19 (colors depend on imported tokens). Tasks 18, 20, 21, 22 are independent of each other. Task 23 is the final verification.
- **If WS2 lands before WS3:** Homepage can use `--status-*` tokens. The current plan uses homepage's own `--color-status-*` tokens mapped to `--ok`/`--danger`/`--warn`, which works regardless of WS2 status.
