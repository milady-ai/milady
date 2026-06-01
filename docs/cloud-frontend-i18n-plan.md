# cloud-frontend i18n setup plan

Target package: `eliza/packages/cloud-frontend` (Eliza Cloud web dashboard).
Source modes: Vite 8 + React 19 + react-router-dom 7 + react-helmet-async + Vite SSR via `entry-server.tsx` + a build-time prerender of `/` only.
Test runners: `vitest` (unit/component, headless jsdom) and Playwright (`tests/e2e/*.spec.ts`).
Companion audit: see [cloud-frontend-i18n-audit.md](./cloud-frontend-i18n-audit.md) for the per-file string inventory and brand-leakage hotspots that drive the migration order in this document.

## 1. Recommendation: reuse the desktop `t()` system, not `react-i18next`

The repo already ships a working, lightweight i18n in `@elizaos/ui`:

- Public surface: `t(lang, key, vars?)`, `createTranslator(lang)`, `normalizeLanguage`, `ensureLanguageLoaded(lang)`, `UI_LANGUAGES`, `UiLanguage`, `MESSAGES` — exported from `eliza/packages/ui/src/i18n/index.ts` and re-exported via `@elizaos/ui` (`packages/ui/src/index.ts:404-406` and `browser.ts:137`).
- Storage: flat `{ key: value }` JSON dictionaries with `{{var}}` interpolation, one file per locale under `eliza/packages/ui/src/i18n/locales/<lang>.json`.
- Lazy loading: only `en.json` is bundled eagerly (already part of `@elizaos/ui`). `zh-CN`, `ko`, `es`, `pt`, `vi`, `tl`, `ja` are dynamic-imported on first use via `ensureLanguageLoaded`. The desktop dictionary is currently ~1.5 MB raw / ~340 KB gzip and is already split out of the main chunk.
- Existing 8-locale set already matches the requirement: `en`, `zh-CN`, `ko`, `es`, `pt`, `vi`, `tl`, `ja`.
- Cloud-frontend already depends on `@elizaos/ui` as a workspace package — no new dependency, no new bundle weight beyond the dictionaries themselves.

`react-i18next` would add ~40 KB gzip of runtime, force a `<I18nextProvider>` boundary above the entire tree (including the SSR `entry-server.tsx`), and introduce a second key-namespace convention that diverges from the desktop. None of its bigger features (plurals, ICU MessageFormat, namespaces, suspense, backend connectors) buy us anything here — every string is a short label and the existing flat-key format covers the only interpolation pattern that occurs in practice (`{{appName}}`, `{{count}}`, etc.).

Decision: reuse `@elizaos/ui`'s `t()` and locale files. Use a cloud-frontend–local namespace prefix (`cloud.*`) so cloud strings live in the same JSON files as desktop strings without colliding. The desktop already uses prefixes like `onboarding.setup.*`, `appsview.*`, `runtimegate.*` — adding `cloud.*` is a no-op for the linter at `eliza/packages/{app-core,scripts}/check-i18n.mjs`.

Rejected alternatives:

- `react-i18next` / `i18next` — extra runtime, extra abstractions, no benefit over `t()`.
- `react-intl` / FormatJS — heavier, ICU-first; we don't need plurals/genders for any current string. Defer until a real pluralization use case appears.
- LinguiJS — same as above, plus a babel/swc pipeline we'd have to wire into Vite.
- A new cloud-frontend–only flat-key system — duplicates desktop work, drops the existing lazy-load + linter wiring, and would require triple-maintaining translations.

## 2. Locale file location

Single source of truth: `eliza/packages/ui/src/i18n/locales/<lang>.json` (already exists, 3375 English keys).

Cloud-frontend keys live under the prefix `cloud.*`:

- `cloud.landing.hero.title`
- `cloud.dashboard.sidebar.apps`
- `cloud.billing.payAsYouGoCard.headline`
- `cloud.admin.infrastructure.dockerNodes`
- `cloud.toast.copyClipboard.success`
- `cloud.errors.savefailed`
- `cloud.meta.dashboard.title`
- `cloud.meta.dashboard.description`

The keys are scoped by route/component path mirroring the source layout (`pages/`, `dashboard/<area>/`, `components/<area>/`). This matches the existing desktop convention (`onboarding.setup.*` ↔ `eliza/packages/ui/src/components/onboarding/states/StateSetup.tsx`).

No new directory under `cloud-frontend/`. No JSON files inside `cloud-frontend/src/`. Cloud-frontend imports from `@elizaos/ui` only.

If cloud-frontend ever needs to ship strings that should not bloat the desktop dictionary (e.g. very long marketing/legal copy on `/terms-of-service` and `/privacy-policy`), introduce a second dictionary `cloud-frontend/src/i18n/locales/<lang>.json` and a thin local wrapper `createTranslator(lang, { fallbackTo: t })`. **Defer this until the desktop dict actually has measurable size pressure** — the legal-page text alone is ~300 keys per language and roughly +30 KB raw / +6 KB gzip, which is acceptable inside the existing lazy-loaded shard.

## 3. Language detection and switching

Web has no Electrobun shell to feed `UiLanguage` from native; cloud-frontend must resolve it itself.

Resolution order (highest priority first):

1. URL `?lang=<code>` query — overrides everything for the current request. Useful for support/QA and for the Playwright e2e fixtures.
2. Persisted user preference: `localStorage.getItem("cloud.lang")`.
3. Account-level preference returned by `/api/v1/users/me` once the Steward session resolves. When the API value differs from `localStorage`, write the API value through and re-render.
4. `navigator.languages[0]` / `navigator.language` (browser hint).
5. `Accept-Language` header (only meaningful in SSR / prerender — see §4).
6. Fallback: `DEFAULT_UI_LANGUAGE` (`"en"`).

All input goes through `normalizeLanguage(input)` (already in `@elizaos/ui`) which maps regional variants (`en-GB` → `en`, `pt-BR` → `pt`, `zh-Hans-*` → `zh-CN`, `fil` → `tl`, etc.) and returns `"en"` for anything it can't map.

Provider:

```tsx
// new file: src/providers/I18nProvider.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createTranslator, ensureLanguageLoaded, normalizeLanguage,
         type UiLanguage } from "@elizaos/ui";

const I18nContext = createContext<{
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  t: ReturnType<typeof createTranslator>;
}>(null!);

export function I18nProvider({ initialLang, children }: { initialLang: UiLanguage; children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(initialLang);
  useEffect(() => { void ensureLanguageLoaded(lang); }, [lang]);
  const setLang = (next: UiLanguage) => {
    const n = normalizeLanguage(next);
    localStorage.setItem("cloud.lang", n);
    setLangState(n);
    void ensureLanguageLoaded(n);
  };
  const t = useMemo(() => createTranslator(lang), [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useT() { return useContext(I18nContext); }
```

Mount in `RootLayout.tsx` immediately below `ThemeProvider` and above `<Outlet />`. `main.tsx` resolves `initialLang` synchronously from `localStorage` / `navigator.language` (with `?lang` taking priority) before React mounts so first paint matches the persisted preference.

Switcher: there is already a `LanguageDropdown` in `@elizaos/ui` (`packages/ui/src/components/shared/LanguageDropdown.tsx`) used by the desktop shell. Reuse it in the cloud dashboard header. Wire its `onChange` to `setLang` from the new provider.

## 4. SSR / prerender behavior

`entry-server.tsx` only renders `/` (the landing). `scripts/prerender.mjs` splices the rendered HTML into `dist/index.html`.

Constraints:

