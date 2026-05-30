---
# Milady Executive — design tokens.
# Source of truth for src/styles/milady-executive.css. Keep the two in sync.
meta:
  name: Milady Executive
  mode: dark-only
colors:
  bg: "#0a0a0b"          # velvet near-black (never pure #000)
  bgElevated: "#151518"
  card: "#121214"
  surface: "#17171a"
  text: "#ece7df"        # warm cream-white
  textStrong: "#f6f2ea"
  muted: "#8d877c"       # warm grey
  border: "rgba(236,231,223,0.08)"  # low-contrast hairline
  accent: "#c9b38c"      # champagne / cream gold — resting
  accentHover: "#e8dcc0" # lighter champagne — hover (never darker / →black)
  accentForeground: "#0a0a0b"
typography:
  display: { fontFamily: "Saira Condensed", weight: "600", case: "none", tracking: "0.01em" }
  mono:    { fontFamily: "JetBrains Mono", weight: "500", case: "upper for labels", tracking: "0.12em" }
  body:    { fontFamily: "system sans stack", weight: "400" }
radius: { sm: "4px", md: "8px", lg: "14px" }
elevation:
  glow: "single diffuse light-source, radial rgba(201,179,140,0.06)"
  shadow: "one low soft shadow; matte, no gloss"
---

## Overview

Milady's executive identity: flat velvet black, soft smooth textures, sparing
warm champagne/cream gold, condensed-display + monospace type. Editorial, calm,
premium — the spirit of the `.cache` gift-card reference, but velvet-darker and
smoother. This file is the source of truth; `src/styles/milady-executive.css`
implements these tokens. The shared elizaOS UI is token-driven, so overriding the
CSS custom properties reskins the whole client — no fork.

## Colors

Velvet near-blacks (`#0a0a0b` → `#17171a`), never pure `#000`. Text is warm
cream-white (`#ece7df`); secondary text is warm grey (`#8d877c`). Borders are
low-contrast hairlines (`rgba(236,231,223,0.08)`).

Champagne gold (`#c9b38c`) is an **accent, not a fill** — the active state, a
single hairline, the wordmark dot, a focus ring. Hover goes *lighter*
(`#e8dcc0`), never darker. Use it sparingly: editorial, not gilded.

## Typography

- **Display** — Saira Condensed (condensed grotesque), weight 600. Headers and
  the wordmark. `--font-display`.
- **Labels / meta** — JetBrains Mono, weight 500, **uppercase + tracked**
  (`01 / 03`, `LIVE PREVIEW`, status text). `--font-mono`.
- **Body** — system sans stack (`--font-sans`), for readability and zero bundle
  cost. Replaces Poppins.

Two webfonts only, latin-subset `woff2`, `font-display: swap`. No external CDN.

## Layout

Generous whitespace; left-aligned editorial blocks; numbered section markers; a
mono label above each content block. Calm density — let the velvet breathe.

## Elevation & Depth

One diffuse top glow per card (`radial rgba(201,179,140,0.045)`) plus one low soft
shadow. Matte — no gloss, no hard drop-shadows. Large radii.

## Shapes

Rounded, soft. Pills for tags. Hairline dividers, not boxes.

## Components

- **Buttons** — champagne resting → lighter-champagne hover (never → black).
- **Cards** — velvet surface + faint top glow.
- **Inputs** — near-black fill, hairline border, champagne focus ring.
- **Startup splash** — velvet radial gradient (no video), `• Milady` wordmark in
  the display font, champagne dot, mono status line.

## Do's and Don'ts

- DO keep gold sparing and warm (`#c9b38c`); DON'T use bright yellow-gold (`#f0b90b`).
- DO use velvet near-blacks; DON'T use pure `#000`.
- DON'T introduce blue anywhere.
- DON'T add gloss or hard shadows.
- DON'T put a video or a webfont on the startup critical path (system fallback
  paints first; the display font enhances once loaded).
