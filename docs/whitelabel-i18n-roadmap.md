# Whitelabel + i18n Roadmap

Status snapshot from a full audit of every brand-touching surface (desktop, homepage, AOSP, Linux build, Cloud) and i18n coverage across all 8 supported locales.

## Supported locales

`en`, `zh-CN`, `ko`, `es`, `pt`, `vi`, `tl`, **`ja`** (new — added in this audit).

Registry: `eliza/packages/ui/src/i18n/messages.ts` (`UI_LANGUAGES`), `eliza/packages/ui/src/components/shared/LanguageDropdown.tsx` (`LANGUAGES`), `eliza/packages/ui/src/i18n/index.ts` (`normalizeLanguage`).

## What's done

- **i18n linter** — `eliza/packages/{app-core/scripts,scripts}/check-i18n.mjs` `LOCALE_DIR` corrected from `packages/app-core/src/i18n/locales` (non-existent) to `packages/ui/src/i18n/locales`. `bun run verify:i18n` now actually runs.
- **17 missing keys** filled in `es`, `ko`, `pt`, `tl`, `vi`, `zh-CN` (`finetuningview.*` + `settings.sections.*`).
- **Japanese (`ja`) added** — `UI_LANGUAGES`, `MESSAGES`, lazy loader, dropdown entry, `normalizeLanguage` mapping. `ja.json` seeded with onboarding + finetuning + startup-shell keys; full 3309-key translation produced separately and merged.
- **StateSetup onboarding** — "Setup Your Eliza" / "Where should Eliza run?" replaced by `t("onboarding.setup.setupYourApp" | "onboarding.setup.whereShouldRun", appNameInterpolationVars(branding))`. Translations added in all 8 locales.
- **cloud-services-common test** — `bun test` (which fails on empty test set) replaced with `echo 'no tests'` to match workspace convention used by `checkout-shared`, `hardware-catalog`, `shared-brand`.

## Remaining work — ranked

### P0 — user-visible brand leakage (one-PR-each is reasonable)

| Surface | File | Change |
|---|---|---|
| Welcome splash | `eliza/packages/ui/src/components/shell/RuntimeGate.tsx:2156–2178` | `runtimegate.welcome{Eyebrow,Title,Subtitle}` translation values are hardcoded "elizaOS", "Welcome to Eliza", "Eliza Cloud". Convert to `{{appName}}` + `{{cloudServiceName}}` placeholders. Add `cloudServiceName` to `BrandingConfig`. |
| AOSP splash | `RuntimeGate.tsx:1400` `<ElizaOSLocalSplash>` | Background color `#ffe600` and component name are eliza-only. Rename to `<BrandLocalSplash>` reading `branding.splashBackground` from theme tokens. |
| System prompt | `eliza/packages/ui/src/state/useOnboardingCallbacks.ts:552,614` | Fallback `"…an autonomous AI agent powered by elizaOS."` baked into every new agent's character file. Drop framework attribution or gate on `branding.frameworkAttribution`. |
| Cloud label | `eliza/packages/ui/src/components/settings/ProviderPanels.tsx:141` | `title="Eliza Cloud"` → `branding.cloudServiceName`. |
| Discord copy | `eliza/packages/ui/src/components/connectors/ConnectorModeSelector.tsx:54` | Help text hardcodes "Eliza Cloud Discord gateway". |
| Local model copy | `eliza/packages/ui/src/components/local-inference/LocalInferencePanel.tsx:420` | Tooltip `"Eliza can load these models…"`. |
| Aria labels | `ChatSurface.tsx:66` ("Eliza is typing"), `AssistantOverlay.tsx:114` ("Eliza assistant") | Use `{{appName}}`. |

### P0 — AOSP / Android cross-brand contamination

`os/android/vendor/milady/milady_common.mk`:

- Line 19–20: `PRODUCT_BRAND := Milady` / `PRODUCT_MANUFACTURER := Milady` — must read from `os/android/brand.<brand>.json` (currently only Milady has a brand file).
- Line 23: `PRODUCT_PACKAGES += Milady` — `:= $(BRAND_APP_NAME)`.
- Line 24–25: Permission XML filenames hardcoded to `default-permissions-ai.milady.milady.xml`.
- Line 63: `ro.miladyos.home=ai.milady.milady` — should use `$(BRAND_PACKAGE_NAME)`.
- **Line 64 (worst): `ro.elizaos.product=$(MILADY_PRODUCT_TAG)`** — cross-brand contamination. Any AOSP build will advertise `ro.elizaos.product` even if it's a non-eliza brand. Either gate by brand or rename to `ro.$(BRAND_DISTRO_NAME)os.product`.
- Line 72: init.rc path `vendor/milady/init/init.milady.rc` — needs `$(BRAND_VENDOR_DIR)` / `$(BRAND_INIT_RC_NAME)`.

Plus `os/android/vendor/milady/overlays/frameworks/base/core/res/res/values/config.xml:11–14` — default role packages hardcoded to `ai.milady.milady`. Generate from brand template.

### P0 — Linux packaging metadata

All of these hardcode `elizaos-app` / `ai.elizaos.App`:

- `eliza/packages/app-core/packaging/flatpak/ai.elizaos.App.{desktop,yml,metainfo.xml}`
- `eliza/packages/app-core/packaging/snap/snapcraft.yaml`
- `eliza/packages/app-core/packaging/msix/AppxManifest.xml`
- `eliza/packages/app-core/packaging/debian/control`
- `eliza/packages/app-core/packaging/homebrew/elizaos-app.rb`

`eliza/packages/app-core/platforms/electrobun/src/brand-config.ts:102–126` has the env-var-driven brand override mechanism, but these packaging templates aren't wired through it. Add a build-time template-rendering step that substitutes `{{appName}}`, `{{appId}}`, `{{urlScheme}}`, `{{namespace}}` from the same `ELIZA_*` env vars.

`eliza/packages/os/linux/variants/milady-tails/tails/config/chroot_local-includes/usr/share/applications/milady.desktop:3` — `Name=elizaOS` (clearly wrong for the milady-tails variant).

### P0 — Eliza Cloud strings (cross-brand display)

Cloud is itself named "Eliza Cloud" by design, but **client apps** (milady, future brands) should not surface "Eliza Cloud" verbatim in their UI.

- `eliza/packages/cloud-shared/src/lib/services/email.ts` lines 34, 135, 171 — sender email `noreply@elizacloud.ai` and welcome subject hardcoded.
- `eliza/packages/cloud-shared/src/lib/seo/constants.ts` — every page title prefix.
- `eliza/packages/cloud-shared/src/lib/services/topup-handler.ts` — Stripe product description `"Eliza Cloud Credits"`.
- `eliza/packages/cloud-shared/src/lib/email/utils/template-renderer.ts` — `© ${year} Eliza Cloud` footer.
- `eliza/packages/cloud-shared/src/lib/services/eliza-managed-launch.ts` — default agent bio + system prompt hardcoded.
- `eliza/packages/cloud-frontend/src/RootLayout.tsx`, `dashboard/Page.tsx`, `dashboard/chat-redirect.tsx` — page titles + OG meta.

Strategy: introduce a `CLOUD_BRAND` singleton in `cloud-shared` populated from `NEXT_PUBLIC_CLOUD_NAME` / `CLOUD_DOMAIN` / `CLOUD_SUPPORT_EMAIL` env vars, default to Eliza Cloud values.

### P1 — Homepage

`apps/homepage/index.html:19,22`, `apps/homepage/public/site.webmanifest:2-3`, `apps/homepage/src/App.tsx:32-34`, `apps/homepage/src/components/dashboard/BrandHero.tsx:27,55,73,99`, plus help text in `ConnectionModal.tsx` and `InstanceGrid.tsx`. Pull from `@elizaos/shared-brand` like `eliza/packages/homepage` already does.

