# cloud-frontend i18n audit

Snapshot of every user-visible English string under `eliza/packages/cloud-frontend/src/`. No code changes in this pass — this is the input to [cloud-frontend-i18n-plan.md](./cloud-frontend-i18n-plan.md).

## A. Inventory methodology

- Walked every `*.tsx` / `*.ts` file under `eliza/packages/cloud-frontend/src/` excluding `*.test.*`, `*.spec.*`, `*.d.ts`. Total source files: 233.
- For each file, counted strings that look user-facing:
  - JSX text content (regex `>([A-Za-z][^<>{}]{2,})<` across any context, after stripping `import` statements, block + line comments, and noise attributes like `className`, `href`, `src`, `id`, `type`, `name`, `role`, `property`, `data-*`).
  - Double-quoted strings starting with a capital and containing ≥3 letters/punctuation (matches `placeholder=`, `title=`, `aria-label=`, `description=`, `toast.error("Something failed")`, etc., minus identifier-shaped CamelCase tokens).
  - Backtick template literals containing at least one space and one alphabetic word.
- Heuristic floor: ~**2,133 strings across 188 files**. The actual number is higher because the regex misses inline JSX text broken across many lines (large `<p>…multiple lines…</p>` blocks count once instead of one-per-paragraph). Treat 2,133 as a lower bound for translation work; the realistic working estimate is **2,200–2,500 unique English source strings**, or roughly **17,000–20,000 translated strings across all 8 locales**.
- Brand-mention scan: `rg 'Eliza Cloud|elizaOS'` across the same tree, 96 matches (63 "Eliza Cloud", 34 "elizaOS").
- Toast-call audit: 299 `toast.{success,error,info,warning,loading}` invocations across the dashboard. Sample of duplicated copy is reported in §F.

Cloud-frontend does **not** currently use any i18n framework. There is no `react-i18next`, no `i18next`, no `@elizaos/ui` `t()` call inside `src/`. Every string is a JS/JSX literal.

## B. Architecture context

- Vite 8 + React 19, lazy-loaded routes via `lazyWithPreload` (`App.tsx`). 60+ route components, all SPA-rendered.
- `entry-server.tsx` does SSR for `/` only; `scripts/prerender.mjs` splices that HTML into `dist/index.html`. Other routes ship as a hydration shell.
- `react-helmet-async` is the single source of truth for `<html lang>`, `<title>`, OG/Twitter meta. Currently every Helmet block is hardcoded English. 13 `<meta name="description">` / `<meta property="og:*">` tags need translation.
- 35 `<title>` tags across pages and the docs router.
- 299 toast invocations sourced from `sonner`.

## C. Top 50 files by user-visible string count

`strings` = number of detected user-visible strings (lower bound). `lines` = file size.

