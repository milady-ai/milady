# Milady Whitelabel Client — Own Frontend Layer + Executive Design System

**Date:** 2026-05-30
**Status:** Approved direction — ready for Phase 1 implementation plan
**Driving constraint:** **Clear, distinct architectural separation** between Milady's
frontend and the base elizaOS UI. Milady must own its identity layer, not be a
recolored elizaOS under the paint.

## Problem

`apps/app` is Milady's own, committable client, but today it is a thin shell
(4 source files) that renders elizaOS's `<App>` from `@elizaos/app-core`. So it
*looks* and *is structured* like elizaOS — same chrome, same startup screen
(hardcoded elizaOS blue + the literal string `"elizaOS"`), same navigation. The
user wants Milady to read as **its own version** with an **executive** identity
(flat velvet black, soft smooth textures, warm champagne/cream gold accents,
condensed-display + monospace type, `.cache`-spirit editorial layout), codified
in a `design.md` (google-labs `DESIGN.md` format).

## Architecture findings (researched, with evidence)

- **`App` is a 1743-line monolith** — `eliza/packages/ui/src/App.tsx`. It is a
  switch on `tab` and exports only `App` itself (`App.tsx:1116`).
- **Shell chrome is NOT injectable.** The boot-config slot system
  (`companionShell`, `characterEditor`, `codingAgentTasksPanel`, `stewardLogo`,
  `lifeOpsPageView`, … in `config/boot-config-store.ts`) injects only *leaf
  feature widgets*. The Header (`components/shell/Header.tsx`), conversations
  sidebar, desktop tab bar, layout frame, view-router, and **startup screen** are
  hardwired inside `App`. A theme can recolor them but can never make them
  Milady's — **so theme-only ≠ separation.**
- **The pieces are modular files**, not inlined: `components/pages/ChatView.tsx`,
  `SettingsView.tsx`, `HomeView.tsx`, `StreamView.tsx`, `shell/Header.tsx`,
  `conversations/ConversationsSidebar.tsx` each stand alone. They are simply not
  on the package's public barrel (`index.ts` does `export * from "./App"`, which
  surfaces only `App`).
- **Startup render seam:** `App.tsx:1593` — inside
  `if (startupCoordinator.phase !== "ready" || !firstRunComplete)` it returns
  `<CloudVideoBackground><div data-testid="pre-agent-cloud-shell"><StartupScreen/></div>…`.
  This is the exact insertion point for a host-supplied startup shell.
- **Theming (CSS vars) is the one already-clean seam** — `styles.css` defines a
  Tailwind `@theme inline` map over CSS custom properties; `brand-gold.css`
  overrides `:root`. `AppContext.tsx:230-234` applies a `BrandingConfig.theme`
  `ThemeDefinition` inline **only when `branding.theme` is set** (`if (!brandTheme)
  return;`), and `applyThemeToDocument` (`themes/apply-theme.ts`) sets inline
  `:root` props that beat stylesheets. Milady will not set `branding.theme`, so a
  static sheet stays authoritative — exactly as `brand-gold.css` is today.

## Chosen architecture

**Milady owns its own shell/identity layer and composes elizaOS feature *views* as
content. It does NOT fork the 1743-line monolith.**

```
apps/app/                          ← Milady client (committable)
  design.md                        ← NEW. Design system source of truth (DESIGN.md format)
  src/
    main.tsx                       ← mounts MiladyApp instead of <App>; swaps theme import
    ui/                            ← NEW. Milady-owned frontend layer
      MiladyApp.tsx                ← own shell: startup gate + chrome + router (Phase 2)
      shell/
        MiladyStartupShell.tsx     ← own startup/splash (Phase 1)
        MiladyHeader.tsx           ← own top bar / nav (Phase 2)
        MiladySidebar.tsx          ← (Phase 2/3)
      router/                      ← dispatches tabs → composed elizaOS views (Phase 2)
    styles/
      milady-executive.css         ← NEW. Executive theme: :root tokens + @font-face + textures
      fonts/                       ← NEW. self-hosted woff2 (condensed display + mono)
  public/brand/favicons/
    favicon.svg                    ← REPLACE elizaOS face → Milady mark

eliza/packages/ (upstream — non-committable here; small, low-risk PRs)
  ui/src/App.tsx                   ← render bootConfig.startupShell ?? <StartupScreen/> at :1593
  ui/src/index.ts                  ← export the feature views + state hooks (useApp,
                                     useBootConfig, useBranding) so apps/app can compose them
```

