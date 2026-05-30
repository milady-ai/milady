# Milady Whitelabel Client — Executive Design System (Foundation Pass)

**Date:** 2026-05-30
**Status:** Approved design — ready for implementation plan
**Scope:** Foundation + chrome. Per-screen editorial re-layout is a later pass.

## Problem

`apps/app` is already the Milady client (its own `app.config.ts`, namespace, env
aliases, character catalog, `appName: "Milady"`), but it still *looks* like
elizaOS: it consumes the shared `@elizaos/app-core` + `@elizaos/ui` and inherits
their chrome. The most visible offender is the startup splash, which hardcodes
elizaOS blue-on-white and the literal string `"elizaOS"`. The user wants Milady
to read as **its own white-labeled version** with an **executive** identity —
flat velvet black, soft smooth textures, warm champagne/cream gold accents,
condensed-display + monospace typography — in the spirit of the `.cache`
gift-card reference, codified in a `design.md` (google-labs `DESIGN.md` format).

## Decisions (locked with the user)

1. **Whitelabel depth:** brand + theme layer. Keep consuming the shared runtime
   UI; ship Milady's own complete design system + branding that reskins every
   surface; close the spots where upstream hardcodes elizaOS. No fork.
2. **Theme strategy:** replace. The executive look becomes *the* Milady identity;
   retire the current `brand-gold.css` import. No theme switcher.
3. **First increment:** foundation + chrome (design.md + theme tokens + branded
   splash/chrome that renders Milady). Per-screen polish follows.
4. **Fonts:** bundle self-hosted, open-licensed (offline-capable, fits
   local-first/desktop).

## Key architecture finding — the CSS-variable cascade (the spine)

`@elizaos/ui` is fully token-driven: `styles.css` defines a Tailwind
`@theme inline` map over CSS custom properties (`--bg`, `--accent`, `--card`,
`--text`, `--border`, `--radius`, `--shadow-*`, fonts…); changing the vars
reskins every component. There are two ways those vars get set:

- **Static stylesheet** — `brand-gold.css` imported in `main.tsx` sets `:root`
  tokens (it is already a flat-black + gold sheet; the gold is a *bright* yellow
  `#f0b90b` and the font is Poppins).
- **Inline at boot** — `AppContext.tsx:230-234` runs
  `applyThemeToDocument(branding.theme, uiTheme)` **only when
  `branding.theme` is set** (`if (!brandTheme) return;`). `applyThemeToDocument`
  (`themes/apply-theme.ts`) sets **inline** `root.style.setProperty(...)`, which
  beats any stylesheet `:root{}` rule for every token in `THEME_CSS_VAR_MAP`.

**Consequence:** because Milady will **not** set `branding.theme`, nothing
applies inline token overrides at boot — so a static stylesheet remains
authoritative, exactly as `brand-gold.css` is today. We therefore deliver the
Milady theme as **one CSS sheet**, not a parallel `ThemeDefinition` object. This
is the least-complicated coherent design and keeps a single source of truth.

> Trade-off considered: expressing colors as a `ThemeDefinition` via
> `branding.theme`. Rejected for the foundation pass — it would force colors into
> the inline path and split the brand across a TS object + a CSS sheet for the
> non-token bits (velvet gradients, letter-spacing, `@font-face`), with no
> benefit while we are *replacing* (not offering a user-pickable variant).

## Architecture

```
apps/app/                      ← the Milady client (committable)
  design.md                    ← NEW. Source of truth (DESIGN.md format)
  src/main.tsx                 ← swap brand-gold.css import → milady-executive.css
  src/styles/
    milady-executive.css       ← NEW. The whole theme: :root tokens + @font-face
                                  + velvet textures + letter-spacing + splash recolor
    fonts/                      ← NEW. self-hosted woff2 (condensed display + mono)
  public/brand/favicons/
    favicon.svg                ← REPLACE elizaOS face → minimal Milady mark

eliza/packages/ui/             ← upstream (non-committable here)
  …/shell/StartupShell.tsx     ← targeted upstream PR: read useBranding().appName
                                  + theme tokens instead of hardcoded hex + "elizaOS"
```

The whitelabel rides three existing, already-wired levers — no new app
architecture:

1. `BrandingConfig.appName` — already `"Milady"`; `{{appName}}` chrome already
   says Milady via `useBranding()` / `appNameInterpolationVars`.
2. The token-driven UI — one `:root` sheet reskins all body components.
3. `<AppProvider branding={APP_BRANDING}>` is already passed in `main.tsx`.

## The design system (`apps/app/design.md`)

google-labs `DESIGN.md` format: YAML token front-matter (keyed to the real
`ThemeColorSet` / CSS-var names) + prose sections in canonical order: **Overview ·
Colors · Typography · Layout · Elevation & Depth · Shapes · Components · Do's &
Don'ts**. `milady-executive.css` is the literal implementation of these tokens;
they are kept in sync by review (no codegen step in this pass — YAGNI).

