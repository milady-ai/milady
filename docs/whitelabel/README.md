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

## elizaOS-side delivery (IMPORTANT)

Several whitelabel changes live in `@elizaos/ui` / `@elizaos/app-core` (the home
slot, gold theme, appName wordmarks, config-driven icon background). They are
committed to the **local** `eliza/` clone (so local dev/build wear them) and
captured in **`docs/whitelabel/eliza-whitelabel.patch`**.

Milady CI releases clone **fresh upstream elizaOS** at a pinned ref, so those
changes are NOT in a release build until they are either upstreamed to elizaOS or
applied as a milady eliza-patch (the `scripts/apply-eliza-ci-patches.mjs`
mechanism). **Productionizing this patch is the remaining step** for the home
screen / theme / naming to appear in shipped builds. (Note: upstream has since
added an `ElizaMark` brand component; the patch may need a rebase against current
elizaOS before it applies cleanly.)

## Known follow-ups

- Apply/rebase `eliza-whitelabel.patch` into the milady eliza-patch pipeline.
- iOS bundle id is `ai.milady.app` (pbxproj) vs `ai.milady.app`
  elsewhere — reconcile (App Store identity decision).
- iOS IPA artifact name is `Eliza.ipa` (from the fastlane scheme) — rename the
  iOS scheme/Fastfile output.
- Broader `en.json` long-tail (non-first-screen "elizaOS"/"Eliza" strings).
- Verify the release pipeline end-to-end on CI (desktop/mobile/store builds were
  not runnable locally).