- Prerender runs at build time with no per-request `Accept-Language`. Output one English snapshot — that's the worst case anyway, since hydration replaces the SSR tree if the persisted client language is non-`en`.
- The build-time `render()` call must use `lang="en"` and pull strings from the synchronous English dict that's already eagerly bundled (`MESSAGES.en`). Wrap the SSR tree in `<I18nProvider initialLang="en">` exactly the same way the client wraps it.
- `<Helmet><html lang="en" /></Helmet>` in `RootLayout.tsx` is currently hardcoded English. Change it to read `lang` from the provider so client navigations update `<html lang>` after hydration. The prerender output stays `en` (correct — the static HTML really is English).
- `main.tsx` already detects prerender mismatch via `rootEl.dataset.prerenderMismatch` and falls back to `createRoot`. Add a check: if the client-resolved language is non-`en`, set `prerenderMismatch="true"` so React skips hydration and does a clean render. This avoids React hydration warnings when the persisted language is, say, `ja`.

There is no per-route prerender today, so OG/Twitter meta only matters on `/`. The English copy in `RootLayout.tsx`'s Helmet is fine for the prerender; switch the runtime `<meta>` content to `t()` after hydration.

## 5. Effort estimate

From the audit (`docs/cloud-frontend-i18n-audit.md`):

- **~2,133 user-visible strings** detected by the per-file scan across **188 files**. (Scan: `find … *.tsx *.ts` + Python AST-light regex extractor; see audit §A for methodology and per-file counts.)
- The legal pages (`/terms-of-service`, `/privacy-policy`) contribute ~300 of those as full paragraphs that machine translation handles cheaply but human review is still mandatory for.
- 8 locales × ~2,133 strings = ~17,064 translated strings to land in the locale JSON files.
- Existing English dictionary already has 3,375 keys; adding `cloud.*` brings it to ~5,500 keys (no key duplicated across desktop and cloud).
- Per-language file gzip estimate: +4–7 KB after compression (Cloud strings are short and repetitive; legal pages are the only chunky entries).

Translation cost (rough, machine-translation + human review):

| Stage | Effort |
|---|---|
| Extract → flat keys, en.json populated | 4–6 engineer-days |
| Wire `I18nProvider`, language dropdown, SSR | 0.5 engineer-day |
| Machine-translate 7 non-en locales | hours of API time; ~$30–80 in API cost depending on provider |
| Human review per locale (skim, fix CJK-specific layout issues, fix domain terms) | 0.5–1 day per locale × 7 = 4–7 reviewer-days |

Total realistic timeline: **2–3 weeks** to land all 8 locales with reviewed translations.

## 6. Step-by-step integration plan

The goal is to land the i18n plumbing in one self-contained PR, then migrate strings area-by-area in follow-up PRs. Each step keeps `bun run --cwd packages/cloud-frontend test` green and does not change runtime behavior.

### Phase 0 — plumbing (one PR, no string migration)

1. Add `src/providers/I18nProvider.tsx` as in §3.
2. Add `src/lib/i18n/resolve-initial-lang.ts` — synchronous resolver that returns a `UiLanguage` from `URLSearchParams`, `localStorage`, `navigator.language`, falling through to `"en"`.
3. Wrap `RootLayout.tsx`'s tree with `<I18nProvider initialLang={...}>` between `ThemeProvider` and `<Outlet />`.
4. Update `RootLayout.tsx` `<Helmet><html lang={lang} /></Helmet>` to consume the context.
5. Wrap `entry-server.tsx`'s SSR tree with `<I18nProvider initialLang="en">`.
6. Update `main.tsx` to mark a prerender-mismatch when the resolved client language is non-`en` (forces `createRoot` instead of `hydrateRoot`).
7. Add a `LanguageDropdown` to `components/layout/header.tsx` (dashboard) and `components/layout/landing-header.tsx` (public). Wire to `useT().setLang`.
8. Verify `bun run --cwd packages/cloud-frontend test` and `bun run --cwd packages/cloud-frontend typecheck`. No strings change — all existing tests pass unchanged.