### P1 — i18n coverage gaps (linter passes after this)

`bun run verify:i18n` currently reports:

- 61 keys used in source via `t("…", { defaultValue: "…" })` but **missing from every locale file** (en.json included). Extract the `defaultValue` from each call site → en.json → translate to all 7 other locales.
- 2 unused keys in en.json (`pairingcommandhint.{defaultPortHint,refreshHint}`) — confirm dead and delete from all 8 locales.

Affected source files (61 keys total):

- `RuntimeSettingsSection.tsx` — 18 keys (`settings.runtime.*`)
- `AddAccountDialog.tsx` — 11 keys (`accounts.{add,provider}.*`)
- `RuntimeGate.tsx` — 4 keys (`runtimegate.cloud*`)
- `PermissionsSection.tsx`, `SubscriptionStatus.tsx`, `SignalQrOverlay.tsx`, `BrowserWorkspaceView.tsx`, `AccountCard.tsx`, `ReleaseCenterView.tsx`, et al — remaining 28 keys.

### P1 — i18n linter wired into `verify`

`verify:i18n` is currently a separate script, not part of `bun run verify`. After P1 i18n cleanup, add it to the verify chain so future drift is caught at PR time.

### P2 — Onboarding language codes

`eliza/packages/ui/src/components/onboarding/states/StateSetup.tsx:17-22` uses region-specific codes (`en-US`, `es-ES`, `ja-JP`, `ko-KR`) while the rest of the codebase uses region-less codes. `normalizeLanguage` already handles the conversion, but the dropdown should be aligned (one source of truth). Either expand StateSetup's list to all 8 supported locales, or have it consume `UI_LANGUAGES` directly.

### P2 — Plugin-lifeops locale drift

`eliza/plugins/plugin-lifeops/src/lifeops/i18n/prompt-registry.ts` declares `PromptLocale = "en" | "es" | "fr" | "ja"` — includes `fr` (not supported elsewhere) and is missing `ko`, `pt`, `tl`, `vi`, `zh-CN`. Either drop `fr` and align with the main `UI_LANGUAGES` set, or add the missing locale prompt examples.

### P3 — Hardcoded English in components (i18n misses, not brand leaks)

`StateSetup.tsx` still has hardcoded English for the "Cloud" / "Recommended" / "Sign in and start talking." / "On-Device" / "Run on this device." / "Continue" / "Connect to a remote instance" strings. Template literals like `Imported "${result.filename}" …` in `DocumentsView.tsx`, `Delete "${entry.label}"?` in `VaultInventoryPanel.tsx`, etc. — these need keys and translations.

## Brand override architecture

The audit identifies that the existing system has good bones but isn't fully consumed:

- **`@elizaos/brand`** — exports asset paths. Hardcoded to elizaOS variants today.
- **`@elizaos/shared-brand`** — canonical brand tokens. Has `BRAND_COLORS`, `LOGO_FILES`. The homepage in `eliza/packages/homepage/marketing.tsx` consumes it; the milady homepage does not.
- **`eliza/packages/ui/src/config/branding`** — `BrandingConfig`, `useBranding()`, `appNameInterpolationVars()`. Components like `ProviderRoutingPanel`, `useProviderSelection`, `GameView`, `StartupFailureView`, `BugReportModal`, `PairingView`, `ReleaseCenterView` already consume it. **The leakage list above is mostly components that should but don't.**
- **Build-time env** — `ELIZA_APP_NAME`, `ELIZA_APP_ID`, `ELIZA_URL_SCHEME`, `ELIZA_NAMESPACE` set in milady's `build:desktop` script and read by Electrobun's `brand-config.ts`. Works for window/bundle metadata; not propagated to React UI text.

**Recommended pattern for new fixes:** `t("namespace.key", appNameInterpolationVars(useBranding()))` in any component that today renders a hardcoded "Eliza" string. Add `cloudServiceName: string` to `BrandingConfig` to handle the "Eliza Cloud" cases.
