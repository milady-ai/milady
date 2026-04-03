# Frontend Audit & Cleanup Design

**Date:** 2026-03-30
**Scope:** Full sweep — UI components, CSS/theming, dark mode, responsive, homepage, cross-app consistency
**Approach:** Three parallel workstreams, independently mergeable

---

## Audit Summary

61 issues found across the frontend. 19 high severity, 28 medium, 14 low.

**Strengths (keep as-is):**
- Radix UI primitives provide solid accessibility foundation
- CVA variant system is well-implemented
- CSS custom property architecture is sound
- Theme switching logic is correct (dual-selector approach works)
- All forwardRef components have displayName

**Top problems:**
1. Homepage has a completely separate design token system from the main app
2. Dark mode is visibly broken in 6 components (hardcoded bg-white, text-black, hex backgrounds)
3. 8 UI components are exported but never imported (dead code)
4. Z-index values are scattered (13+ ad-hoc values, 1 constant)
5. 20+ status color classes hardcoded across components instead of using semantic tokens
6. 4 duplicate component patterns in the UI library
7. Prop naming inconsistency (variant vs tone)

---

## Workstream 1: Dead Code & Dark Mode Fixes

**Goal:** Remove unused components/CSS, fix visible theme bugs. Zero architectural changes.

### Deletions

**8 unused component files** — remove from `packages/ui/src/components/ui/`:
- `chat-atoms.tsx`
- `confirm-delete.tsx`
- `search-bar.tsx`
- `search-input.tsx`
- `tag-editor.tsx`
- `tag-input.tsx`
- `sonner.tsx`
- `tooltip-extended.tsx`

Also remove:
- Their 8 barrel exports from `packages/ui/src/index.ts`
- Any corresponding test files and Storybook stories

**3 unused CSS keyframe animations:**
- `avatar-loader-progress` in `packages/app-core/src/styles/styles.css`
- `slide-in-left` in `apps/homepage/src/styles.css`
- `marquee-vertical` in `apps/homepage/src/styles.css`

**2 unused CSS variables** (plus dark mode overrides):
- `--duration-fast` in `packages/app-core/src/styles/base.css`
- `--duration-slow` in `packages/app-core/src/styles/base.css`

**Duplicate variable definitions** in `brand-gold.css`:
- Lines 27-34 are overridden by lines 116-171. Remove the first set.

### Dark Mode Fixes

| File | Line | Fix |
|------|------|-----|
| `packages/ui/src/components/ui/switch.tsx` | 20 | Replace `bg-white` with `bg-[var(--card)]` on thumb |
| `packages/app-core/src/config/ui-renderer.tsx` | 669 | Replace `bg-white` with `bg-[var(--card)]` on toggle thumb |
| `packages/ui/src/components/ui/confirm-dialog.tsx` | 31 | Replace `text-black` with `text-[var(--accent-foreground)]` on warn tone |
| `packages/app-core/src/components/ConnectionFailedBanner.tsx` | 72 | Replace `bg-white` with `bg-[var(--card)]` and `text-red-700` with `text-[var(--destructive)]` |
| `packages/app-core/src/components/WhatsAppQrOverlay.tsx` | 159 | Replace `bg-white` with `bg-[var(--bg-elevated)]` (QR code needs light bg for scanning — add `dark:bg-white` override) |
| `packages/app-core/src/components/LoadingScreen.tsx` | 108, 116-118 | Replace `bg-[#0c0e14]` with `bg-[var(--bg)]`; replace `bg-white/85` with `bg-[var(--accent)]` and `bg-white/10` with `bg-[var(--bg-accent)]` |
| `packages/app-core/src/components/VrmStage.tsx` | 238 | Replace `bg-[#030711]` with `bg-[var(--bg)]` |

### Scope Boundary

No new abstractions. Delete dead code, replace hardcoded colors with existing semantic tokens.

---

## Workstream 2: Token System & Z-Index Constants

**Goal:** Centralize scattered magic values into the existing token/constant infrastructure.

### Z-index system — expand `floating-layers.ts`

Currently defines only 1 constant. Define a complete scale:

| Constant | Value | Replaces |
|----------|-------|----------|
| `Z_BASE` | 0 | `z-0` |
| `Z_DROPDOWN` | 10 | `z-10` (dropdowns, sticky headers) |
| `Z_STICKY` | 20 | `z-20` (side panels) |
| `Z_MODAL_BACKDROP` | 50 | `z-50` (dialog backdrops) |
| `Z_MODAL` | 100 | `z-[100]` (App.tsx, ChatModalView, themed-select) |
| `Z_DIALOG_OVERLAY` | 160 | `z-[160]` (dialog.tsx, drawer-sheet.tsx) |
| `Z_DIALOG` | 170 | implicit (dialog content) |
| `Z_OVERLAY` | 200 | `z-[200]` (OwnerNamePrompt, PtyConsole) |
| `Z_TOOLTIP` | 300 | `z-[300]` (tooltip) |
| `Z_SYSTEM_BANNER` | 9998 | `z-[9998]` (SystemWarningBanner, RestartBanner) |
| `Z_SYSTEM_CRITICAL` | 9999 | `z-[9999]` (ConnectionFailedBanner, EmotePicker) |
| `Z_SHELL_OVERLAY` | 10000 | `z-[10000]` (ShellOverlays) |
| `Z_GLOBAL_EMOTE` | 11000 | `z-[11000]` (GlobalEmoteOverlay) |
| `Z_SELECT_FLOAT` | 12000 | existing constant |