### Phase 1 — meta + brand strings (one PR)

Migrate strings that touch SEO and brand surfaces, because they're the highest impact and have the lowest risk of layout regression:

- `RootLayout.tsx` — title, description, OG / Twitter meta. Key prefix `cloud.meta.root.*`.
- `dashboard/Page.tsx`, `dashboard/chat-redirect.tsx`, all dashboard `Page.tsx` files with `<title>` (30 files, ~70 strings total — see audit §C).
- `pages/login/layout.tsx`, `pages/checkout/page.tsx`, `pages/chat/[characterRef]/page.tsx`, `docs/DocsRouter.tsx` — `<title>` + `<meta description>`.
- Three Helmet-only landing page strings.

Test impact: Playwright `brand-flows.spec.ts:42` asserts `page.getByText("elizaOS checkout")`. That text comes from a mocked external URL, not cloud-frontend, so unaffected. The test at line 27 asserts `/sign in/i` regex match on `<h1>` — covered by translating `cloud.login.signIn`.

### Phase 2 — landing + auth (one PR)

- `components/landing/hero-section.tsx`, `components/landing/Footer.tsx`, `components/layout/landing-header.tsx`.
- All `pages/auth/**/*.tsx`, `pages/login/**/*.tsx`, `pages/app-auth/**/*.tsx`.
- `pages/invite/accept/**`, `pages/sensitive-requests/**`, `pages/approve/**`, `pages/ballot/**`.