| strings | lines | path (under `eliza/packages/cloud-frontend/src/`) |
|---:|---:|---|
| 125 | 3131 | `dashboard/admin/_components/infrastructure-dashboard.tsx` |
|  66 |  882 | `dashboard/settings/_components/discord-gateway-connection.tsx` |
|  54 | 2196 | `components/chat/eliza-chat-interface.tsx` |
|  48 |  720 | `dashboard/admin/Page.tsx` |
|  48 |  715 | `dashboard/admin/_components/redemptions-client.tsx` |
|  45 |  549 | `dashboard/api-keys/_components/api-keys-page-client.tsx` |
|  44 |  335 | `dashboard/settings/_components/blooio-connection.tsx` |
|  40 |  332 | `dashboard/settings/_components/whatsapp-connection.tsx` |
|  40 |  297 | `dashboard/settings/_components/microsoft-connection.tsx` |
|  39 | 1208 | `dashboard/api-explorer/_components/api-tester.tsx` |
|  38 |  946 | `dashboard/containers/_components/eliza-agents-table.tsx` |
|  35 |  270 | `dashboard/settings/_components/twilio-connection.tsx` |
|  34 |  776 | `dashboard/earnings/_components/earnings-page-client.tsx` |
|  34 |  967 | `dashboard/apps/_components/app-domains.tsx` |
|  33 |  513 | `dashboard/api-explorer/Page.tsx` |
|  31 |  867 | `dashboard/apps/_components/app-analytics.tsx` |
|  31 |  681 | `components/agents/agent-card.tsx` |
|  30 |  449 | `dashboard/affiliates/_components/affiliates-page-client.tsx` |
|  29 |  245 | `dashboard/settings/_components/telegram-connection.tsx` |
|  29 |  720 | `dashboard/account/_components/profile-form.tsx` |
|  28 |  279 | `dashboard/settings/_components/google-connection.tsx` |
|  28 |  139 | `dashboard/mcps/Page.tsx` |
|  26 |  587 | `pages/login/steward-login-section.tsx` |
|  25 |  643 | `dashboard/containers/_components/create-eliza-agent-dialog.tsx` |
|  24 |  547 | `dashboard/apps/_components/app-earnings-dashboard.tsx` |
|  23 |  449 | `dashboard/containers/_components/container-logs-viewer.tsx` |
|  22 |  394 | `pages/sensitive-requests/[requestId]/page.tsx` |
|  22 |  429 | `dashboard/billing/_components/direct-crypto-credit-card.tsx` |
|  22 |  501 | `dashboard/apps/_components/app-overview.tsx` |
|  22 |  458 | `dashboard/apps/_components/app-monetization-settings.tsx` |
|  21 |  674 | `dashboard/settings/_components/tabs/apis-tab.tsx` |
|  20 |  655 | `dashboard/mcps/_components/mcps-section.tsx` |
|  19 |  469 | `dashboard/apps/_components/app-settings.tsx` |
|  18 |  613 | `dashboard/containers/_components/containers-table.tsx` |
|  18 |  413 | `components/my-agents/my-agents.tsx` |
|  17 |  306 | `pages/invite/accept/page.tsx` |
|  17 |  379 | `pages/auth/cli-login/page.tsx` |
|  17 |  348 | `pages/approve/[approvalId]/page.tsx` |
|  17 |  474 | `dashboard/settings/_components/tabs/billing-tab.tsx` |
|  17 |  303 | `dashboard/apps/_components/create-app-dialog.tsx` |
|  17 |  862 | `dashboard/admin/_components/admin-metrics-client.tsx` |
|  16 |  410 | `pages/payment/app-charge/[appId]/[chargeId]/page.tsx` |
|  15 |  340 | `dashboard/documents/_components/document-upload.tsx` |
|  15 |  335 | `dashboard/documents/_components/documents-page-client.tsx` |
|  15 |  221 | `dashboard/billing/_components/auto-top-up-card.tsx` |
|  15 |  453 | `dashboard/agents/[id]/Page.tsx` |
|  14 |  121 | `pages/privacy-policy/page.tsx` |
|  14 |  190 | `lib/api-client.ts` |
|  14 |  435 | `hooks/use-streaming-message.ts` |
|  14 |  424 | `dashboard/settings/_components/tabs/usage-tab.tsx` |

The top 50 cover **~1,445 of the ~2,133 detected strings** (≈ 68 % of the work).

## D. Surface inventory by area

Files grouped by route/feature with cumulative string counts.

