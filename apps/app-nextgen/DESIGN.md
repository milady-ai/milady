---
version: alpha
name: Milady Executive
description: >-
  Dark, premium "executive" identity for the Milady web3 companion. Velvet
  rich-black surfaces (never pure #000), a single classic-gold accent that
  BRIGHTENS on interaction (never darkens to black), champagne/steel neutrals,
  Saira Condensed display + JetBrains Mono labels. Grounded in the existing
  milady-executive theme (apps/app/src/styles/milady-executive.css).
colors:
  # — velvet blacks / surfaces —
  jet-black: "#08080a"
  rich-black: "#0a0a0b"
  charcoal: "#121214"
  gunmetal: "#17171a"
  bg: "#0a0a0b"
  surface: "#17171a"
  card: "#121214"
  elevated: "#151518"
  hover-surface: "#1d1d22"
  # — gold accent ramp —
  deep-gold: "#a8946b"
  classic-gold: "#c9b38c"
  highlight-gold: "#e8dcc0"
  burnished-gold: "#b9a173"
  champagne-gold: "#ece7df"
  # — neutrals —
  steel: "#8d877c"
  bright-silver: "#b8b2a6"
  dark-silver: "#2a2a2e"
  # — semantic —
  primary: "{colors.classic-gold}"
  on-primary: "#0a0a0b"
  accent: "{colors.classic-gold}"
  accent-hover: "{colors.highlight-gold}"
  on-accent: "#0a0a0b"
  text: "#ece7df"
  text-strong: "#f6f2ea"
  muted: "#8d877c"
  border: "#26241f"
  success: "#6fcf97"
typography:
  display:
    fontFamily: "Saira Condensed, 'Arial Narrow', system-ui, sans-serif"
    fontSize: 2.5rem
    fontWeight: 600
    letterSpacing: 0.02em
  h1:
    fontFamily: "Saira Condensed, 'Arial Narrow', system-ui, sans-serif"
    fontSize: 1.6rem
    fontWeight: 600
  body-md:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 1rem
    lineHeight: 1.5
  label-caps:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 0.7rem
    letterSpacing: 0.12em
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 0.85rem
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: 8px
  nav-item-hover:
    backgroundColor: "{colors.hover-surface}"
    textColor: "{colors.text}"
  nav-item-active:
    textColor: "{colors.accent}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 16px
  topbar:
    backgroundColor: "{colors.jet-black}"
    textColor: "{colors.text}"
---

## Overview

Milady is a web3 AI companion. The surface should feel like a **premium matte
instrument** — quiet, dark, and expensive — not a consumer toy. Think machined
metal and velvet: deep ink-black fields, a single warm gold that does all the
talking, and crisp condensed type. Restraint is the brand. One accent, used
sparingly, against a lot of dark space.

## Colors

The palette is high-contrast velvet neutrals plus **one** accent.

- **Backgrounds** are velvet blacks, never pure `#000`: `bg`/`rich-black`
  (`#0a0a0b`) for the canvas, `surface`/`gunmetal` (`#17171a`) and `card`
  (`#121214`) for raised panels, `elevated` (`#151518`) for the topmost layer.
- **Classic Gold (`#c9b38c`)** is the sole interaction color — the resting
  `accent`. It marks what is active, primary, or interactive. Used everywhere it
  must mean "this matters."
- **Highlight Gold (`#e8dcc0`)** is the *only* hover for gold: it gets
  **lighter**, never darker and never toward black. Gold→black on hover is
  forbidden (see Don'ts).
- **Champagne (`#ece7df`)** is body `text`; `text-strong` (`#f6f2ea`) for
  headings. **Steel (`#8d877c`)** is `muted` — borders, captions, metadata.
- **Success (`#6fcf97`)** is the only non-gold status hue, reserved for
  "running/healthy" dots. There is **no blue** anywhere.

## Typography

- **Display & headings — Saira Condensed**, 600 weight, slightly open tracking
  (`0.02em`). Condensed grotesk gives the "executive broadsheet" gravitas.
- **Body — system sans stack** (`ui-sans-serif, system-ui, …`), zero bundle
  cost, 1rem / 1.5 line-height.
- **Labels & metadata — JetBrains Mono**, small (`0.7rem`), **UPPERCASE** with
  wide tracking (`0.12em`). This is the "instrument readout" voice for statuses,
  phase text, addresses, and section labels.

## Layout

- Generous dark negative space; content centered on a calm canvas, never
  edge-to-edge clutter.
- Spacing scale: `xs 4 · sm 8 · md 16 · lg 24 · xl 40`. Default gutter is `md`;
  section rhythm is `lg`–`xl`.
- A single thin top bar (`jet-black`) holds brand + nav; the stage below is the
  companion's space.

## Elevation & Depth

Depth is built from **layered velvet blacks + soft gold glow**, not hard
shadows. `bg` → `card`/`surface` → `elevated`, each a touch lighter. Borders are
near-invisible hairlines (`border` `#26241f` / champagne at 5–14% opacity). The
companion orb and active accents carry a soft gold halo
(`rgba(201,179,140,0.25)`) rather than drop shadows.

## Shapes

Soft, not pill-everywhere. `sm 4px` for chips/bars, `md 8px` for buttons/nav,
`lg 12px` for cards/panels, `full` only for status dots and the avatar orb.
Right angles and gentle radii read as "instrument," not "bubble."

## Components

- **button-primary** — gold fill, ink text, `md` radius, `12px` pad. Hover →
  `button-primary-hover` brightens to highlight-gold (lighter).
- **nav-item** — muted text, transparent rest; hover fills with `hover-surface`
  + champagne text; active is gold text (no fill).
- **card** — `card` background, `lg` radius, hairline border, `md` pad; used for
  status/wallet/info panels.
- **topbar** — `jet-black` bar, champagne text, brand dot + wordmark left, nav
  center, mono phase label right.

## Do's and Don'ts

- ✅ Use gold as a **scarce** accent — one or two gold elements per view.
- ✅ Hover gold by getting **lighter** (`accent` → `accent-hover`).
- ✅ Hover neutrals with a neutral surface tint (`hover-surface`), not gold.
- ✅ Keep backgrounds velvet black (`#0a0a0b`/`#08080a`), never pure `#000`.
- ✅ Use JetBrains Mono uppercase for statuses, phases, and addresses.
- ❌ Never fade gold toward **black** on hover/press (gold only brightens).
- ❌ Never introduce **blue** or a second accent hue.
- ❌ Don't flood a view with gold — it stops meaning "important."
- ❌ Don't use hard drop shadows; build depth from layered blacks + gold glow.
