# Milady whitelabel

Milady is a whitelabel wrapper over elizaOS (`@elizaos/*`). Product identity is
driven by **`apps/app/app.config.ts`** (appName, appId `ai.milady.app`,
urlScheme `milady`, `web.iconBackgroundColor`, `branding`). The brand accent is
classic-gold **`#f0b90b`** (see `@elizaos/ui` `styles/brand-gold.css`).

## Regenerating brand assets

One command rebuilds every app icon + splash (web, Android, iOS, desktop) from a
single source mark over the brand palette:

```bash
python3 apps/app/scripts/generate-brand-assets.py   # needs Pillow
```

- Source mark: `apps/homepage/public/milady-icon.png` (override with `BRAND_MARK`).
- Palette: `BRAND_BG` / `BRAND_INK` env (defaults: gold `#f0b90b`, ink `#0a0a0c`).
- Tracked masters it emits, consumed by the build:
  - `apps/app/public/brand/app-icon.png` — dark mark; `run-mobile-build.mjs`
    flattens it onto `web.iconBackgroundColor` for iOS/Android launcher icons.
  - `apps/app/public/launch-bg.png` — gold splash master (mobile launch screens).
  - `apps/app/public/brand/desktop/appIcon.{png,ico,icns,iconset}` — desktop
    icon master; `scripts/sync-desktop-brand-assets.mjs` copies it into the
    Electrobun build before `desktop-build.mjs` (wired into `build:desktop`,
    `dev:desktop`, and the `release-electrobun` build jobs).

To rebrand a fork: change `app.config.ts`, point `BRAND_MARK` at a new mark, set
`BRAND_BG`/`BRAND_INK`, and re-run the generator.

## What's whitelabeled

- **Icons/splashes** — all native + desktop icons and splashes render the Milady
  mark on gold (was the elizaOS orange face / "Eliza" mascot / blue placeholder).
- **Theme** — `brand-gold.css` accent + first-run tokens are gold (no orange).
- **Home screen** — `MiladyHomeScreen` (`apps/app/src/`) overrides the stock home
  via the `homeScreen` boot-config slot: the elizaOS layout, gold, with a wallet
  widget beside the clock (live portfolio + address → taps to the wallet view).
- **Names** — first-screen wordmarks (StartupShell, CompactOnboarding,
  ChatSurface, en.json) resolve from `branding.appName` (`{{appName}}`), so any
  fork rebrands by setting `app.config.ts`. "Eliza Cloud" / "Eliza-1" are kept
  (real external service / model names).
- **Release artifacts** — `release-electrobun` produces `Milady-Setup-*.exe` +
  Milady bundle id / updater archives; `android-release` ships `Milady-*.aab` to
  Play `ai.milady.app`; `apple-store-release` ships `Milady-*-mas.pkg`.

## elizaOS-side delivery — UPSTREAMED

The generic whitelabel seams (host-overridable `homeScreen` + `brandMark`
boot-config slots, `clockAccessory` on HomeScreen, gold first-run tokens, the
`{{appName}}` naming seam, the config-driven app-icon background) are **merged to
`elizaos/eliza` develop**, not carried as a milady patch. Milady CI releases
clone upstream develop, so they ship automatically — no `apply-eliza-ci-patches`
step required. `docs/whitelabel/eliza-whitelabel.patch` remains as a reference
snapshot only.

The milady side then just injects its brand into those slots from
`apps/app/src/main.tsx`: `homeScreen: MiladyHomeScreen`, `brandMark: MiladyMark`,
`branding.appName: "Milady"`, `web.iconBackgroundColor: "#f0b90b"`.

### npm-stub vs clone typecheck note

Milady builds against the local `eliza/` clone (via Vite aliases) but its pinned
npm `@elizaos/*` is `alpha.537`, which lags develop. Symbols newer than alpha.537
(e.g. `@elizaos/ui/App` after the app-shell refactor, the home/brand slots) are
declared in `apps/app/src/elizaos-app-core-shim.d.ts` so packages-mode typecheck
stays green; the real implementations come from the clone at build time. Drop the
matching shim entries once milady bumps `@elizaos/*` to a build that includes them.

## Known follow-ups

- iOS bundle id unified to `ai.milady.app` everywhere (app.config →
  run-mobile-build derives the iOS bundle, app group, extension ids, fastlane id,
  and android package). Confirm no live App Store / Play listing used the old id.
- iOS IPA internal filename is still `Eliza.ipa` (the eliza Fastfile
  `output_name`); the release workflow now collects `build/*.ipa` so any name is
  uploaded, but rename the Fastfile output for full polish.
- Broader `en.json` long-tail (non-first-screen "elizaOS"/"Eliza" strings).
- Verify the release pipeline end-to-end on CI (desktop/mobile/store builds were
  not runnable locally).