| area | files | strings (lower bound) | notes |
|---|---:|---:|---|
| Admin (`dashboard/admin/**`) | 9 | ~370 | Infrastructure dashboard alone is 125 strings; redemptions + metrics another ~95. Admin UI surface is heaviest single area. |
| Settings + connectors (`dashboard/settings/**`) | 18 | ~370 | 7 connector cards (discord, blooio, whatsapp, twilio, telegram, google, microsoft) average 30+ strings each. Mostly form labels, status messages, toast confirmations. |
| Apps (`dashboard/apps/**`) | 13 | ~225 | Multi-tab app dashboard (analytics, domains, earnings, monetization, overview, promote, settings, users) plus create dialog. |
| Containers (`dashboard/containers/**`) | 16 | ~165 | Tables, log viewers, backup panel, agent dialogs. |
| Chat + agents (`components/chat/**`, `components/agents/**`, `dashboard/agents/**`) | 13 | ~140 | Heavy in `eliza-chat-interface.tsx` (2.2k LOC) but most chat copy is dynamic. |
| Containers admin (`dashboard/containers/_components/eliza-*`) | 11 | ~125 | Containers' Eliza-managed-agents sub-area. |
| Auth + payments (`pages/auth/**`, `pages/payment/**`, `pages/sensitive-requests/**`, `pages/approve/**`, `pages/ballot/**`, `pages/login/**`) | 22 | ~130 | Shorter pages each, but lots of helmet titles + form copy. |
| Billing (`dashboard/billing/**`) | 9 | ~80 | Auto top-up, direct crypto card, pay-as-you-go, success page. |
| Earnings + affiliates + invoices (`dashboard/earnings/**`, `dashboard/affiliates/**`, `dashboard/invoices/**`) | 7 | ~75 | Heavy concentration of "elizaOS tokens" copy — flagged below in §E. |
| Account (`dashboard/account/**`) | 5 | ~35 | Profile form is the heaviest. |
| MCPs (`dashboard/mcps/**`) | 3 | ~50 | mcps-section + the page wrapper. |
| API explorer + API keys (`dashboard/api-explorer/**`, `dashboard/api-keys/**`) | 7 | ~95 | Form-heavy. |
| Documents (`dashboard/documents/**`) | 5 | ~40 | Upload + list + query. |
| Analytics (`dashboard/analytics/**`) | 8 | ~30 | Mostly numeric — small string footprint. |
| Layout shell (`components/layout/**`, `dashboard/DashboardLayout.tsx`) | 11 | ~40 | Sidebar items, header buttons, feedback modal. Sidebar labels are a single shared source (`components/layout/sidebar-data.ts`). |
| Landing + marketing (`components/landing/**`, `pages/page.tsx`, `pages/bsc/page.tsx`, `pages/checkout/page.tsx`) | 7 | ~30 | Hero + footer + 1 landing variant. |
| Legal (`pages/terms-of-service/page.tsx`, `pages/privacy-policy/page.tsx`) | 2 | ~80 (paragraph-length keys) | Long legal copy, mandatory human translator review. |
| RootLayout + meta (`RootLayout.tsx`, `dashboard/Page.tsx`, every `Page.tsx` with `<title>`, `docs/DocsRouter.tsx`) | ~35 | ~70 | Helmet titles + meta descriptions + OG/Twitter. Smallest area, highest SEO impact. |
| Hooks / lib (`hooks/**`, `lib/**`, `providers/**`) | 13 | ~40 | Mostly thrown errors and a few toast templates. |

## E. Brand-leakage hotspots

`Eliza Cloud` and `elizaOS` are hardcoded throughout the UI. 96 raw occurrences across 36 files. They fall into three categories:

### E.1 First-party brand chrome (keep, but parametrize)

These references are correct on the cloud-frontend deployment but block whitelabel reuse. Should read from a `CLOUD_BRAND` singleton or `BrandingConfig` (see `docs/whitelabel-i18n-roadmap.md` for the recommended `cloudServiceName` / `appName` knobs). For i18n purposes, treat these as variables and interpolate via `{{cloudServiceName}}` / `{{appName}}`.