### Colors (executive velvet, indicative — finalized in design.md)

| Role | Value | Notes |
|---|---|---|
| `--bg` | `#0a0a0b` | velvet near-black, never pure `#000` |
| `--bg-elevated` / `--card` | `#121214` → `#17171a` | smooth step up |
| `--surface` glow | radial `rgba(201,179,140,0.06)` | the "velvet" sheen on cards |
| `--text` | `#ece7df` | warm cream-white |
| `--muted` | `#8d877c` | warm grey |
| `--border` | `rgba(236,231,223,0.08)` | low-contrast hairline |
| `--accent` | `#c9b38c` | **champagne/cream gold**, not bright `#f0b90b` |
| `--accent-hover` | `#e8dcc0` | lighter champagne (resting→lighter, never →black) |
| `--accent-foreground` | `#0a0a0b` | text on accent |

Accent is **sparing** — editorial, not gilded. (Note: this brand is intentionally
warm-gold; the cloud-frontend "no blue / orange-accent" rule in CLAUDE.md governs
`packages/cloud-frontend`, a different surface, and does not bind this desktop
client. Flag for confirmation if cloud-frontend must share the palette.)

### Typography

- **Display/headers:** self-hosted condensed grotesque (candidate: *Saira
  Condensed* / *Archivo Narrow* — OFL). Drives `--font-display`.
- **Labels/meta:** self-hosted monospace (candidate: *IBM Plex Mono* /
  *JetBrains Mono* — OFL), uppercase + tracked for section labels (`01 / 03`,
  `LIVE PREVIEW`). Drives `--font-mono`.
- **Body:** keep a clean grotesque (mono or a neutral sans) per design.md.
- Final family choices live in design.md; files bundled under `src/styles/fonts/`.

### Elevation & textures ("soft velvet smooth")

Single low, soft shadow + one diffuse light-source glow per card (no hard
drop-shadows); large radii; smooth gradients; matte — no gloss.

## The startup splash (the headline complaint)

`StartupShell.tsx` hardcodes `bg-[#F7F9FF] text-[#0B35F1]` + a white logo ring +
the literal `"elizaOS"`, and ignores branding. `firstRunTheme` exists in
`BrandingConfig` but is **consumed nowhere**, so it is not the lever. Plan:

1. **Committable recolor (ships in the real build):** a scoped block in
   `milady-executive.css` targeting `[data-testid="startup-shell-loading"]` (and
   the hardcoded-blue children — logo ring, status text, skeleton bars) recolors
   the splash to velvet-black + champagne. These literal-hex Tailwind classes are
   immune to token swaps but overridable by a scoped sheet. Fragile-by-nature
   (couples to upstream class strings) — documented as a stopgap.
2. **Committable mark:** replace the served `favicon.svg` (the splash logo) with a
   minimal Milady mark (a champagne dot/monogram on velvet), so the elizaOS face
   is gone from the splash committably.
3. **The literal text `"elizaOS"`:** the only residue not fixable from
   `apps/app`. Durable fix = **targeted upstream PR** making `StartupShell` read
   `useBranding().appName` + theme tokens. Immediate dev visibility = a local
   `eliza/` edit (non-committable; the clone is gitignored). Mark in the
   component becomes the typographic wordmark `• Milady` in the condensed font.

Net: after this pass the splash is on-brand velvet **in the packaged build**; the
upstream PR removes the last hardcoded string.

## Verification

- `bun run --cwd apps/app build` (production vite build the desktop shell loads).
- Desktop dev render check via the dev observability endpoints
  (`/api/dev/cursor-screenshot`, `/api/dev/console-log`) to confirm the executive
  look + Milady splash render with no regressions.
- `bun run verify` (typecheck + lint) for the touched `apps/app` files.
- The full 5-loop `audit:cloud` visual review applies to `cloud-frontend` and to
  the later all-screens re-skin pass — not gating this foundation pass.

## Out of scope (this pass)

- Per-screen editorial re-layout of every route.
- A theme switcher / light-mode variant (we are replacing, single dark brand).
- A bespoke Milady logo *glyph* beyond the minimal favicon mark + wordmark.
- Touching `cloud-frontend` or the marketing homepage.

## Risks

- **Splash recolor couples to upstream class strings** — mitigated by the upstream
  PR being the durable fix; the CSS stopgap is clearly marked and small.
- **Stale alpha** — the upstream `StartupShell` PR won't reach a packaged Milady
  build until elizaOS republishes `alpha` (gated on upstream green CI). The
  committable recolor + favicon make the splash on-brand *without* waiting on that.
- **Font weight** — bundling woff2 adds repo/bundle size; keep to the two weights
  actually used (display + mono), subset if needed.
- **`brand-gold.css` other importers** — confirm nothing else depends on it being
  imported by `main.tsx`; it remains in `@elizaos/ui` for other consumers, we only
  stop importing it here.