- **Owns** (identity surfaces): startup/splash, header/nav, sidebar, layout frame,
  view-router — built on the executive design system.
- **Composes** (functionality): elizaOS feature views (`ChatView`, `SettingsView`,
  `HomeView`, …) + the elizaOS state layer (`AppProvider`/`useApp`/`useBootConfig`)
  — imported, not rebuilt. Chat/settings/etc. stay shared and keep working.
- **The seam** is "own the shell + export the views," not "copy the monolith." The
  only upstream work is a `startupShell` slot + barrel exports of already-standalone
  files — small and low-risk.

> Rejected alternatives: **theme-only** (no real separation — shares all chrome);
> **fork the monolith** (copy 1743 LOC into `apps/app` — brittle, must track
> upstream); **slot-only** (impossible — chrome is hardwired, not slot-fed). The
> own-shell-compose-views path is the minimal change that achieves genuine
> separation while keeping the elizaOS feature ecosystem.

## The design system (`apps/app/design.md`)

google-labs `DESIGN.md` format: YAML token front-matter (keyed to the real
`ThemeColorSet` / CSS-var names) + prose in canonical order: **Overview · Colors ·
Typography · Layout · Elevation & Depth · Shapes · Components · Do's & Don'ts**.
`milady-executive.css` is the literal implementation; kept in sync by review (no
codegen this pass — YAGNI).

### Colors (executive velvet — indicative; finalized in design.md)

| Role | Value | Notes |
|---|---|---|
| `--bg` | `#0a0a0b` | velvet near-black, never pure `#000` |
| `--bg-elevated` / `--card` | `#121214` → `#17171a` | smooth step up |
| surface glow | radial `rgba(201,179,140,0.06)` | the "velvet" sheen |
| `--text` | `#ece7df` | warm cream-white |
| `--muted` | `#8d877c` | warm grey |
| `--border` | `rgba(236,231,223,0.08)` | low-contrast hairline |
| `--accent` | `#c9b38c` | champagne/cream gold (not bright `#f0b90b`) |
| `--accent-hover` | `#e8dcc0` | lighter champagne (resting→lighter, never →black) |
| `--accent-foreground` | `#0a0a0b` | text on accent |

Accent is sparing — editorial, not gilded. (The cloud-frontend "no blue /
orange-accent" rule in CLAUDE.md governs `packages/cloud-frontend`, a separate
surface; this desktop client is intentionally warm-champagne. Treated as distinct
brands unless told otherwise.)

### Typography
- **Display:** self-hosted condensed grotesque (candidate *Saira Condensed* /
  *Archivo Narrow*, OFL) → `--font-display`.
- **Labels/meta:** self-hosted monospace (candidate *IBM Plex Mono* /
  *JetBrains Mono*, OFL), uppercase + tracked → `--font-mono`.
- **Body:** clean neutral grotesque per design.md. Replaces Poppins.
- Files bundled under `src/styles/fonts/`; exact families finalized in design.md.

### Elevation & textures ("soft velvet smooth")
One low soft shadow + a single diffuse light-source glow per card; large radii;
smooth gradients; matte, no gloss.

## Performance — lightning fast (first-class requirement)

Speed is a hard requirement, not a nice-to-have. The executive direction helps,
not hurts, here:

- **First paint:** Milady's startup shell is dependency-light with its critical
  CSS inlined. It **drops `CloudVideoBackground`** (an HQ 1080p MP4 decoded on
  first paint) in favor of a pure-CSS velvet gradient — faster *and* on-brand.
  Target: startup visible on first frame, no video/network on the critical path.