| file:line | string |
|---|---|
| `RootLayout.tsx:42` | `<title>Eliza Cloud - Launch Eliza</title>` |
| `RootLayout.tsx:48-67` | OG / Twitter meta — `og:title`, `og:site_name`, `og:image:alt`, `twitter:title` all hardcoded "Eliza Cloud" |
| `dashboard/Page.tsx:54,57,83` | `<title>Eliza Cloud Console</title>`, description, in-page label "elizaOS Platform / Eliza Cloud" |
| `dashboard/chat-redirect.tsx:24,52` | `<title>Chat — Eliza Cloud</title>` (twice — two render paths) |
| `dashboard/mcps/Page.tsx:15,17` | MCP catalog item `name: "Eliza Cloud MCP"`, description |
| `dashboard/apps/[id]/Page.tsx:59` | `\`${app.name} | Eliza Cloud\`` |
| `dashboard/api-keys/Page.tsx:32` | description `"...for elizaOS platform"` |
| `dashboard/containers/Page.tsx:47` | description `"Deploy and manage elizaOS containers."` |
| `dashboard/agents/Page.tsx:51` | description `"...your instances backed by Eliza Cloud."` |
| `dashboard/my-agents/Page.tsx:16` | description `"Administer your running Eliza Cloud agent."` |
| `docs/DocsRouter.tsx:73` | `\`${title} | Eliza Cloud Docs\`` |
| `pages/sensitive-requests/[requestId]/page.tsx:278,314` | `<title>Sensitive Request | Eliza Cloud</title>`, body label "Eliza Cloud" |
| `pages/ballot/[ballotId]/page.tsx:124` | `<title>Ballot | Eliza Cloud</title>` |
| `pages/approve/[approvalId]/page.tsx:194` | `<title>Approval Request | Eliza Cloud</title>` |
| `pages/checkout/page.tsx:107` | `<title>Preorder | Eliza Cloud</title>` |
| `pages/chat/[characterRef]/page.tsx:80-81,117,139` | `\`Chat with ${character.name} | Eliza Cloud\``, `"Agent Not Found | Eliza Cloud"` |
| `pages/payment/success/layout.tsx:8` | `<title>Payment Successful | Eliza Cloud</title>` |
| `pages/payment/app-charge/[appId]/[chargeId]/layout.tsx:8` | `<title>Pay App Charge | Eliza Cloud</title>` |
| `pages/payment/[paymentRequestId]/page.tsx:126` | `<title>Payment Request | Eliza Cloud</title>` |
| `pages/invite/accept/layout.tsx:8,11` | `<title>Accept Invitation | Eliza Cloud</title>`, description |
| `pages/login/layout.tsx:8` | `<title>Login | Eliza Cloud</title>` |
| `pages/login/page.tsx:45` | `alt="Eliza Cloud"` (logo) |
| `pages/login/steward-wallet-providers.tsx:48,50` | `appName: "Eliza Cloud"`, description |
| `pages/login/steward-login-section.tsx:184` | toast `"Could not complete Eliza Cloud sign-in."` |
| `pages/auth/cli-login/page.tsx:299` | description `"Sign in to connect your Eliza app or CLI to Eliza Cloud"` |
| `pages/terms-of-service/page.tsx:143,146` | `<title>Terms of Service | Eliza Cloud</title>`, description |
| `components/landing/Footer.tsx:20,29,45` | `alt="Eliza Cloud"`, `"© 2026 Eliza Cloud · USA"`, `"Install elizaOS"` |
| `components/landing/landing-page-new.tsx:64` | spinner label `"Opening Eliza Cloud…"` |
| `components/layout/landing-header.tsx:26` | `alt="Eliza Cloud"` (logo) |
| `lib/api-client.ts:48` | thrown Error message includes "...stay scoped to Eliza Cloud." |
| `lib/steward-session.ts:41,148` | error fallbacks `"Could not establish an Eliza Cloud session."`, `"Could not complete Eliza Cloud sign-in."` |
| `providers/StewardProvider.tsx:15,98,107` | comment-only — not user-facing, safe to leave |
| `App.tsx:554` | `<a>Continue to elizaOS checkout</a>` |

### E.2 Token / product-name references (review for accuracy, then translate verbatim)

These mention the **elizaOS token** as a product. They are part of the actual offering (token cashout) and should stay as proper-noun "elizaOS" in every translation. Strategy: keep the literal `"elizaOS"` substring in every locale value and let the surrounding text translate around it.

| file:line | string |
|---|---|
| `dashboard/earnings/_components/earnings-page-client.tsx:343` | `≈ elizaOS tokens at current price` |
| `dashboard/earnings/_components/earnings-page-client.tsx:356` | `Redeem for elizaOS` (button) |
| `dashboard/earnings/_components/earnings-page-client.tsx:406,443,444` | "Converted to elizaOS tokens", redemption explainer |
| `dashboard/earnings/_components/earnings-page-client.tsx:545,587,590,712` | redemption history rows, modal title + helper |
| `dashboard/earnings/_components/earnings-page-wrapper.tsx:10` | description `"...redeem for elizaOS tokens"` |
| `dashboard/earnings/Page.tsx:20` | helmet description, same string |
| `dashboard/admin/_components/redemptions-client.tsx:435,559,642` | admin redemption rows referencing elizaOS amount |
| `dashboard/apps/_components/monetization/withdraw-dialog.tsx:170,279` | `"...redeemed as elizaOS tokens"` |
| `dashboard/affiliates/_components/affiliates-page-client.tsx:188,319` | affiliate share copy `"on Eliza Cloud"`, `"on top of base elizaOS prices"` |
| `dashboard/containers/_components/deploy-from-cli.tsx:31,67` | `"Deploy additional elizaOS projects"`, `"Run this command from your elizaOS project directory"` |

### E.3 Legal copy (treat as one parametrized template per paragraph)