Update all components to import from `floating-layers.ts` and use `z-[${CONSTANT}]`.

### Status color tokens — add to `base.css`

Add semantic status tokens (light and dark variants):

```css
--status-success: var(--ok);
--status-success-bg: var(--ok-subtle);
--status-danger: var(--danger);
--status-danger-bg: var(--destructive-subtle);
--status-warning: var(--warn);
--status-warning-bg: var(--warn-subtle);
--status-info: #3b82f6;
--status-info-bg: rgba(59, 130, 246, 0.12);
```

Map to Tailwind via `@theme inline`. Update ~20 components using raw Tailwind color classes:
- `text-red-400` / `text-red-500` -> `text-status-danger`
- `text-green-400` / `text-green-500` / `text-emerald-400` -> `text-status-success`
- `bg-blue-500/20` -> `bg-status-info-bg`
- etc.

### Chain colors — reference existing CSS variables

`chainConfig.ts` hardcodes hex values that already exist as CSS variables in `styles.css` (`--color-chain-eth`, etc.). Update `chainConfig.ts` to use `var(--color-chain-*)`.

### Prop naming — standardize on `variant`

Update `StatusBadge` and `ConfirmDialog` to use `variant` instead of `tone`. Update all call sites within the repo.

### Scope Boundary

Token additions, constant definitions, component updates to reference them. No visual changes — same colors, just sourced from tokens.

---

## Workstream 3: Homepage Alignment

**Goal:** Bring the homepage into the shared design system. Same visuals, shared tokens.

### Token unification

- Add `@import "@miladyai/app-core/styles/base.css"` to `apps/homepage/src/styles.css`
- Remap the `@theme inline` block to reference shared variables
- Delete the 23 standalone homepage token definitions
- Keep homepage-only tokens (e.g., `--color-status-provisioning`) namespaced clearly

This automatically resolves the value drift:
- Dark bg: `#08080a` -> shared `#050506`
- Text light: `#e8e8ec` -> shared `#eaecef`
- Muted text: `#9494a2` -> shared `#8a8a94`
- Border: `#252530` -> shared `#232329`

### Font loading cleanup

- Remove duplicate `<link>` Google Fonts load from `apps/homepage/index.html` (brand-gold.css already loads them)
- Document the intentional font divergence: homepage = DM Sans (branded), app = system stack (performance)

### Hardcoded colors in homepage components (~107 instances)

Replace raw Tailwind classes with semantic tokens:
- `text-emerald-400` / `text-green-500` -> `text-ok`
- `text-red-400` / `text-red-500` -> `text-danger`
- `bg-emerald-500/10` -> `bg-ok/10`
- `bg-red-500/10` -> `bg-danger/10`
- Status config objects in `AgentCard.tsx`, `CreditsPanel.tsx`, etc.

### Shared UI adoption

- Dashboard section already imports from `@miladyai/ui` — no change needed
- Marketing pages (Hero, Nav, Footer) — don't force component library adoption. Adopt token system and Button component where natural (Nav CTA, Footer links), keep custom layouts.

### Accessibility fixes

- Add `aria-label="Main navigation"` to `<nav>` in `Nav.tsx`
- Wrap main content in `<main>` in `App.tsx`
- Add `aria-hidden="true"` to decorative images in `Footer.tsx`
- Split h1 in `Hero.tsx` into proper h1 + h2 hierarchy
- Replace misused `<h1>` watermark in `Footer.tsx` with `<span aria-hidden="true">`

### SEO fixes

- Add Open Graph meta tags to `apps/homepage/index.html`
- Add Twitter Card meta tags
- Add canonical link

### Dependency cleanup

- Remove `@tailwindcss/typography` (no `prose-*` classes used)

### Scope Boundary

Homepage alignment to shared tokens, accessibility/SEO fixes. No visual redesign.

---

## Cross-cutting Notes

- **Testing:** Run existing test suite after each workstream. Dark mode fixes in WS1 should be verified with the theme-toggle tests. Component deletions in WS1 should not break any imports (they're unused).
- **Migration safety:** WS2 prop rename (`tone` -> `variant`) requires updating all call sites in the same commit.
- **WS3 depends on WS2** for the `--status-*` tokens if homepage wants to use them. Otherwise WS3 can proceed independently using `--ok`, `--danger`, `--warn` directly.
- **No visual changes intended.** All three workstreams should result in identical rendering. The cleanup is structural, not aesthetic.