Test impact: `tests/e2e/brand-flows.spec.ts:16-26` and `auth-local-cloud.spec.ts` rely on `/launch eliza/i` regex matching. Keep the English string exactly `"Launch Eliza"` (it's also the brand call-to-action) — translation only affects non-`en` runs, and Playwright tests default to `en`.

### Phase 3 — dashboard chrome (one PR)

- `components/layout/sidebar-data.ts` — convert `label: "Dashboard"` etc. to `labelKey: "cloud.sidebar.dashboard"`. Resolve in `sidebar-section.tsx` / `sidebar-item.tsx` via `useT()`.
- `components/layout/header.tsx`, `components/layout/user-menu.tsx`, `components/layout/sidebar.tsx`, `components/layout/sidebar-bottom-panel.tsx`, `components/layout/feedback-modal.tsx`, `components/layout/header-invite-button.tsx`, `components/layout/dashboard-shell.tsx`.
- `dashboard/DashboardLayout.tsx`.

### Phase 4 — feature areas, one PR per area

Order driven by user-visibility × file count (see audit §D), from highest to lowest leverage:

1. Settings + connectors (`dashboard/settings/_components/**`) — 14 files, ~370 strings. Largest single area. Each connector (`discord-gateway-connection.tsx`, `blooio-connection.tsx`, `whatsapp-connection.tsx`, `twilio-connection.tsx`, `telegram-connection.tsx`, `google-connection.tsx`, `microsoft-connection.tsx`) is independent and can land as a separate sub-PR.
2. Admin (`dashboard/admin/**`) — 9 files, ~370 strings. The heaviest single file (`infrastructure-dashboard.tsx`, ~125 strings) lives here. Split into infrastructure / redemptions / metrics sub-PRs.
3. Apps + monetization (`dashboard/apps/**`, `dashboard/earnings/**`, `dashboard/affiliates/**`, `dashboard/invoices/**`) — 23 files, ~310 strings.
4. Containers (`dashboard/containers/**`) — 16 files, ~165 strings.
5. Billing + account + API keys (`dashboard/billing/**`, `dashboard/account/**`, `dashboard/api-keys/**`, `dashboard/api-explorer/**`) — 21 files, ~220 strings.
6. Chat + agents + my-agents + documents + MCPs (`components/chat/**`, `components/agents/**`, `components/my-agents/**`, `dashboard/agents/**`, `dashboard/my-agents/**`, `dashboard/documents/**`, `dashboard/mcps/**`) — 26 files, ~260 strings.
7. Analytics (`dashboard/analytics/**`) — 8 files, ~30 strings.
8. Legal copy (`pages/terms-of-service/page.tsx`, `pages/privacy-policy/page.tsx`) — 2 files, ~80 paragraph-keys. Last, because legal copy needs human-translator review (not machine translation alone).
9. Misc leftovers: `lib/error-message.ts` (if any hardcoded), `hooks/use-streaming-message.ts`, `providers/CreditsProvider.tsx`, `pages/bsc/page.tsx`.

### Phase 5 — docs MDX

`content/*.mdx` (44 files, ~10,350 lines) are documentation pages, not UI strings. Defer them out of scope for the first cut. When ready, the right approach is per-locale MDX directories (`content/<lang>/foo.mdx`) and a `useT().lang`-aware loader in `docs/nav.ts` — _not_ flat-key extraction. Track separately.

## 7. Keeping the test suite green

The cloud-frontend test suite is small (one component test, one render-telemetry test, one steward-login-section test) and a Playwright e2e suite of 10 files.

Vitest unit tests run on jsdom. They never see `localStorage` content from anywhere, and `navigator.language` defaults to `"en-US"`. With the resolver above, jsdom tests will resolve to `"en"` and pull strings from the eagerly-loaded English dict — same strings as today. No test changes required for Phase 0.

When migrating individual strings in Phases 1–5, the rule is: **the English value in the JSON file must be byte-identical to the previous hardcoded English value.** That keeps Playwright `getByText`/`getByRole({ name })` assertions stable and unit tests stable. Verify with `bun run --cwd packages/cloud-frontend test && bun run --cwd packages/cloud-frontend test:e2e` after each phase.

Two e2e tests do regex-match brand text:

- `brand-flows.spec.ts:23` — `/launch eliza/i` → keep `cloud.landing.cta.launchEliza` English value `"Launch Eliza"`.
- `brand-flows.spec.ts:27` — `/sign in/i` matched against `<h1>` → keep `cloud.login.signIn` English value `"Sign in"`.

Both are already exact matches for current copy; nothing to change.

Add a single new test: `src/providers/I18nProvider.test.tsx` exercising `resolve-initial-lang` priority and `setLang` → `localStorage` round-trip. ~5 cases, ~80 LOC.

Add a Playwright case: `tests/e2e/i18n.spec.ts` visiting `/?lang=ja` and asserting the dashboard header contains a Japanese string (after Phase 3 lands).

## 8. Linter wiring

The repo already has `eliza/packages/{app-core,scripts}/check-i18n.mjs` and the root `bun run verify:i18n`. The linter walks `eliza/packages/ui/src/i18n/locales/*.json` and reports keys missing from non-`en` files. Because cloud-frontend keys live under `cloud.*` in the same files, the linter picks them up automatically — no config change. Run `bun run verify:i18n` at the end of every phase and after each new translation batch.

## 9. Out of scope for this pass

- MDX docs translation (Phase 5 only sketched).
- Server-side `cloud-shared` strings (Stripe descriptions, email templates) — covered by `docs/whitelabel-i18n-roadmap.md` under "P0 — Eliza Cloud strings (cross-brand display)". A separate `CLOUD_BRAND` singleton in `cloud-shared` is the right vehicle there, not `t()`.
- Date / number / currency formatting — already handled correctly by `date-fns` and `Intl.NumberFormat` in cloud-frontend. The locale tag passed to `Intl` should be derived from `useT().lang` once the provider lands, but the existing `"en-US"` literals in `dashboard/analytics/_components/usage-chart.tsx` work as a baseline.
- Right-to-left layout — none of the 8 supported locales are RTL.
- Pluralization — no current string requires plural forms beyond simple `{{count}}` interpolation, which `t()` already supports via the `vars` arg.