- **Fonts (the main theme-perf risk):** self-hosted `woff2`, **subset** to used
  glyphs, **only the weights actually used** (display + mono), `font-display: swap`,
  and `<link rel="preload">` for the two faces. A system fallback stack paints text
  immediately so there's no FOIT. No webfont network requests.
- **Theme CSS:** one small sheet; velvet = pure CSS gradients (no image/video
  textures). No runtime theme computation (static `:root`, no `branding.theme`
  inline pass).
- **Shell layer stays thin:** Milady's shell composes existing components and
  preserves elizaOS's `React.lazy` route splitting — it adds no extra providers,
  no extra re-renders, no heavy dependencies. Feature views stay lazy.
- **Bundle discipline:** no new heavy deps; measure `apps/app` build output and
  keep the Milady layer's added weight minimal (fonts subset, CSS small).

## Phasing

### Phase 1 (this pass) — design system + own startup
- **Committable now, immediate:** author `design.md`; ship `milady-executive.css`
  (replaces the `brand-gold.css` import in `main.tsx`) + self-hosted fonts → the
  whole token-driven body reskins to the executive look. As a committable stopgap
  for the splash before the slot lands, a scoped recolor of
  `[data-testid="pre-agent-cloud-shell"]` / `startup-shell-loading` + a Milady
  `favicon.svg` make the front door velvet in the packaged build.
- **The clean ownership:** `MiladyStartupShell.tsx` (Milady's own splash — `• Milady`
  wordmark in the condensed font, executive palette, velvet) supplied via a new
  `startupShell` boot-config slot. Upstream PR adds the slot at `App.tsx:1593`
  (`bootConfig.startupShell ?? <StartupScreen/>`); works in local `eliza/` dev
  immediately, reaches packaged builds after the alpha republish. Local `eliza/`
  edit applied meanwhile so dev shows it now.

### Phase 2 — own the app shell + chrome
`MiladyApp.tsx` + `MiladyHeader`/sidebar/layout + a router that dispatches tabs to
**composed** elizaOS views. Requires the upstream barrel exports of the views +
state hooks. `main.tsx` mounts `MiladyApp` instead of `<App>`.

### Phase 3+ — own individual screens only where the brand demands it.

## Verification
- `bun run --cwd apps/app build` (the production vite build the desktop shell loads).
- Desktop dev render check via dev observability endpoints
  (`/api/dev/cursor-screenshot`, `/api/dev/console-log`) — executive look + Milady
  startup render, no regressions.
- `bun run verify` (typecheck + lint) on touched `apps/app` files.
- **Performance check:** measure startup first-paint (dev console timing +
  screenshot timing) before/after; confirm no video/webfont on the critical path;
  record `apps/app` build size delta and keep the Milady layer's added weight
  minimal. A regression in first-paint or bundle size blocks "done."
- Full 5-loop `audit:cloud` review applies to `cloud-frontend` / the later
  all-screens pass — not gating Phase 1.

## Out of scope (this pass)
- Phase 2/3 chrome + screen ownership (planned separately).
- A theme switcher / light-mode variant (single dark executive brand).
- A bespoke Milady logo *glyph* beyond a minimal favicon + the wordmark.
- `cloud-frontend` and the marketing homepage.

## Risks
- **Milady maintains its shell layer** — bounded (identity surfaces only; feature
  views composed, not copied), but real ongoing work.
- **Upstream-gated for packaged builds** — the `startupShell` slot + view/state
  exports must merge upstream and republish to `alpha` to reach packaged Milady
  builds. Committable theme + splash recolor + favicon give visible separation
  meanwhile; local `eliza/` dev gets the full path immediately.
- **Splash recolor stopgap couples to upstream class strings** — small, clearly
  marked, retired once `MiladyStartupShell` lands via the slot.
- **Export surface** — composing views needs `useApp`/`useBootConfig`/views on the
  barrel; they are standalone files so the export is low-risk (confirm exact set
  in the plan).
- **Font weight** — bundle only the two weights used; subset if needed.