`pages/terms-of-service/page.tsx` and `pages/privacy-policy/page.tsx` contain ~12 paragraphs mentioning `elizaOS`. The right pattern is to put each paragraph under its own key (e.g. `cloud.legal.tos.acceptance.body`) and reference the platform name via `{{appName}}` interpolation — that way the same paragraph translates correctly when the platform is rebranded.

## F. Common shared-constant candidates

Strings repeated 3+ times across files. These should become _one key each_ rather than N copies.

### Toast messages

From the 299 toast calls, the most reused literals are:

| count | level | text |
|---:|---|---|
| 14 | error | `Network error. Please check your connection.` |
| 4 | error | `Could not copy to clipboard` |
| 3 | success | `Logs copied to clipboard` |
| 3 | success | `Copied to clipboard` |
| 3 | success | `API key regenerated` |
| 3 | success | `Agent deleted` |
| 2 | success | `Webhook URL copied to clipboard` |
| 2 | success | `Invite link copied!` |
| 2 | success | `App deleted successfully` |
| 2 | success | `API key created successfully` |
| 2 | success | `Agent provisioning started/queued/completed` |
| 2 | error | `Upload failed`, `File processing failed`, `Failed to update sharing`, `Failed to load your agents`, `Failed to delete app`, `Could not build invite link` |
| 2 | info  | `Provisioning already in progress` |

Recommended key shape:

- `cloud.toast.network.connectionFailed` — shared by every "Network error" call.
- `cloud.toast.copy.success` / `cloud.toast.copy.failure` — shared by every clipboard call.
- `cloud.toast.apiKey.regenerated.success`, etc.

`"Copied to clipboard"` and its variants (with prefixes like "Webhook URL", "Verify token", "Invite link", "URL", "Logs") all collapse to a single key with a `{{what}}` interpolation: `t('cloud.toast.copy.success', { what: 'Webhook URL' })` → `"Webhook URL copied to clipboard"` in English, locale-appropriate phrasing elsewhere.

### Error-thrown-to-UI patterns

Most thrown `Error("…")` strings are one-offs. Two appear 2+ times and should consolidate:

- `Regeneration response did not include an API key` — 2× (`dashboard/api-keys/_components/api-keys-page-client.tsx`, sibling file).
- `Payment network is missing token configuration` — 2× (`dashboard/billing/_components/direct-crypto-credit-card.tsx`, neighboring component).
- `Failed to fetch metrics` — 2× (`dashboard/admin/_components/admin-metrics-client.tsx`).

These deserve a shared key per pair.

### Status-label tables

Several files define inline `Record<string, { label, color }>` tables for status badges (admin redemptions, infrastructure dashboard, containers table, eliza-agents table, mcps section, apps table). The labels overlap heavily: `Pending`, `Approved`, `Connected`, `Disconnected`, `Connecting`, `Running`, `Stopped`, `Failed`, `Provisioning`, `Queued`, `Completed`, `Rejected`, `Processing`. Consolidate into `cloud.status.<key>` keys reused across components.

### Sidebar labels

`components/layout/sidebar-data.ts` is the **single source of truth** for the dashboard nav. 21 sidebar items, all English literals (`Dashboard`, `My Agent`, `API Explorer`, `API Keys`, `Docs`, `Instances`, `MCPs`, `Containers`, `Settings`, `Account`, `My Apps`, `Earnings`, `Affiliates`, `Billing`, `Analytics`, `Moderation`, `Redemptions`, `Metrics`, `Infrastructure`). Replace `label: string` with `labelKey: string` (e.g. `"cloud.sidebar.dashboard"`) and resolve at render time in `sidebar-item.tsx`. One key per item.

### Helmet titles

35 hardcoded `<title>` tags. Pattern is uniform — they should all flow through a single helper:

```tsx
function PageTitle({ titleKey, vars }: { titleKey: string; vars?: TranslationVars }) {
  const { t } = useT();
  return <Helmet><title>{t(titleKey, vars)} | {t("cloud.meta.suffix")}</title></Helmet>;
}
```

Then every page declares only `<PageTitle titleKey="cloud.meta.dashboard.title" />`, and the trailing `"| Eliza Cloud"` lives once in `cloud.meta.suffix`. This also gives the brand-leakage fix (§E.1) one place to live.

## G. Recommended migration chunking

Phases match `docs/cloud-frontend-i18n-plan.md` §6. Repeating the order here, with the estimated string count per phase so the migration is fundable as discrete units of work:

1. **Phase 0 — plumbing only.** No strings migrated. Lands `I18nProvider`, `LanguageDropdown`, initial-lang resolver, SSR/prerender wiring. (~0 strings.)
2. **Phase 1 — meta + brand.** RootLayout meta, all `<title>` tags, all `<meta description>` tags, `PageTitle` helper, sidebar labels, footer brand chrome. **~140 strings.** Highest SEO/brand leverage, lowest risk.
3. **Phase 2 — auth + landing.** Login, signup, auth callback, invite accept, payment success/charge, sensitive-requests, approvals, ballots, landing hero/footer. **~250 strings.**
4. **Phase 3 — dashboard chrome.** Sidebar (already done in Phase 1 via labelKey, but verify), header, user menu, feedback modal, dashboard layout. **~60 strings.**
5. **Phase 4a — settings + connectors.** Largest single area; do per-connector sub-PRs. **~370 strings.**
6. **Phase 4b — admin.** Infrastructure dashboard alone is 125 strings; split into 3 sub-PRs (infrastructure / redemptions / metrics). **~370 strings.**
7. **Phase 4c — apps + monetization.** Apps tabs, earnings, affiliates, invoices, withdraw dialog. **~310 strings.**
8. **Phase 4d — containers.** Tables, log viewers, eliza-agent panels, dialogs. **~290 strings.**
9. **Phase 4e — billing + account + API keys + API explorer.** **~220 strings.**
10. **Phase 4f — chat + agents + my-agents + documents + MCPs.** **~260 strings.**
11. **Phase 4g — analytics + leftovers.** **~75 strings.**
12. **Phase 4h — legal pages.** Terms + privacy. **~80 paragraph-keys.** Human-translator review mandatory.
13. **Phase 5 — MDX docs.** Out of scope for this audit. 44 files / ~10k lines under `content/`. Track separately with a per-locale directory model — flat-key extraction is the wrong shape for prose docs.

Total user-facing translation work: **~2,200 source strings** ⇒ **~17,500 target strings across 8 locales** (counting English as the source-of-truth, translated separately into 7 others).

## H. Verified observations

- No existing i18n: `rg "useTranslation|i18next" src/` returns zero hits.
- The desktop `t()` system in `@elizaos/ui` already supports the exact 8 locales the cloud-frontend needs, and `@elizaos/ui` is already a workspace dependency — so wiring i18n adds no new packages.
- SSR scope is tiny: only `/` is prerendered, so the i18n SSR contract reduces to "render the landing page in English." Everything else is client-rendered and can resolve language from `localStorage`.
- Cloud-frontend has its own e2e suite (`tests/e2e/*.spec.ts`) that asserts a few English literals via regex match. Phases 1–4 preserve those literals as the English key value, so the suite stays green throughout the migration.

## I. Risks and unknowns

- **Layout fragility for CJK locales.** ~20 % of cloud-frontend UI uses fixed-width grids (e.g. status badges, sidebar items). Korean/Japanese/Chinese translations are sometimes shorter (CJK characters are wider but fewer of them), but longer translations from Spanish/Portuguese are the bigger risk. Recommend a pass with `?lang=es` / `?lang=pt` and a Playwright visual-diff snapshot after Phase 4a lands.
- **Toast templates with interpolation.** Several toast calls build messages from JS template literals with embedded variables (e.g. `\`Node ${nodeId} updated\``). Translating these requires converting to `t("cloud.toast.node.updated", { nodeId })` and rewriting the template literal — easy mechanical change but mass refactor.
- **`elizaOS tokens` cluster.** §E.2 lists ~15 places where the literal `"elizaOS"` must survive translation. Translator briefing must include this constraint or a translator will turn `elizaOS` into a transliteration.
- **MDX docs (44 files).** Translation strategy fundamentally different from UI strings. Out of scope here — see §G phase 5 placeholder.
- **Whitelabel coupling.** `docs/whitelabel-i18n-roadmap.md` already calls for a `CLOUD_BRAND` singleton populated from env vars to remove "Eliza Cloud" hardcoding for non-eliza brands. The i18n migration should _depend on_ that singleton: keys like `cloud.meta.root.title` should produce `t("cloud.meta.root.title", { cloudServiceName: CLOUD_BRAND.name })` so a single rebuild handles both brand and language. Coordinate before Phase 1.
