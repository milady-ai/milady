# Layer 5b — `@elizaos/ui` primitives package

**Files: 180.**
**Audited: 180 / 180.**
**Refactored: 0 / 180.**

This is the **5b** portion of Layer 5. Layer 5a (`@elizaos/vault` + `@elizaos/shared`,
72 files) is in [layer-5a-vault-shared.md](./layer-5a-vault-shared.md).

`@elizaos/ui` is a single React 19 + Tailwind + Radix primitive/composite/layout
library. The package has **zero** direct external `from "@elizaos/ui"` imports
in `apps/`; **all 217 import sites are inside `eliza/packages/app-core/src/`,
`eliza/plugins/*`, and the package itself**. So consumers reach UI through
app-core's own re-export surface (and via the source-mode aliasing in
`apps/app/vite.config.ts`), not directly from app code.

## Why this layer

- It's the topmost browser-only leaf inside `eliza/packages/`. Layer 7
  (app-core UI), Layer 10 (plugins), and Layer 11 (apps/app) all sit on
  top of it. Until 5b is mapped, every duplicate primitive in app-core
  could be the canonical one or the orphan; we can't tell.
- The package mixes three concerns under one barrel: thin Radix wrappers
  (`button`, `dialog`, `select`, …), opinionated Milady "settings/admin"
  composites (`AdminDialog`, `SettingsControls`, `SaveFooter`), and full
  vertical features (`ChatComposer` 798 LOC, `SidebarRoot` 865 LOC,
  `Trajectories*`). Boundary discipline matters here more than in 5a.
- It owns the **one** theme-token CSS file shared across the app-core,
  homepage, and electrobun shells (`src/styles/theme.css`, 73 LOC).

## What to look for in this layer specifically

- **Primitive duplication.** Variant-explosion (Button surface /
  surfaceAccent / surfaceDestructive / outline / secondary / ghost / link /
  default) vs sibling primitives that re-do the same job under a different
  name (`ConfirmDelete` vs `ConfirmDialog`, `FormSelect` vs `ThemedSelect`
  vs Radix `Select`).
- **Theming.** CSS-vars defined in `theme.css` but never referenced
  (`--font-display`, `--status-info*`, `--bg-elevated`, `--bg-muted`).
- **Storybook leftovers.** 60 `*.stories.tsx` under `src/stories/` with
  **no `.storybook/` config in this package** — devDeps include
  `storybook` + `@storybook/react` but there's no entry to run them.
  These ship into the published `dist/` because the build glob
  (`tsconfig.build.json`) does not exclude them. Confirmed by comparison:
  `eliza/packages/app-core/.storybook` and `eliza/cloud/packages/ui/.storybook`
  both exist; this package's is missing.
- **Re-exports vs definitions.** The barrel `src/index.ts` is 7 lines of
  `export *` from sub-barrels — clean shape, but it double-exports
  `chat-source` (line 2 + the chat composites barrel line 11).
- **Missing types.** Almost none — the package is well-typed. Two
  systemic patterns: (a) `cva` results are cast through a
  `_xVariants as (props?: XProps) => string` shim in 10 primitives
  (Button, Card, Badge, Input, Textarea, Stack, Grid, Banner, Typography
  Text, Typography Heading, Label) — a single typed helper would absorb
  this. (b) `aria-live`, `role` are typed as `string` from
  `HTMLAttributes` rather than literal unions on 2 spots
  (`ConnectionStatus`).
- **Memo / performance bloat.** None found. Zero `React.memo` wrappers in
  the package — one of the cleaner surfaces in the codebase.

---

### Top-level + lib (5 files)

- [!] `eliza/packages/ui/src/index.ts` — 7 LOC barrel. `export *` from
  composites/primitives/hooks/layouts/lib. dedup:**line 2 explicitly
  re-exports `./components/composites/chat/chat-source`** even though
  line 1 (`export * from "./components/composites"`) already pulls it in
  via the chat sub-barrel. Double-export — harmless because
  `ChatSourceMeta` and friends are unique names, but redundant. Pick one.
- [-] `eliza/packages/ui/src/ambient-modules.d.ts` — 40 LOC. Declares
  three modules (`@elizaos/signal-native`, `three/...meshopt_decoder`,
  `jsdom`) — **none of them imported anywhere in `eliza/packages/ui/src`**.
  These ambient declarations leaked here from another package (`signal-native`
  belongs in `apps/app`'s renderer; `meshopt_decoder` is for 3D scene rendering
  in `app-companion`; `jsdom` is for tests). dead:`*.d.ts` not in audit
  scope — but the file is fully orphan and should be deleted or moved
  to its rightful owner.
- [x] `eliza/packages/ui/src/lib/utils.ts` — 6 LOC. Canonical `cn()`
  using `clsx` + `tailwind-merge`. The only utility every primitive
  imports. Clean.
- [x] `eliza/packages/ui/src/lib/floating-layers.ts` — 22 LOC. Z-index
  scale + the legacy aliases `SELECT_FLOATING_LAYER_NAME` /
  `SELECT_FLOATING_LAYER_Z_INDEX`. Single source of truth — every
  z-index in the codebase should come from here. Clean.
- [!] `eliza/packages/ui/src/types/onboarding.ts` — 25 LOC. Defines
  `OnboardingStep` and `ONBOARDING_STEPS` with i18n key labels.
  boundaries:Layer 5a's `shared/src/contracts/onboarding.ts:74` defines
  `OnboardingProviderId` (the open-union one); this is a *separate*
  notion (the wizard's three top-level steps), so no duplication —
  but the file is the single non-component file under `src/types/`,
  and the directory exists *only* for this. Inline candidate or move
  to a `composites/onboarding/` sub-barrel when a real onboarding
  composite lands.

### Styles (2 files — not in `find` count, but referenced)

- [!] `eliza/packages/ui/src/styles/theme.css` — 73 LOC. Single canonical
  theme-token file. 32 `--*` vars per mode (light/dark). orphan-tokens
  verified (see Summary §C):
  - `--font-display` — defined as `var(--font-body)`. Zero non-styles
    consumers in the workspace (`font-display` hits in
    `eliza/cloud/apps/frontend/globals.css` are the unrelated CSS
    `font-display: swap` property).
  - `--font-chat` — used (chat-composer / chat-message / chat-transcript
    / chat-empty-state). Keep.
  - `--status-info` / `--status-info-bg` — defined both modes, **zero
    consumers** (the only hits are the definitions themselves and an
    `app-core/styles/styles.css` non-Tailwind use).
  - `--bg-elevated` — used only by `tooltip-extended.tsx:76,130`
    (`bg-bg-elevated`). If `tooltip-extended.tsx`'s
    `HoverTooltip`/`IconTooltip` are deleted as orphans (see below),
    this token becomes orphan too.
  - `--bg-muted` — used by 10+ files in `eliza/plugins/app-lifeops/`
    and `eliza/plugins/app-wallet/` via `bg-bg-muted` Tailwind class.
    Keep.
  - `--mono` — used inside this file's `font-[var(--mono)]` references
    (input config variant, textarea config variant, settings textarea).
    Keep.
- [x] `eliza/packages/ui/src/styles/electrobun-mac-window-drag.css` —
  106 LOC. Macos titlebar drag region rules. Keyed on
  `html.eliza-electrobun-macos-titlebar` — toggled by
  `apps/app/src/main.tsx` (Layer 1). Documented; correct boundary.

### Hooks (6 files)

- [-] `eliza/packages/ui/src/hooks/useClickOutside.ts` — 28 LOC.
  Mousedown + Escape outside-click handler. **Zero consumers in the
  workspace** (only the barrel re-exports it). Slated for deletion.
- [!] `eliza/packages/ui/src/hooks/useDocumentVisibility.ts` — 37 LOC.
  Two exports — `useDocumentVisibility` (used by 5 app-core files +
  GameView) and `useIntervalWhenDocumentVisible` (used by ConversationsSidebar,
  ChatView, BrowserWorkspaceView, GameView, app-training/FineTuningView).
  Heavily consumed. Clean.
- [!] `eliza/packages/ui/src/hooks/useKeyboardShortcuts.ts` — 48 LOC.
  Generic Ctrl/Shift/Alt/Meta + key matching + `formatShortcut`.
  dead:**`useKeyboardShortcuts` and `formatShortcut` have ZERO direct
  consumers** in the workspace. The only references are this file, the
  ui barrel re-export, and `eliza/packages/app-core/src/index.ts:47`
  re-exporting `COMMON_SHORTCUTS` and `useShortcutsHelp` from
  app-core's *own* `hooks/useKeyboardShortcuts.ts` — a parallel
  implementation. Two implementations of the same idea; the
  app-core one is the live one. Slated for deletion (or
  consolidation — see Summary §D.6).
- [!] `eliza/packages/ui/src/hooks/useLinkedSidebarSelection.ts` —
  170 LOC. Sidebar↔content scroll-sync via refs + RAF-throttled
  alignment. Used by `pages/PluginsView.tsx` and `pages/SettingsView.tsx`
  (both Layer 7). Solid; cleanly typed; no findings.
- [x] `eliza/packages/ui/src/hooks/useTimeout.ts` — 31 LOC. Auto-cleanup
  setTimeout wrapper. Heavily consumed (8+ app-core sites + EmotePicker).
  Clean.
- [x] `eliza/packages/ui/src/hooks/index.ts` — 5 LOC barrel. Clean.

### Layouts (12 files)

- [x] `eliza/packages/ui/src/layouts/index.ts` — 4 LOC barrel. Clean.
- [!] `eliza/packages/ui/src/layouts/page-layout/page-layout.tsx` —
  6 LOC. Just `<WorkspaceLayout {...props} headerPlacement="outside" />`.
  Functional alias. Could be inlined or kept as a documented preset.
- [x] `eliza/packages/ui/src/layouts/page-layout/page-layout-header.tsx` —
  16 LOC. Trivial wrapper around a `<div className="mb-4 shrink-0">`.
  Clean.
- [!] `eliza/packages/ui/src/layouts/page-layout/page-layout-mobile-drawer.tsx`
  — 86 LOC. Out-of-layer review (depth-2).
- [x] `eliza/packages/ui/src/layouts/page-layout/page-layout-types.ts` —
  19 LOC. Types only. Clean.
- [x] `eliza/packages/ui/src/layouts/page-layout/index.ts` — 4 LOC
  barrel. Clean.
- [!] `eliza/packages/ui/src/layouts/workspace-layout/workspace-layout.tsx`
  — 176 LOC. The actual layout shell. `useWorkspaceLayoutDesktopMode`
  is a private hook — could move to `hooks/` if reused, otherwise
  keep colocated. types:`window.matchMedia.addListener`/`removeListener`
  fallback at lines 48-49 is for older WebKit; deprecated in Safari 14+
  (2020). Could drop. Otherwise clean and well-typed.
- [x] `eliza/packages/ui/src/layouts/workspace-layout/workspace-layout-types.ts` —
  Out-of-layer review (types).
- [x] `eliza/packages/ui/src/layouts/workspace-layout/workspace-mobile-sidebar-controls.tsx` —
  19 LOC. Clean.
- [x] `eliza/packages/ui/src/layouts/workspace-layout/index.ts` — 3 LOC
  barrel. Clean.
- [x] `eliza/packages/ui/src/layouts/content-layout/content-layout.tsx` —
  42 LOC. Just `<WorkspaceLayout headerPlacement="inside"
  contentPadding={!inModal} />`. Functional alias, well-documented.
  Together with `page-layout.tsx`, these three are presets of one
  layout — that's the intended design.
- [x] `eliza/packages/ui/src/layouts/content-layout/index.ts` — 1 LOC
  barrel. Clean.
- [!] `eliza/packages/ui/src/layouts/chat-panel-layout/chat-panel-layout.tsx`
  — 109 LOC. Out-of-layer review (depth-2).
- [x] `eliza/packages/ui/src/layouts/chat-panel-layout/index.ts` — 1 LOC
  barrel. Clean.
- [-] `eliza/packages/ui/src/layouts/layout-test-utils.tsx` — 65 LOC.
  Test-support: `installMatchMedia`, `enableTestRenderer`,
  `disableTestRenderer`, `SidebarProbe`. dead:**These ship in the
  package's `dist/`** — `tsconfig.build.json` doesn't exclude
  `layout-test-utils.tsx`. boundaries:test fixtures should not be in
  the production bundle. Move to `__tests__/` or exclude in build.

### Primitives — `components/ui/*` (43 files)

#### Variant-explosion / canonical decisions

- [!] `eliza/packages/ui/src/components/primitives/index.ts` — 25 LOC
  barrel. Lists 25 primitives. Companion barrel
  `composites/index.ts` (27 LOC) lists 18 + 7 sub-barrels.
  Boundary distinction is consistent: primitives = single-element
  Radix wrappers + small layout helpers; composites = opinionated
  multi-element compounds.
- [!] `eliza/packages/ui/src/components/ui/button.tsx` — 85 LOC.
  Canonical Button. **9 variants** (default / surface / surfaceAccent /
  surfaceDestructive / destructive / outline / secondary / ghost /
  link), 4 sizes. Variant explosion is real — `surfaceAccent` and
  `surfaceDestructive` exist *as well as* `default` (which is also
  accent-colored) and `destructive`. The "surface*" trio is the
  glassmorphic linear-gradient family; "default"/"destructive"/
  "outline"/"secondary" are the flat family. Two visual languages
  fighting under one variant axis. types:`ButtonVariantsProps` is
  hand-written instead of derived from cva — the cast pattern at
  line 61 (`_buttonVariants as (props?: BVP) => string`) appears in
  10 files; one typed helper would absorb. slop:line 29-31 comment
  "Solid accent surfaces use text-accent-fg; translucent accent
  buttons switch to text-accent in dark mode" is helpful — keep.
- [!] `eliza/packages/ui/src/components/ui/card.tsx` — 109 LOC.
  Canonical Card + 6 sub-components (CardHeader, CardTitle,
  CardDescription, CardContent, CardFooter). Variants: default /
  interactive / status / setting / flat. Same `_cardVariants as ...`
  cast at line 30. Otherwise clean and the canonical Card.
- [!] `eliza/packages/ui/src/components/ui/badge.tsx` — 42 LOC.
  Canonical Badge (default / secondary / destructive / outline). Same
  cast pattern.
- [!] `eliza/packages/ui/src/components/ui/status-badge.tsx` —
  165 LOC. **Three components in one file**:
  `StatusBadge` (border + bg + dot, success/warning/danger/muted),
  `StatusDot` (just the dot, with mapped status string), `StatCard`
  (a small label+value tile, semantically a Card variant). dedup:two
  parallel mapping helpers — `statusToneForState(status)` (8-keyword
  map) and the inline `StatusDot` ternary mapping (3 keywords). They
  use different keyword sets. dead:`StatCard` has **zero
  consumers** in the workspace (only stories). Should split: `StatusBadge`
  + `StatusDot` are the canonical owners; `StatCard` is orphan and
  doesn't belong in `status-badge.tsx` anyway.
- [!] `eliza/packages/ui/src/components/ui/banner.tsx` — 90 LOC.
  Banner (error/warning/info) with optional icon/action/dismiss.
  Same cast pattern. Canonical inline notice.
- [!] `eliza/packages/ui/src/components/ui/connection-status.tsx` —
  79 LOC. ConnectionStatus (connected/disconnected/error). types:
  `state: ConnectionState` is a strict union; good. dedup:status-color
  mapping inside is parallel to `StatusBadge`'s — different domain
  ("connected" vs "success") but same pattern.
- [!] `eliza/packages/ui/src/components/ui/empty-state.tsx` — 42 LOC.
  Generic EmptyState. Composite-ish but lives in `ui/`. Canonical.
  **Note**: there's also `composites/page-panel/page-panel-empty.tsx`
  (`PageEmptyState`, 77 LOC) that is similar but tied to the page-panel
  shell. Keep both — they target different surfaces.

#### Inputs / form / data entry

- [!] `eliza/packages/ui/src/components/ui/input.tsx` — 64 LOC. Variants:
  default / form / config; densities: default / compact / relaxed. Same
  cast pattern. Canonical Input.
- [!] `eliza/packages/ui/src/components/ui/textarea.tsx` — 62 LOC.
  Mirror-image of Input (same variants, same densities, same cast).
  Canonical Textarea.
- [x] `eliza/packages/ui/src/components/ui/checkbox.tsx` — 28 LOC. Thin
  Radix wrapper. Clean.
- [x] `eliza/packages/ui/src/components/ui/switch.tsx` — 28 LOC. Thin
  Radix wrapper. Clean.
- [x] `eliza/packages/ui/src/components/ui/slider.tsx` — 26 LOC. Thin
  Radix wrapper. Clean.
- [x] `eliza/packages/ui/src/components/ui/separator.tsx` — 29 LOC.
  Thin Radix wrapper. Clean.
- [!] `eliza/packages/ui/src/components/ui/label.tsx` — 26 LOC. Thin
  Radix wrapper. types:`labelVariants` is a `cva` of one bare class
  string with no variants — the `_labelVariants as (props?: Record<...>)
  => string` cast and the indirection are pure boilerplate.
- [!] `eliza/packages/ui/src/components/ui/field.tsx` — 70 LOC.
  Field / FieldLabel / FieldDescription / FieldMessage. The `variant:
  "default" | "form" | "kicker"` axis on FieldLabel is the only one
  with concrete fork logic. Canonical form composition primitives.
- [!] `eliza/packages/ui/src/components/ui/field-switch.tsx` — 59 LOC.
  A *labelled* switch row built atop a `<button role="switch">` —
  doesn't reuse `Switch` from `switch.tsx`. dedup:two implementations
  of "switch with thumb" in this package. The reason given (visually
  this is a row-form composition, not just a toggle) is fair, but
  worth noting.
- [-] `eliza/packages/ui/src/components/ui/tag-input.tsx` — 2 LOC.
  Pure alias `export { TagEditor as TagInput }`. dead:**The only
  external import of `TagInput` is `eliza/plugins/app-lifeops/src/components/EventEditorDrawer.tsx`** —
  every other consumer imports `TagEditor` directly. Two symbols, one
  component. Migrate that single import to `TagEditor` and delete the
  alias file.
- [!] `eliza/packages/ui/src/components/ui/tag-editor.tsx` — 105 LOC.
  Canonical chip-list editor. Clean.

#### Selects (3 implementations)

- [!] `eliza/packages/ui/src/components/ui/select.tsx` — 161 LOC. Thin
  Radix Select wrapper. Canonical.
- [!] `eliza/packages/ui/src/components/ui/form-select.tsx` — 64 LOC.
  Opinionated Radix Select wrapper for "form" surface (rounded-2xl,
  thicker glassmorphic background). dead:**Zero consumers in the
  workspace.** Stories-only. Slated for deletion.
- [!] `eliza/packages/ui/src/components/ui/themed-select.tsx` —
  283 LOC. Custom roll-your-own select with grouped items, keyboard
  nav, hint text, controlled/uncontrolled menu state. Used by
  `app-core/src/components/pages/settings/IdentitySettingsSection.tsx`
  (one consumer). dedup:**three Select implementations for three
  visual surfaces** — Radix `select.tsx`, glassmorphic `form-select.tsx`,
  hand-rolled `themed-select.tsx`. The `IdentitySettingsSection` use
  could plausibly migrate to `Select` + `SelectGroup`/`SelectLabel`
  (the grouped-with-hints feature is an `<SelectItem>` with formatted
  children). After migration, both `themed-select.tsx` *and*
  `form-select.tsx` could be deleted. types:`ThemedSelect<T extends
  string>` is well-generic. The 283 LOC is mostly keyboard navigation
  scaffolding that Radix handles for free.

#### Dialogs (4 files; one canonical, three opinionated wrappers)

- [!] `eliza/packages/ui/src/components/ui/dialog.tsx` — 133 LOC.
  Canonical Radix Dialog wrapper. Notable: `className` uses
  template-string `z-[${Z_DIALOG_OVERLAY}]` (line 22) and
  `z-[${Z_DIALOG}]` (line 47) — these run at module load and produce
  literal class names like `z-[160]` and `z-[170]`. Tailwind JIT must
  scan for those literals; works because the constants resolve to
  numbers, but it's fragile. Same pattern in
  `drawer-sheet.tsx` and `tooltip-extended.tsx`.
- [!] `eliza/packages/ui/src/components/ui/admin-dialog.tsx` —
  176 LOC. Eight components (`AdminDialogContent`, `AdminDialogHeader`,
  `AdminDialogFooterChrome`, `AdminDialogBodyScroll`, `AdminMetaBadge`,
  `AdminMonoMeta`, `AdminInput`, `AdminCodeEditor`,
  `AdminSegmentedTabList`, `AdminSegmentedTab`) plus a namespace export
  `AdminDialog = { Content, Header, Footer, ... }`. Opinionated
  "admin/dev" surface. dedup:`AdminInput` is `<Input>` with a
  hardcoded `cn(...)` className — pure styling override; same shape
  as `SettingsInput` in `settings-controls.tsx`. boundaries:Could live
  in app-core if no plugin uses it; needs grep check before deletion.
- [!] `eliza/packages/ui/src/components/ui/confirm-dialog.tsx` —
  243 LOC. Two dialogs (ConfirmDialog, PromptDialog) + two hooks
  (`useConfirm`, `usePrompt`). dead:**`PromptDialog` and `usePrompt`
  have zero consumers** in the workspace. Slated for deletion.
  `ConfirmDialog` and `useConfirm` are kept (heavily used).
- [!] `eliza/packages/ui/src/components/ui/confirm-delete.tsx` —
  90 LOC. Inline two-stage confirm-then-delete control (trigger →
  confirm/cancel inline). dedup:**parallel concept to ConfirmDialog**
  but inline. types:6 separate `*ClassName` overrides for fully
  custom styling — that level of override defeats the design system.
  Consider collapsing all 6 into a single `classNames` prop.

#### Floating overlays / popovers / tooltips

- [x] `eliza/packages/ui/src/components/ui/popover.tsx` — 29 LOC. Thin
  Radix wrapper. Clean.
- [!] `eliza/packages/ui/src/components/ui/tooltip.tsx` — 70 LOC.
  Radix Tooltip + a high-level `TooltipHint` wrapper. Canonical.
- [-] `eliza/packages/ui/src/components/ui/tooltip-extended.tsx` —
  312 LOC. **Three completely unrelated components in one file**:
  - `HoverTooltip` (110 LOC) — DIY tooltip with arrows. dead:**zero
    consumers**.
  - `IconTooltip` (40 LOC) — group-hover CSS-only tooltip. dead:**zero
    consumers**.
  - `Spotlight` + `useGuidedTour` + `TourStep` (158 LOC) — an entire
    onboarding-tour module with a clip-path mask spotlight, dot pager,
    next/prev/skip flow. dead:**zero consumers**. (The only `Spotlight`
    in the repo is `eliza/cloud/packages/ui/src/components/spotlight.tsx`
    — a different file.)
  Slated for full file deletion. boundaries:if a guided tour
  becomes a real feature, it belongs in `composites/tour/`, not in
  `ui/tooltip-extended.tsx`. slop:bundling three unrelated overlay
  features into one file is the AI-slop pattern AGENTS.md flags.

#### Skeletons

- [!] `eliza/packages/ui/src/components/ui/skeleton.tsx` — 113 LOC.
  Seven exports — `Skeleton` (canonical), `SkeletonLine`, `SkeletonText`,
  `SkeletonMessage`, `SkeletonCard`, `SkeletonSidebar`, `SkeletonChat`.
  dead:**`SkeletonChat`, `SkeletonSidebar`, `SkeletonMessage`,
  `SkeletonCard` have zero consumers** in the workspace (stories-only).
  Keep `Skeleton`, `SkeletonLine`, `SkeletonText`. Slated removal of
  the four orphans.

#### Misc

- [!] `eliza/packages/ui/src/components/ui/copy-button.tsx` — 60 LOC.
  Clipboard copy with feedback. types:line 33 `void
  navigator.clipboard.writeText(value)` — fire-and-forget, no error
  handling. The "Copied" feedback fires regardless of whether the
  clipboard write succeeded. errors:silently lying about success on
  permission denial.
- [!] `eliza/packages/ui/src/components/ui/new-action-button.tsx` —
  36 LOC. Button with a hardcoded `surfaceAccent` variant + a leading
  `<Plus>` icon, and `normalizeNewActionLabel` strips a leading "+"
  from a string child (so "+ New chat" renders as "Plus icon + New
  chat"). The label-stripping is a hack to dodge double-plus rendering
  from legacy callers — slop:would be better to fix the callers and
  remove the regex.
- [x] `eliza/packages/ui/src/components/ui/sonner.tsx` — 1 LOC.
  `export { Toaster, toast } from "sonner"`. dead:**zero consumers**
  of `Toaster`/`toast` from `@elizaos/ui` in the workspace (the only
  references are inside cloud, which uses its own sonner wrapper).
  Slated for deletion (or at least flag as un-mounted — sonner is
  installed as a dep but no `<Toaster />` is mounted anywhere
  reachable from this barrel).
- [x] `eliza/packages/ui/src/components/ui/spinner.tsx` — 21 LOC.
  Lucide `Loader2` with `animate-spin`. Canonical.
- [!] `eliza/packages/ui/src/components/ui/save-footer.tsx` — 56 LOC.
  Dirty/saving/error/success row. Returns `null` when not dirty —
  good. Clean.
- [!] `eliza/packages/ui/src/components/ui/section-card.tsx` — 84 LOC.
  Title + collapsible-toggle + actions + body. dedup:overlaps
  `composites/page-panel/page-panel-collapsible-section.tsx` (150 LOC).
  Two collapsible-section primitives — pick one as canonical.
  slop:line 64 hard-codes a `▶` Unicode arrow as the chevron — most
  other collapsibles in the package use Lucide icons.
- [!] `eliza/packages/ui/src/components/ui/segmented-control.tsx` —
  69 LOC. Generic segmented switch over `T extends string`. Used.
  Clean.
- [!] `eliza/packages/ui/src/components/ui/settings-controls.tsx` —
  165 LOC. Wraps Input/Textarea/SelectTrigger with "compact"/"filter"/
  "soft"/"toolbar" variants for the settings surface. dedup:these are
  *also* variants of the underlying primitives — `SettingsInput` adds
  `compact`/`filter` on top of Input's `default`/`form`/`config`. The
  variant axes are layered, not exclusive, but that's a documentation
  gap. Plus `SettingsControls = { Input, SelectTrigger, ... }`
  namespace object.
- [x] `eliza/packages/ui/src/components/ui/grid.tsx` — 52 LOC. Tailwind
  grid wrapper. Clean.
- [x] `eliza/packages/ui/src/components/ui/stack.tsx` — 66 LOC. Flex
  wrapper. Clean.
- [!] `eliza/packages/ui/src/components/ui/typography.tsx` — 89 LOC.
  Text + Heading. dedup:both use the cast pattern. types:`HeadingProps`
  has `level: "h1"..."h6"` — the `Comp = level ?? "h1"` line means
  `null` and `undefined` and the empty case all collapse to `h1` with
  no warning.
- [x] `eliza/packages/ui/src/components/ui/tabs.tsx` — 53 LOC. Thin
  Radix wrapper. Clean.
- [x] `eliza/packages/ui/src/components/ui/dropdown-menu.tsx` — 198 LOC.
  Thin Radix wrapper, all sub-components forwarded. Clean.
- [x] `eliza/packages/ui/src/components/ui/drawer-sheet.tsx` — 112 LOC.
  Bottom-sheet variant of Dialog (uses `DialogPrimitive` as the
  underlying machinery). Clean — but the file naming (`DrawerSheet*`)
  pretends to be a separate primitive when it's actually a styled
  Dialog. Document in the file header.

### Composites — `components/composites/*` (47 source files, 7 sub-barrels)

#### Chat (17 files)

The chat composites are the **single largest LOC concentration in the
package** — 798 LOC composer, 536 LOC message, 394 LOC sidebar-auto-rail
(under sidebar/), 331 LOC conversation-item, 238 LOC chat-sidebar, 227 LOC
transcript. They're not primitives — they are full vertical chat UI.

- [x] `eliza/packages/ui/src/components/composites/chat/index.ts` —
  16 LOC barrel. Clean, except contributes to the double-export of
  `chat-source` from the package barrel (see `index.ts` finding above).
- [x] `eliza/packages/ui/src/components/composites/chat/chat-types.ts` —
  95 LOC. Pure types. Clean.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-attachment-strip.tsx` — 54 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-bubble.tsx` — 37 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-composer-shell.tsx` — 81 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-composer.tsx` — **798 LOC**. Out-of-layer review (depth-2 composite).
- [!] `eliza/packages/ui/src/components/composites/chat/chat-conversation-item.tsx` — 331 LOC. Out-of-layer review.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-conversation-rename-dialog.tsx` — 131 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-empty-state.tsx` — 95 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-message-actions.tsx` — 91 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-message.tsx` — **536 LOC**. Out-of-layer review.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-sidebar.tsx` — 238 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-source.tsx` — 111 LOC. Pluggable per-source meta registry. Module-level mutable singleton (`chatSourceMetaRegistry`) — same anti-pattern noted in Layer 5a (`shared/connectors.ts`).
- [!] `eliza/packages/ui/src/components/composites/chat/chat-thread-layout.tsx` — 113 LOC. One consumer (`pages/ChatView.tsx`). Clean.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-transcript.tsx` — 227 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/chat-typing-indicator.tsx` — 59 LOC.
- [!] `eliza/packages/ui/src/components/composites/chat/create-task-popover.tsx` — 157 LOC. **Single internal consumer** (`chat-composer.tsx`). Could be inlined or moved to a `private/` sub-folder; doesn't belong in the public composites barrel.

#### Sidebar (10 files)

- [x] `eliza/packages/ui/src/components/composites/sidebar/index.ts` —
  10 LOC barrel.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-types.ts` — 87 LOC. SidebarVariant `"default" | "game-modal" | "mobile"`. Note `game-modal` — see boundary discussion in Summary §F.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-root.tsx` — **865 LOC**. Out-of-layer review (the largest file in the package).
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-content.tsx` — 397 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-auto-rail.tsx` — 394 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-filter-bar.tsx` — 119 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-collapsed-rail.tsx` — 86 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-panel.tsx` — 34 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-scroll-region.tsx` — 35 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-header.tsx` — 28 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-header-stack.tsx` — 14 LOC.
- [!] `eliza/packages/ui/src/components/composites/sidebar/sidebar-body.tsx` — 18 LOC.

#### Page panel (8 files)

- [!] `eliza/packages/ui/src/components/composites/page-panel/index.ts` — 37 LOC barrel + a `PagePanel = Object.assign(...)` namespace export. Two ways to import the same set of components.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-types.ts` — Out-of-layer review.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-root.tsx` — 34 LOC.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-frame.tsx` — 36 LOC.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-toolbar.tsx` — 17 LOC.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-header.tsx` — 164 LOC. Five components (MetaPill, PanelHeader, SummaryCard, PageActionRail, PanelNotice). dedup:two of them (SummaryCard, PageActionRail) are *just* wrappers around a `<div>` with one tailwind className — could be inlined.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-collapsible-section.tsx` — 150 LOC. dedup:overlaps `ui/section-card.tsx` (84 LOC). Pick one canonical collapsible-section.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-empty.tsx` — 77 LOC. Page-tied empty state — coexists with the generic `ui/empty-state.tsx`.
- [!] `eliza/packages/ui/src/components/composites/page-panel/page-panel-loading.tsx` — 77 LOC.

#### Form-field, search, skills, trajectories (10 files)

- [x] `eliza/packages/ui/src/components/composites/form-field/index.ts` — 1 LOC barrel.
- [x] `eliza/packages/ui/src/components/composites/form-field/form-field.tsx` — 60 LOC. Composes Field + FieldLabel + FieldDescription + FieldMessage with a `density` axis. Clean.
- [x] `eliza/packages/ui/src/components/composites/search/index.ts` — 2 LOC barrel.
- [!] `eliza/packages/ui/src/components/composites/search/search-input.tsx` — 58 LOC. Inline-icon search input with optional clear/loading. dedup:**parallel implementation to `searchbar.tsx:SidebarSearchBar`** — both render Search + Input + clear-button + spinner, both in the search composite. Two visual languages (the small `h-8` xs default vs the large `h-10 rounded-xl` glass surface).
- [!] `eliza/packages/ui/src/components/composites/search/searchbar.tsx` — 117 LOC. Two exports — `SearchBar` (button-driven submit) and `SidebarSearchBar` (typeahead). dedup:see above. Three search-input components total in this folder.
- [x] `eliza/packages/ui/src/components/composites/skills/index.ts` — 1 LOC barrel.
- [!] `eliza/packages/ui/src/components/composites/skills/skill-sidebar-item.tsx` — 79 LOC. One consumer (`pages/SkillsView.tsx`). Out-of-layer review.
- [x] `eliza/packages/ui/src/components/composites/trajectories/index.ts` — Barrel.
- [!] `eliza/packages/ui/src/components/composites/trajectories/trajectory-code-block.tsx` — 70 LOC.
- [!] `eliza/packages/ui/src/components/composites/trajectories/trajectory-llm-call-card.tsx` — 206 LOC.
- [!] `eliza/packages/ui/src/components/composites/trajectories/trajectory-pipeline-graph.tsx` — 171 LOC.
- [!] `eliza/packages/ui/src/components/composites/trajectories/trajectory-sidebar-item.tsx` — 73 LOC.

### Stories (60 files — `src/stories/*.stories.tsx`, plus `layout-story-fixtures.tsx`)

All 60 story files are in audit scope and all carry the same finding:
**dead:test-support shipped to `dist/`; no Storybook config.**

There is **no `.storybook/` directory in this package** — storybook is
listed in `devDependencies` but with no config, no `bunx storybook dev`
script, no `main.ts` / `preview.ts`. Yet `tsconfig.build.json` does not
exclude `src/stories/**/*`, so all 60 files (and `layout-story-fixtures.tsx`)
ship into the published package's `dist/`.

Either:
1. Add a working `.storybook/` config and a `dev:storybook` script
   (and exclude `src/stories/**` from `tsconfig.build.json` so they
   stop landing in `dist`), or
2. Delete every file under `src/stories/`.

Listed once, treated as a class:

- [-] `eliza/packages/ui/src/stories/AdminDialog.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Badge.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Banner.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Button.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Card.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ChatAtoms.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ChatComposites.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ChatEmptyState.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ChatPanelLayout.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Checkbox.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ConfirmDelete.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ConfirmDialog.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ConnectionStatus.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ContentLayout.stories.tsx`
- [-] `eliza/packages/ui/src/stories/CopyButton.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Dialog.stories.tsx`
- [-] `eliza/packages/ui/src/stories/DrawerSheet.stories.tsx`
- [-] `eliza/packages/ui/src/stories/DropdownMenu.stories.tsx`
- [-] `eliza/packages/ui/src/stories/EmptyState.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ErrorBoundary.stories.tsx`
- [-] `eliza/packages/ui/src/stories/FieldSwitch.stories.tsx`
- [-] `eliza/packages/ui/src/stories/FormField.stories.tsx`
- [-] `eliza/packages/ui/src/stories/FormFields.stories.tsx`
- [-] `eliza/packages/ui/src/stories/FormSelect.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Grid.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Input.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Label.stories.tsx`
- [-] `eliza/packages/ui/src/stories/NewActionButton.stories.tsx`
- [-] `eliza/packages/ui/src/stories/PageLayout.stories.tsx`
- [-] `eliza/packages/ui/src/stories/PagePanel.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Popover.stories.tsx`
- [-] `eliza/packages/ui/src/stories/SaveFooter.stories.tsx`
- [-] `eliza/packages/ui/src/stories/SearchBar.stories.tsx`
- [-] `eliza/packages/ui/src/stories/SearchInput.stories.tsx`
- [-] `eliza/packages/ui/src/stories/SectionCard.stories.tsx`
- [-] `eliza/packages/ui/src/stories/SegmentedControl.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Select.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Separator.stories.tsx`
- [-] `eliza/packages/ui/src/stories/SettingsControls.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Sidebar.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Skeleton.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Skills.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Slider.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Sonner.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Spinner.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Stack.stories.tsx`
- [-] `eliza/packages/ui/src/stories/StatusBadge.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Switch.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Tabs.stories.tsx`
- [-] `eliza/packages/ui/src/stories/TagEditor.stories.tsx`
- [-] `eliza/packages/ui/src/stories/TagInput.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Textarea.stories.tsx`
- [-] `eliza/packages/ui/src/stories/ThemedSelect.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Tooltip.stories.tsx`
- [-] `eliza/packages/ui/src/stories/TooltipExtended.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Trajectories.stories.tsx`
- [-] `eliza/packages/ui/src/stories/Typography.stories.tsx`
- [-] `eliza/packages/ui/src/stories/WorkspaceLayout.stories.tsx`
- [-] `eliza/packages/ui/src/stories/layout-story-fixtures.tsx`

---

## Summary — Layer 5b audit findings

### A. Primitive duplicates and canonical-owner recommendations

| Concept | Files | Canonical | Orphan(s) | Action |
|---------|-------|-----------|-----------|--------|
| **Select** | `select.tsx`, `form-select.tsx`, `themed-select.tsx` | `select.tsx` (Radix) | `form-select.tsx` (zero non-stories consumers); `themed-select.tsx` (one consumer at `IdentitySettingsSection.tsx`) | Migrate the one IdentitySettings consumer to Radix `Select` + grouped `SelectItem`s with hint formatting; delete both orphans (~347 LOC). |
| **Tag input** | `tag-input.tsx`, `tag-editor.tsx` | `tag-editor.tsx` | `tag-input.tsx` (2-LOC alias; one consumer at `EventEditorDrawer.tsx` uses the alias name) | Migrate the one consumer to `TagEditor`, delete `tag-input.tsx` (~2 LOC + one story). |
| **Confirmation dialog** | `confirm-dialog.tsx` (`Confirm` + `Prompt`), `confirm-delete.tsx` | `ConfirmDialog`/`useConfirm` (modal); `ConfirmDelete` (inline) | `PromptDialog`/`usePrompt` (zero consumers) | Delete `PromptDialog` + `usePrompt` from `confirm-dialog.tsx` (~150 LOC). Keep both `ConfirmDialog` and `ConfirmDelete` — they serve different surfaces (modal vs inline two-stage). |
| **Switch** | `switch.tsx`, `field-switch.tsx` | Both kept — different surfaces | — | Document the split: `Switch` is the bare Radix toggle; `FieldSwitch` is the labelled-row composition. |
| **Tooltip** | `tooltip.tsx`, `tooltip-extended.tsx` | `tooltip.tsx` (Radix + `TooltipHint`) | `HoverTooltip`, `IconTooltip`, `Spotlight`, `useGuidedTour`, `TourStep` (all zero consumers) | Delete entire `tooltip-extended.tsx` (312 LOC). |
| **Toaster** | `sonner.tsx` | (none — no consumers) | `sonner.tsx` (1 LOC, zero non-stories consumers) | Delete `sonner.tsx` and the `sonner` dependency, OR mount a `<Toaster />` somewhere reachable and start using it. |
| **Skeleton** | `skeleton.tsx` (7 exports) | `Skeleton`, `SkeletonLine`, `SkeletonText` | `SkeletonChat`, `SkeletonSidebar`, `SkeletonMessage`, `SkeletonCard` (all zero consumers) | Delete the four orphan skeletons (~58 LOC). |
| **StatCard** | `status-badge.tsx` | (none in scope) | `StatCard` (zero consumers; doesn't belong in `status-badge.tsx` anyway) | Delete `StatCard` (~30 LOC). |
| **Collapsible section** | `ui/section-card.tsx`, `composites/page-panel/page-panel-collapsible-section.tsx` | (decision needed) | One of the two | Pick one as canonical based on consumer count (out-of-layer audit). |
| **Empty state** | `ui/empty-state.tsx`, `composites/page-panel/page-panel-empty.tsx` | Both kept — different surfaces | — | Document the split: `EmptyState` is generic; `PageEmptyState` is the page-panel-tied variant. |
| **Search input** | `composites/search/search-input.tsx`, `composites/search/searchbar.tsx` (`SearchBar` + `SidebarSearchBar`) | (decision needed; 3 implementations) | Two of three | Audit consumers; the small/xs variant + the large/glass variant are both in active use, so likely consolidate `SearchInput` and `SidebarSearchBar` into one, drop the older. |

**Variant explosion in `Button`**: 9 variants, 4 sizes. The
`surface*` family (`surface`, `surfaceAccent`, `surfaceDestructive`)
uses linear-gradient glassmorphism; the rest are flat. Two visual
languages on one `variant` axis. Consider splitting into `tone` (color)
and `surface` (flat | glass) axes — but only after Layer 7 audit
because the impact on consumer call sites is large.

### B. Top 10 deletion candidates (verified)

Ranked by deletion safety (high to low confidence). **All consumer counts
verified by grep across `eliza/`, `apps/`, `packages/` excluding
`node_modules`, `/dist/`, and the file's own stories.**

1. **`tooltip-extended.tsx`** — 312 LOC. `HoverTooltip`, `IconTooltip`,
   `Spotlight`, `useGuidedTour`, `TourStep` all have zero consumers.
   Entire file orphan.
2. **`src/stories/*.stories.tsx`** — 60 files, ~2,000 LOC. No
   `.storybook/` config exists in this package. Currently shipped to
   `dist/`. Delete (or add a working storybook config + exclude from
   build).
3. **`layouts/layout-test-utils.tsx`** — 65 LOC. Test-support shipped
   to `dist/`. Move to `__tests__/` or exclude in build.
4. **`form-select.tsx`** — 64 LOC. Zero non-stories consumers.
5. **`themed-select.tsx`** — 283 LOC. One consumer (`IdentitySettingsSection`).
   Can migrate to Radix `Select` with grouped items.
6. **`hooks/useClickOutside.ts`** — 28 LOC. Zero consumers (only the
   barrel re-exports it).
7. **`hooks/useKeyboardShortcuts.ts`** — 48 LOC. Zero consumers; a
   parallel `app-core/src/hooks/useKeyboardShortcuts.ts` is the live
   one. Unify under app-core or move app-core's into this package.
8. **`tag-input.tsx`** — 2 LOC alias. Migrate one consumer
   (`EventEditorDrawer.tsx`) to `TagEditor`, delete the alias.
9. **`PromptDialog` + `usePrompt` exports in `confirm-dialog.tsx`** —
   ~150 LOC of the 243. Zero consumers. Keep `ConfirmDialog` +
   `useConfirm`.
10. **`sonner.tsx`** — 1 LOC. Zero `Toaster` consumers from
    `@elizaos/ui`. Either mount a `<Toaster />` somewhere live or
    delete the re-export and the sonner dep.

**Honorable mentions** (not in top 10 because they're tied to small
LOC counts or single internal consumers):

- `SkeletonChat`, `SkeletonSidebar`, `SkeletonMessage`, `SkeletonCard`
  in `skeleton.tsx` — zero consumers, ~58 LOC.
- `StatCard` in `status-badge.tsx` — zero consumers, ~30 LOC.
- `ambient-modules.d.ts` — orphan ambient declarations for modules
  imported nowhere in this package.
- `create-task-popover.tsx` — single internal consumer (chat-composer);
  shouldn't be in the public composites barrel.

**Net deletion if all top-10 implemented**: ~3,200 LOC across ~60
files (most of the LOC is the 60 stories files). Even excluding
stories, the source-code deletion is ~1,000 LOC across 9 files.

### C. Theme / CSS-var orphans

Verified by grepping `var(--<token>)` and the corresponding Tailwind
classes (`bg-bg-*`, `text-status-*`, `font-*`) across all
`*.ts`/`*.tsx`/`*.css` outside `node_modules` and `/dist/`:

| Token | Defined in | Consumers | Verdict |
|-------|-----------|-----------|---------|
| `--font-display` | `theme.css:34` (alias of `--font-body`) | None — the only `font-display` hits are the unrelated CSS `font-display: swap` property in cloud apps | Orphan. Delete from theme.css. |
| `--status-info` | `theme.css:30,70` (light + dark) | None — only the definitions themselves | Orphan. |
| `--status-info-bg` | `theme.css:31,71` | None | Orphan. |
| `--bg-elevated` | `theme.css:9,46` | Only `tooltip-extended.tsx:76,130` (which is itself orphan) | Becomes orphan after `tooltip-extended.tsx` deletion. |
| `--font-chat` | `theme.css:35` (alias of `--font-body`) | Used by chat-composer/message/transcript/empty-state | Keep. |
| `--bg-muted` | `theme.css:6,45` | Used by `app-lifeops`, `app-wallet` plugins via `bg-bg-muted` class | Keep. |
| `--mono` | `theme.css:36` | Used by `input.tsx` config variant, `textarea.tsx` config variant, `settings-controls.tsx` textarea | Keep. |

Net theme.css cleanup: ~6 lines per mode × 2 modes = ~12 lines.

### D. Type-strengthening priority list

The package is well-typed by codebase standards — there are zero `any`
casts in production source files. The systemic patterns are:

1. **`cva` cast pattern (10 files)** — Button, Card, Badge, Input,
   Textarea, Stack, Grid, Banner, Typography (Text + Heading), Label
   all have:
   ```ts
   const _xVariants = cva(...);
   const xVariants: (props?: XProps) => string = _xVariants as (props?: XProps) => string;
   ```
   The `_x` prefix + cast indirection is workaround for cva's verbose
   inferred type. Solution: a single helper
   `cvaTyped<P>(cva(...))` in `lib/cva-typed.ts` that absorbs the cast,
   or — simpler — derive `XProps` from `VariantProps<typeof
   xVariants>` (cva ships this helper) and drop the hand-written
   props interfaces entirely.
2. **`OnboardingStep` open-string union** — `types/onboarding.ts:1`
   uses literal union `"deployment" | "providers" | "features"` —
   correctly closed. Good. (Layer 5a `OnboardingProviderId` does NOT
   close — see 5a finding.)
3. **`ConnectionStatus` aria-live / role** — typed as `string` from
   `HTMLAttributes`. Could be narrowed to literal union
   `"polite" | "assertive" | "off" | undefined` and `"alert" | "status"`
   — but they're already constrained at runtime by the conditional.
   Low priority.
4. **`ChatLabelSet` (chat-types.ts)** — 40 optional string fields
   covering every chat UI label. types:no narrowing on the set; a
   missing label silently renders the (typically English) default.
   Should consider `Record<ChatLabelKey, string>` with `ChatLabelKey`
   being a const-asserted union — out-of-layer fix because the labels
   are the i18n surface.
5. **`HeadingProps.level`** — `level ?? "h1"` collapses null /
   undefined / explicit-h1 silently. Tighten the prop default and
   warn on null.

### E. Boundary issues

| File | Concern | Recommendation |
|------|---------|---------------|
| `ambient-modules.d.ts` | Declares modules (`@elizaos/signal-native`, `three/...meshopt_decoder`, `jsdom`) that nothing in this package imports | Delete or move declarations to their actual owners (apps/app, app-companion, vitest setup). |
| `layouts/layout-test-utils.tsx` | Test fixtures shipped to `dist/` because `tsconfig.build.json` doesn't exclude them | Move to `__tests__/` or add `exclude`. |
| `src/stories/*` | 60 story files shipped to `dist/`; no working `.storybook/` config in the package | Add config or delete. |
| `composites/sidebar/sidebar-types.ts` | `SidebarVariant = "default" \| "game-modal" \| "mobile"` — `game-modal` is a domain-specific variant for game embeds | The variant is correctly here because the sidebar's chrome differs in modal embeds; keep. But note: the AGENTS.md commandment 5 ("Zero polymorphism for runtime game/content type branching") suggests `game-modal` should be a separate sidebar (`GameModalSidebar`) rather than a variant. Track for Layer 7 / 10 cleanup. |
| `chat/create-task-popover.tsx` | Single internal consumer (`chat-composer.tsx`); listed in public chat barrel | Remove from public barrel; either inline into chat-composer or move to `chat/internal/`. |
| `ui/admin-dialog.tsx` | The "Admin" naming presumes a specific consumer (the dev/admin UI in app-core). If only app-core uses it, it's mislocated | Out-of-layer verify; if zero non-app-core consumers, move to app-core's own components. |

### F. Process / package config gaps

- **No working Storybook**. devDependencies include `storybook@^10.3.5`
  and `@storybook/react@^10.3.5` but there is no `.storybook/` directory
  and no `dev:storybook` / `build:storybook` script. The 60 story
  files ship into `dist/` because `tsconfig.build.json` doesn't
  exclude them. Pick a direction.
- **`tsconfig.build.json` doesn't exclude tests/stories**. Verified
  by file inspection: `layout-test-utils.tsx` ships in `dist/`; all
  stories ship in `dist/`. The `*.test.*` files don't exist in this
  package (only stories), but the build glob is over-broad.
- **`peerDependencies`** correctly pin React 19; no `react` /
  `react-dom` in `dependencies`. Good. `lucide-react@^1.0.0` is
  pinned to a very old major (current is 0.4xx → 1.0.0 just shipped) —
  worth a confirmation it's resolving to the new line.

### G. Top 5 highest-impact refactors for this layer

1. **Resolve the Storybook situation** (add config + exclude from
   build, OR delete all stories). Net delete potential: 60 files,
   ~2,000 LOC; net build artifact reduction: significant.
2. **Delete `tooltip-extended.tsx`** — single file, 312 LOC, three
   unrelated zero-consumer components.
3. **Consolidate the three Select implementations** — migrate
   `IdentitySettingsSection`'s sole `ThemedSelect` use to Radix
   `Select`, delete `themed-select.tsx` (283 LOC) and `form-select.tsx`
   (64 LOC). Net: -347 LOC, one obvious select primitive.
4. **Extract `cvaTyped` helper / use `VariantProps<typeof xVariants>`**
   — eliminate the 10 `_xVariants as (props?: XProps) => string`
   casts and the parallel hand-written `XProps` interfaces. Net:
   ~50 LOC removed across 10 files; types stay sound.
5. **Delete the orphan hook + skeleton variants** (`useClickOutside`,
   `useKeyboardShortcuts` + `formatShortcut`, `SkeletonChat` /
   `SkeletonSidebar` / `SkeletonMessage` / `SkeletonCard`, `StatCard`,
   `Toaster`/`toast` re-export, `PromptDialog`/`usePrompt`,
   `tag-input.tsx`). Net: ~330 LOC across 7 files removed; barrel
   gets cleaner.

### H. One surprise

**The `@elizaos/ui` package has zero direct external imports.** A grep
for `from "@elizaos/ui"` across `apps/`, `packages/`, and `eliza/`
(excluding the package itself, `node_modules`, and `/dist/`) returns
**zero hits in `apps/`** and 217 hits exclusively inside
`eliza/packages/app-core/src/`, `eliza/plugins/*`, and a handful of
test files. The renderer in `apps/app/` reaches the UI primitives
indirectly — through `@elizaos/app-core`'s own re-exports, the source-
mode aliasing in `apps/app/vite.config.ts`, and `apps/homepage/src/styles.css`'s
`@import "@elizaos/app-core/styles/base.css"` (which reaches the theme
this way).

This means this package's *real* public surface is whatever
`@elizaos/app-core` chooses to re-export, not the 25-line top-level
barrel. A symbol that's exported here but **not** re-exported by
app-core is functionally private to plugins. That's worth confirming
during Layer 7 — if `app-core/src/index.ts` and `app-core/src/browser.ts`
re-exports turn out to gate which UI symbols are reachable from the
renderer, several of the "zero consumers in `apps/`" verdicts above
become less surprising and more structural.
