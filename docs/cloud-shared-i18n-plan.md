# cloud-shared i18n Migration Plan

Concrete plan to make `cloud-shared` brand- and locale-parameterizable so
both `elizacloud.ai` and a `milady`-branded build can ship from the same
source. Builds on the inventory in `cloud-shared-i18n-audit.md`.

Supported languages: `en`, `es`, `ko`, `pt`, `tl`, `vi`, `zh-CN`, `ja`.

The plan is intentionally backend-shaped: cloud-shared is consumed by a
Cloudflare Worker (`cloud-api`) and used for transactional outputs (emails,
Stripe sessions, SEO head tags, A2A discovery, TwiML voice prompts). It is
not React-shaped, so we do **not** introduce `react-intl` or a runtime React
provider here — that belongs to `cloud-frontend`.

---

## 1. Per-recipient locale for emails

### Where the locale comes from

Today there is no locale stored on the `users` table (audit §1 / users schema
inspection — only `email`, `email_verified`, `email_notifications`; no
`locale` / `preferred_language`). The send path is fire-and-forget from
services like `auto-top-up.ts` → `email.ts` → `template-renderer.ts`.

Recommendation: store the recipient's preferred locale on the **User** row.

Schema change (one focused migration; see `cloud-shared/CLAUDE.md` rule about
small migrations):

```
ALTER TABLE users ADD COLUMN preferred_locale TEXT;
-- nullable: existing rows fall back to brand default
-- short, BCP-47-ish: 'en', 'es', 'ko', 'pt', 'tl', 'vi', 'zh-CN', 'ja'
```

Source-of-truth precedence on send:

1. Explicit `locale` argument passed by the caller (highest — for code paths
   like invite-accept where the recipient might not yet be a user).
2. `users.preferred_locale` for the recipient when an account exists.
3. `Accept-Language` captured at signup time and persisted to
   `preferred_locale` (one-time, never overrides explicit user choice).
4. `BRAND_DEFAULT_LOCALE` env (per-deployment fallback — `en` for elizacloud,
   configurable for milady).
5. Hard fallback `en`.

The user-facing locale setter lives in cloud-frontend account settings; it
posts to a route that writes `preferred_locale` via
`usersRepository.update(...)`.

### How emails consume the locale

Today `email.ts` constructs an English subject literal and calls
`renderXTemplate(data)`. That breaks per-recipient locale at two layers:

- **Subject:** hardcoded in `email.ts` lines 135/153/171/189/207/225/247.
- **Body:** literal English in `templates/*.html`/`*.txt` and inline strings
  in `template-renderer.ts`.

Migration shape:

1. **Move every literal subject and body string into a per-locale catalog.**
   Best fit for the Worker runtime is a static, statically-imported map (no
   runtime fetch of locale files; the Cloudflare Workers V8 isolate has
   strict bundle size and bundling discipline, and the cloud-shared
   CLAUDE.md already calls out keeping bundles small):

   ```
   src/lib/email/i18n/
     en/welcome.ts        // exports { subject, body: { ... } }
     en/low-credits.ts
     en/invite.ts
     en/auto-top-up-success.ts
     en/auto-top-up-disabled.ts
     en/purchase-confirmation.ts
     en/container-shutdown-warning.ts
     es/...   (mirror)
     ko/...
     pt/...
     tl/...
     vi/...
     zh-CN/...
     ja/...
     index.ts             // resolveEmailMessages(locale, brand) -> typed object
   ```

   Each per-template module exports a typed object: subject + a flat record
   of named slots (`title`, `heading`, `body_p1`, `cta_label`,
   `footer_legal`, ...). Static typing across locales is enforced by giving
   each template a TS interface in `types.ts` and importing it in every
   locale file — missing keys then fail typecheck.

2. **Convert `templates/*.html`/`*.txt` from English literals into
   placeholder-only skeletons.** All visible text becomes `{{slot}}` and is
   filled by the per-locale module at render time. Templates keep the email
   structural HTML (table layout, CSS resets, hero image, footer chrome)
   exactly as it is today.

3. **Threading locale through `template-renderer.ts`:** every `renderX`
   function takes the recipient's locale (default falls back to
   `BRAND_DEFAULT_LOCALE`), picks the per-locale slot object, and uses the
   existing `interpolate()` for both the data and the slot text.

4. **Threading locale through `email.ts`:** `EmailService.sendXEmail` adds a
   `locale: string` field on every `*EmailData` type and uses it to:

   - pick the subject from the locale module (replacing the hardcoded
     subjects on lines 135–247);
   - pass the locale into the renderer.

5. **Threading locale through callers:** auto-top-up, invite-accept,
   container-shutdown cron, purchase webhook handlers, welcome-email
   trigger. Each of them already has the recipient user/org in scope — they
   just need to resolve `user.preferred_locale ?? BRAND_DEFAULT_LOCALE`
   before calling `emailService.sendX`.

6. **Inline-HTML rendererers (`renderAutoTopUpSuccessTemplate`,
   `renderAutoTopUpDisabledTemplate`) move to file-backed templates.** The
   current pattern of embedding the HTML in TS makes locale-swapping
   harder. Extract them to `templates/auto-top-up-success.html|.txt` and
   `templates/auto-top-up-disabled.html|.txt` so all 7 email types use the
   same `loadTemplate` + `interpolate` pipeline. This is a refactor on top
   of i18n but unblocks the per-locale slot mapping cleanly.

7. **`currentYear` stays a runtime variable**, not a locale string.

### Brand sender

The current sender fallback is `noreply@elizacloud.ai` (`email.ts:34`). This
is the only brand-coupled string in the send path. Already conditional on
`SENDGRID_FROM_EMAIL || SMTP_FROM`. The migration:

- Rename the fallback constant to `BRAND_DEFAULT_FROM_EMAIL` sourced from a
  new env (`BRAND_DEFAULT_FROM_EMAIL`) with a hard fallback of
  `noreply@elizacloud.ai` so existing deploys do not break.
- Add `BRAND_DEFAULT_REPLY_TO` env so brands can route inbound replies (some
  templates currently invite the user to "Reply to this email" — for example
  container-shutdown-warning).
- Add `BRAND_SUPPORT_EMAIL` env to replace the hardcoded
  `support@eliza.cloud` in `purchase-confirmation.html:248,250` and `.txt:40`.

---

## 2. Brand parameterization (Eliza Cloud / noreply / domains)

The audit shows the brand string `"Eliza Cloud"` and the domain family
`*.elizacloud.ai` are embedded in:

- email subjects (`email.ts`)
- email bodies (10 templates + 2 inline renderers, all `legal-footer` rows)
- SEO constants (`seo/constants.ts`, `seo/schema.ts`, `seo/metadata.ts`)
- A2A discovery (`api/a2a/platform-cloud.ts`)
- bootstrap landing JSON (`cloud-api/src/bootstrap-app.ts`)
- OpenAPI generator (`swagger/openapi-generator.ts`)
- managed-launch agent default bio + system prompt
  (`eliza-managed-launch.ts:121–122`)
- wallet auth signing message (`wallet-auth.ts:54`)
- ledger descriptions (`crypto-payments.ts`, `topup-handler.ts`,
  `auto-top-up.ts`, `app-credits.ts`, `credits.ts`, `signup-code.ts`)
- robots/indexable hosts (`seo/environment.ts:4`)
- proxy redirect URLs (`proxy/birdeye-handler.ts`,
  `proxy/dexscreener-handler.ts`)
- support email + social links (welcome.html, etc.)

### Brand config surface

Add a single source of truth for brand defaults: `src/lib/brand/config.ts`.
It reads env once at module load (Cloudflare Workers env is injected via
`getCloudAwareEnv`, so use that):

```ts
export interface BrandConfig {
  /** Public-facing brand name in subjects, headings, A2A descriptions. */
  name: string;                        // BRAND_NAME              default "Eliza Cloud"
  /** Short tagline used in footers/OG description. */
  tagline: string;                     // BRAND_TAGLINE           default "Autonomous AI Agents Platform"
  /** Sender address for transactional email. */
  fromEmail: string;                   // BRAND_DEFAULT_FROM_EMAIL default "noreply@elizacloud.ai"
  /** Reply-To address for human responses. */
  replyToEmail?: string;               // BRAND_DEFAULT_REPLY_TO
  /** Support address shown in copy ("Contact us at <...>") */
  supportEmail: string;                // BRAND_SUPPORT_EMAIL     default "support@eliza.cloud"
  /** Public site origin used as SEO canonical fallback. */
  publicUrl: string;                   // BRAND_PUBLIC_URL        default "https://www.elizacloud.ai"
  /** Cloud API origin used in cross-origin auth. */
  apiUrl: string;                      // BRAND_API_URL           default "https://api.elizacloud.ai"
  /** Twitter / X handle (rendered into og:twitter:creator/site). */
  twitterHandle: string;               // BRAND_TWITTER_HANDLE    default "@elizaos"
  /** Discord invite (used in welcome email). */
  discordInviteUrl?: string;           // BRAND_DISCORD_INVITE_URL
  /** GitHub org URL. */
  githubUrl?: string;                  // BRAND_GITHUB_URL
  /** Hosts where pages are indexable (robots tag) and CORS-allowed. */
  indexableHosts: string[];            // BRAND_INDEXABLE_HOSTS   default ["elizacloud.ai","www.elizacloud.ai"]
  /** Default per-deployment locale (en | es | ko | pt | tl | vi | zh-CN | ja). */
  defaultLocale: string;               // BRAND_DEFAULT_LOCALE    default "en"
  /** Privacy/Terms URLs surfaced in email footers. */
  privacyUrl: string;                  // BRAND_PRIVACY_URL       default "{publicUrl}/privacy-policy"
  termsUrl: string;                    // BRAND_TERMS_URL         default "{publicUrl}/terms-of-service"
}
```

All current hardcoded strings are then consumed via `getBrand()`:

- `email.ts` fallback `noreply@elizacloud.ai` → `brand.fromEmail`.
- `seo/constants.ts` `"Eliza Cloud"` / `"@elizaos"` / `defaultTitle` /
  `defaultDescription` → derived from `brand.name` + per-locale catalog (see §3).
- `seo/environment.ts` `DEFAULT_INDEXABLE_HOSTS` → `brand.indexableHosts`.
- `seo/schema.ts` `sameAs` URLs → `brand.twitterHandle` / `brand.githubUrl`.
- `bootstrap-app.ts` `"Eliza Cloud API"` / `"Eliza Cloud x402 facilitator"`
  / `docs:` URL → `brand.name` + per-locale catalog + `brand.publicUrl`.
- `swagger/openapi-generator.ts` `info.title` / `info.contact.name` /
  `info.contact.url` / `servers[0].url` → `brand.name` / `brand.publicUrl`.
- `api/a2a/platform-cloud.ts` `name: "Eliza Cloud"` / `provider.organization`
  → `brand.name`. `authentication.schemes[0].description` references "Eliza
  API key" → use `brand.name`.
- `eliza-managed-launch.ts:121` agent default bio
  (`"An autonomous AI agent running on Eliza Cloud."`) and 122 system
  prompt → `brand.name`. Note: the system prompt influences the agent's
  output, so per-recipient locale doesn't apply here (the agent itself is
  the recipient); use only `brand.name` substitution and stay in `en` for
  the system prompt unless the user explicitly chose a non-English agent.
- `wallet-auth.ts:54` signing message `"Eliza Cloud Authentication\n..."` →
  parameterize the brand prefix, **but be careful**: existing wallets have
  already signed messages with the literal `"Eliza Cloud Authentication"`
  string. Changing the prefix invalidates any cached signature and is a
  breaking change to the wallet-auth contract. Two paths:
  - Keep the literal `"Eliza Cloud Authentication"` as a stable contract
    string (it's not really user-facing copy — it's a signing-prompt label
    that ALSO doubles as protocol versioning).
  - Or, version the message: introduce `"{brand.name} Authentication"`
    behind a new header `X-Wallet-Sig-Version: 2` and accept both v1
    (literal) and v2 (branded) for a deprecation window. **Recommended:
    keep v1 stable, do not parameterize this string.**
- `discord.ts` Discord embed footers `"Eliza Cloud"` → use `brand.name` but
  flagged as low-priority (admin internal).
- All hardcoded URLs in `welcome.html` (lines 186/279/371/475/646/655):
  switch to `{{baseUrl}}` template placeholders driven by `brand.publicUrl`
  (the template renderer already computes `baseUrl` from
  `data.dashboardUrl`; this just needs to be threaded into every link).

### Statement_descriptor (Stripe / regulated)

`statement_descriptor` is NOT currently set anywhere in cloud-shared (the
audit confirmed this). On the Stripe account level, the descriptor must:

- Be 5–22 chars.
- Use only Latin letters, digits, and a small punctuation set.
- Not be per-transaction-localized — must reflect a stable trade name the
  cardholder will recognize, for chargeback handling.

Recommendation: leave Stripe statement_descriptor configured at the Stripe
account dashboard level (not in code), and document that brand-aware
deployments need separate Stripe accounts. **Flag this in the audit's risk
section**: "regulated; do not parameterize per-locale; per-brand only via
separate Stripe account."

The on-screen Stripe Checkout `product_data.name` IS user-facing copy and
SHOULD be localized + brand-parameterized:

- `topup-handler.ts:248` `name: "Eliza Cloud Credits"` →
  `` `${brand.name} ${t('credits_product_name')}` `` (per-locale "Credits"
  word).
- `topup-handler.ts:243` `description: "Eliza Cloud credit top-up: $${amount}"`
  → per-locale "credit top-up" + `brand.name`.
- `app-charge-requests.ts:369` `name: "${app.name} Credits"` →
  `` `${app.name} ${t('credits_product_name')}` `` (use the buyer's locale,
  not the app's).
- `app-charge-requests.ts:370` `description: $${amountUsd} credits for ${app.name}`
  → per-locale template.
- `auto-top-up.ts:238` `description: "Auto top-up - $${amount}"` →
  per-locale template; this is a PaymentIntent description, visible on the
  Stripe Dashboard, in receipts emailed by Stripe, and (truncated) in
  cardholder statement narrative.
- `payment-adapters/stripe.ts:95` fallback `"Payment"` → per-locale
  `t('payment_generic_fallback')`.

### Brand assets (images, R2 hosts)

`welcome.html` and other templates embed brand image URLs at
`https://pub-dd7a0f26356c48ddaabc61bcc94f4988.r2.dev/cloud/*.png`. These
are R2 public-bucket asset URLs and are tightly coupled to elizacloud.ai's
R2 setup. For a milady-branded build:

- Add `BRAND_EMAIL_ASSETS_BASE_URL` env (e.g.
  `https://assets.milady.example/email/`) and replace each image URL with
  `{{brandAssetsBaseUrl}}/<filename>` in templates. Brands ship their own
  asset bundle (logo, hero, social icons, "powered by" badge).
- The "Powered by elizaOS" badge specifically is a framework attribution,
  not brand chrome. Keep `alt="Powered by elizaOS"` literal (it points back
  to the elizaOS framework regardless of brand) — but the image URL is
  still brandable.

---

## 3. SEO / title / OG tag parameterization

Today `seo/constants.ts` exports `SEO_CONSTANTS` (siteName, defaults) and
`ROUTE_METADATA` (per-route title/description/keywords). Consumed in
`seo/metadata.ts` (page metadata generators) and `seo/schema.ts`
(JSON-LD). All call sites of `generatePageMetadata` end up with English
copy + brand siteName.

Migration shape:

1. **Split brand vs locale.** `SEO_CONSTANTS` becomes two layers:

   ```ts
   // Brand layer — single source per deployment
   const brandSeo = {
     siteName: brand.name,
     twitterHandle: brand.twitterHandle,
     ogImageDimensions: { width: 1200, height: 630 },
     twitterCardType: "summary_large_image",
   };

   // Locale layer — per supported language
   //   src/lib/seo/i18n/<locale>/route-metadata.ts
   const routeMetadataEs = {
     home: { title: "...", description: "...", keywords: [...] },
     dashboard: { title: "...", ... },
     // 17 routes total
   };
   ```

   `generatePageMetadata` takes the request locale (typically resolved from
   `Accept-Language` for SSR / from the URL path segment for static
   pre-rendering) and assembles brand + locale.

2. **Locale resolution at request time.** The cloud-api worker has the
   `Hono` context. Add a middleware that:
   - reads `Accept-Language`, picks the best match from the supported set
     (`en`, `es`, `ko`, `pt`, `tl`, `vi`, `zh-CN`, `ja`),
   - exposes it as `c.var.locale`.

   For `generatePageMetadata`/`generateChatMetadata`/etc. that today call
   without context, add a `locale` parameter (required) — every caller is
   either in a Hono handler or a server-side rendered page, both of which
   can supply locale explicitly.

3. **Dynamic metadata (`generateContainerMetadata`,
   `generateCharacterMetadata`, `generateChatMetadata`).** Currently
   inline-construct strings like `` `${name} - Container Details` ``,
   `` `${name} - AI Character` ``, `` `Chat with ${characterName}` ``,
   `` `${messageCount} message${plural} in this conversation with ${name}` ``.
   Replace with `t('container_title', { name })` style ICU MessageFormat
   strings so plural rules and word order match the recipient locale (e.g.
   Japanese order: "${characterName}とのチャット").

4. **Title suffix.** Today: `` `${options.title} | ${SEO_CONSTANTS.siteName}` ``.
   In some locales the pipe-separator convention reads awkwardly; allow the
   locale catalog to override the assembly:
   `` `${title} | ${siteName}` ``  → `` t('page_title_suffix', { title, siteName }) ``.

5. **JSON-LD (`seo/schema.ts`).** Same pattern: brand layer for `name` and
   `url`; locale layer for `description`, `featureList`, `contactType`,
   `offers.description`, `category`. The `aggregateRating` block in
   `generateProductSchema` is fake data (`4.8` / `120 reviews`) and should
   be **removed**, not localized — it is a structured-data integrity issue.

6. **`locale: "en_US"` constant** (seo/constants.ts:27). Replace with
   request-time locale (mapped to OG locale format: `en_US`, `es_ES`,
   `ko_KR`, `pt_BR`, `tl_PH`, `vi_VN`, `zh_CN`, `ja_JP`).

7. **robots / `DEFAULT_INDEXABLE_HOSTS`** (seo/environment.ts:4) is brand,
   not locale. Sourced from `brand.indexableHosts`.

### Frontend coupling

The audit also confirms `SEO_CONSTANTS` and `ROUTE_METADATA` have no
imports from `cloud-frontend/src/` (the grep returned 0 results). They are
consumed via `cloud-shared/src/lib/seo/index.ts` re-exports, and the
metadata generators are called from the cloud-api routes / server-rendered
OG endpoints. So this work is contained in cloud-shared + cloud-api and
does not require frontend changes in the same wave.

---

## 4. Stripe product / descriptor parameterization

### Stripe Checkout `product_data` (per-session, free-form)

These are user-facing and locale-safe to localize because they only appear
on the Stripe Checkout page (which itself runs in the buyer's browser and
already respects Stripe's `locale` parameter for surrounding chrome). The
audit identified:

- `topup-handler.ts:243,248` — `name`/`description`/`extra.name`
- `payment-adapters/stripe.ts:95–106` — fallback `"Payment"` + caller-supplied
- `app-charge-requests.ts:369–370` — `${app.name} Credits` / `$N credits for ${app.name}`
- `auto-top-up.ts:238` — PaymentIntent description
- `crypto-payments.ts:268` — OxaPay invoice description (analogous surface)

Migration:

- Each callsite resolves the buyer's locale (same precedence as §1 emails).
- A small per-locale `stripe-product.ts` catalog provides:
  `credits_product_name`, `credits_product_description`,
  `app_credits_product_name`, `app_credits_product_description`,
  `auto_top_up_description`, `payment_generic_fallback`,
  `credit_purchase_description`.
- All current sites are reformulated as `t(key, { brandName, amount, appName, ... })`.
- Pass `locale` to `stripe.checkout.sessions.create({ locale: 'auto' | ... })`
  so the Stripe-hosted page chrome also matches.

### Stripe `statement_descriptor` and `statement_descriptor_suffix`

**Regulated. Flag in plan.**

`statement_descriptor` (the prefix on the cardholder's statement) is:

- governed by card-network rules,
- limited to 5–22 ASCII chars,
- expected to be stable across transactions for chargeback handling,
- usually set on the **Stripe account** (Dashboard → Settings →
  Public details) — not per session, not per locale.

`statement_descriptor_suffix` IS per-PaymentIntent but is constrained to
22 chars and merged with the account default. Localizing the suffix is
infeasible (no room for Japanese/Korean characters; cardholder statements
are typically ASCII-only).

**Recommendation:** do NOT introduce per-locale statement descriptors. For a
brand-aware build:

- Each brand operates its own Stripe account with its own static
  account-level `statement_descriptor` (`"ELIZA CLOUD"` vs `"MILADY"`).
- Keep the dynamic `statement_descriptor_suffix` brand-aware via
  `BRAND_STATEMENT_DESCRIPTOR_SUFFIX` env (optional; opt-in per brand).
- Document this constraint in the migration PR.

### OxaPay / crypto-payments

`crypto-payments.ts:268` description string is shown on OxaPay's hosted
checkout. Same treatment as Stripe `product_data.description`: per-locale
catalog with brand substitution.

### x402

The x402 facilitator payment-requirement `description` (`topup-handler.ts:243`)
and `extra.name` (`topup-handler.ts:248`) are presented in x402 client SDK
prompts — wallet UIs typically render them verbatim. Same treatment as
Stripe.

---

## 5. Other surfaces

### A2A / OpenAPI discovery

`api/a2a/platform-cloud.ts` and `swagger/openapi-generator.ts` produce
machine-readable artifacts that humans nonetheless see in tools like
swagger-ui or A2A explorers. Migration:

- `name` / `provider.organization` → `brand.name`
- `description` strings → per-locale catalog, default `en`, request-time
  locale from `Accept-Language`
- `OpenAPI info.contact.url` / `servers[0].url` → `brand.publicUrl`

### TwiML voice prompts (`cloud-api/v1/twilio/voice/inbound/route.ts`)

`INITIAL_PROMPT`, `NOT_CONFIGURED_PROMPT`, `NO_SPEECH_PROMPT`,
`EMPTY_AGENT_REPLY` are spoken by Twilio's TTS to the inbound caller.
Twilio supports a `language` attribute on `<Say>` (e.g.
`<Say language="ja-JP">`) — the migration must pair the localized prompt
with the correct `language` attribute. Locale comes from:

- the agent's configured locale on the inbound phone number,
- or the caller's `From` country code as a best-effort fallback,
- or `brand.defaultLocale`.

### Ledger descriptions

`credits.ts`, `app-credits.ts`, `crypto-payments.ts`, `topup-handler.ts`,
`auto-top-up.ts`, `signup-code.ts` all write English `description` strings
to `credit_transactions` rows that surface in the user's billing history.
Two design choices:

1. **Store untranslated machine codes** (e.g. `description_code: "auto_top_up"`,
   `description_data: { amount: 12.34 }`) and localize at read time in the
   API response. This is the right long-term answer — it lets the user
   change locale without rewriting history. Requires a schema change
   (`description_code` text, `description_data` jsonb) + a small migration
   to fold existing rows into codes by pattern matching.
2. **Store the user's locale-at-time-of-write English description.** Simpler
   migration but freezes the locale of legacy rows. Not recommended.

Recommend #1. Phase it after the emails+SEO migration.

### API errors (`invites.ts`, `credits.ts`, `payment-methods.ts`,
`wallet-auth.ts`, `signup-code.ts`, `eliza-managed-launch.ts`)

These reach the HTTP client as `{ error: <verbatim English string> }`. The
cloud-frontend already has a translation layer for some of these (it maps
known error code strings to user-friendly i18n), but the canonical fix is
to:

- Add an error-code enum returned alongside the error message
  (`{ error: "User is already a member...", code: "invite_user_already_member" }`).
- Move display strings into per-locale catalogs in `cloud-frontend`.
- Keep the English `error` field as a developer-facing message; frontends
  render the localized version from the `code`.

This is consistent with what `topup-handler.ts` already does:
`code: "x402_settlement_failed"` etc. Apply the same pattern uniformly.

### Welcome-email starting credit literal

`welcome.html:153–155` literally renders `"<span>$5</span> in credits"`. The
amount is **not** templated — it's burned into the template. This is both
an i18n issue (currency symbol position) and a correctness issue (if the
default-credit value changes, the email lies). Migration: add
`{{startingCredits}}` and `{{currencySymbol}}` template variables; sourced
from a per-locale currency-format helper.

---

## 6. Suggested phasing — three things to do first

These are the three highest-leverage, lowest-risk steps that unblock
everything else. Each is independent and can ship as a focused PR.

### Phase 1: Brand config + sender/domain parameterization (no copy changes)

**Goal:** make every brand-coupled string (`"Eliza Cloud"`, `noreply@elizacloud.ai`,
`elizacloud.ai`/`www.elizacloud.ai`, `support@eliza.cloud`,
`@elizaos`, etc.) read from a single `brand` object backed by env, while
keeping all current English copy and behavior exactly as-is.

Why first: it's a pure refactor with no user-visible changes for the
existing elizacloud.ai deployment, and it unblocks every later phase
because brand and locale are orthogonal concerns. It also makes a
milady-branded build viable in English-only mode before any i18n work
lands.

Touch:

- new `src/lib/brand/config.ts` with `getBrand()` reading
  `BRAND_NAME`, `BRAND_DEFAULT_FROM_EMAIL`, `BRAND_SUPPORT_EMAIL`,
  `BRAND_PUBLIC_URL`, `BRAND_API_URL`, `BRAND_TWITTER_HANDLE`,
  `BRAND_INDEXABLE_HOSTS`, `BRAND_PRIVACY_URL`, `BRAND_TERMS_URL`,
  `BRAND_EMAIL_ASSETS_BASE_URL`, `BRAND_DEFAULT_LOCALE`
- swap fallbacks in `email.ts:34`, `seo/constants.ts:5–6`,
  `seo/environment.ts:4`, `seo/schema.ts:24`, `bootstrap-app.ts:85–101`,
  `swagger/openapi-generator.ts:313–325`,
  `api/a2a/platform-cloud.ts:32–37`,
  `managed-eliza-config.ts:5–6`,
  `eliza-managed-launch.ts:121–122` (system prompt brand only),
  `mobile-client.ts:43`, `auto-top-up.ts:331,363`,
  `proxy/{birdeye,dexscreener}-handler.ts`,
  `oauth-service.ts:204`, `oauth2.ts:166,322`,
  `whatsapp-automation/index.ts:31`, `telegram-automation/index.ts:14`,
  `twilio-automation/index.ts:19`, `discord-automation/index.ts:35`,
  `blooio-automation/index.ts:19`, `connection-enforcement.ts:197`,
  `docker-sandbox-provider.ts:625`, `x402-payment-requests.ts:199`,
  `eliza-app/onboarding-chat.ts:67`, `discord.ts:292,636,827,852,891`,
  `blob.ts:4`, `default-avatar.ts:9`, `default-user-avatar.ts:7`,
  `r2-public-object.ts:8`, `app-promotion-assets.ts:102`,
  `cors/cloud-api-hono-cors.ts:28–32`, `utils/cors.ts:8–9`,
  `steward-url.ts:29–34`, `eliza/config.ts:36–41`
- replace hardcoded `https://dev.elizacloud.ai/...` URLs in
  `welcome.html` with `{{baseUrl}}` placeholders driven by `brand.publicUrl`
- DO NOT touch `wallet-auth.ts:54` (`"Eliza Cloud Authentication"` is a
  stable signing-protocol prefix; see §2)
- DO NOT touch any English copy yet (subjects, body text, SEO titles)

### Phase 2: User preferred_locale + email i18n

**Goal:** make transactional emails per-recipient-locale.

Why second: emails are the single most user-visible English-only surface,
and they have a clean rendering boundary (`email.ts` + `template-renderer.ts`)
where we can introduce locale threading without touching the API layer or
the frontend. This is also where the per-recipient locale data model
question is forced.

Touch:

- migration adding `users.preferred_locale TEXT` (nullable)
- `usersRepository` getter / writer; route to update preference from
  cloud-frontend Settings
- `src/lib/i18n/` infrastructure: per-locale catalogs as static TS modules
  with shared TS interface; `t(locale, key, params)` helper using a small
  ICU-MessageFormat-compatible runtime (e.g. `@formatjs/intl-messageformat`
  — already a Worker-compatible bundle, ~30kb gzipped)
- per-template locale modules under `src/lib/email/i18n/{en,es,ko,pt,tl,vi,zh-CN,ja}/`
- convert `templates/welcome.html|.txt`, `low-credits.html|.txt`,
  `invite.html|.txt`, `purchase-confirmation.html|.txt`,
  `container-shutdown-warning.html|.txt` to slot-only skeletons
- extract `renderAutoTopUpSuccessTemplate` and
  `renderAutoTopUpDisabledTemplate` from `template-renderer.ts` into
  file-backed `templates/auto-top-up-success.html|.txt` and
  `templates/auto-top-up-disabled.html|.txt`
- add `locale` field to every `*EmailData` type; thread through
  `email.ts.send*` and all 6 callers (auto-top-up, invite-accept,
  container-shutdown cron, purchase webhook, welcome trigger, low-credits
  cron)
- replace hardcoded subjects in `email.ts:135–247` with locale-keyed lookups
- replace hardcoded `"$5 starting credits"` in `welcome.html:153–155` with
  templated `{{startingCredits}}` + locale-aware currency formatter

### Phase 3: Stripe product naming + critical API errors

**Goal:** localize the cash-handling surfaces and most-visible API errors
without yet undertaking the full SEO/JSON-LD migration.

Why third: these are the next-most-visible English-only surfaces (the
Stripe Checkout page is in every paid flow, and API errors block invite /
billing UX). Doing them after Phase 2 means we can reuse the `i18n/`
infrastructure built in Phase 2 directly, with no new plumbing.

Touch:

- `topup-handler.ts:243,248,410,443,472` — replace English literals with
  `t(locale, key, params)` from a new `stripe-product` + `transactional`
  catalog
- `payment-adapters/stripe.ts:95` fallback
- `app-charge-requests.ts:369–370`
- `auto-top-up.ts:238` PaymentIntent description (resolve buyer locale
  before the Stripe call)
- `crypto-payments.ts:268,621,980,1076` (OxaPay parallel surface)
- pass `locale: <buyer locale>` to `stripe.checkout.sessions.create()` so
  the Stripe-hosted UI matches
- introduce error-code enum + `code` field on the audited API errors in
  `invites.ts`, `payment-methods.ts`, `signup-code.ts`,
  `wallet-auth.ts`, `eliza-managed-launch.ts`, `credits.ts`. Keep the
  English `error` string for developer logs; let the frontend localize via
  the new code.

### Out of scope for the first three phases (defer)

- SEO `ROUTE_METADATA` / dynamic page metadata / JSON-LD localization
  (Phase 4 — touches cloud-frontend and the SSR/OG endpoints; needs a
  request-locale middleware in `cloud-api`)
- TwiML voice prompts in `cloud-api/v1/twilio/voice/inbound/route.ts`
  (Phase 5 — needs the agent-level locale config)
- Ledger description code migration with backfill (Phase 6 — schema work
  + history rewrite)
- Wallet-auth signing message change (defer indefinitely; protocol-stable)
- Stripe `statement_descriptor` (operator concern, per-brand Stripe
  account; document, do not implement)

---

## 7. Risk register

- **Email deliverability when changing From: address per-brand.** Each
  brand needs its own verified SPF/DKIM/DMARC alignment with the new
  domain. Don't ship a brand build with `BRAND_DEFAULT_FROM_EMAIL` set to
  a domain that hasn't completed SendGrid/Postmark verification —
  emails will silently land in spam.
- **Wallet auth signing-prefix change is a breaking protocol change.**
  Out of scope per §2.
- **Stripe statement_descriptor is regulated.** Out of scope per §4.
- **Welcome-email "$5" literal is currently a lie** if
  `STARTING_CREDIT_BALANCE` env is changed. Fix in Phase 2 even if i18n
  is the trigger.
- **JSON-LD `aggregateRating` is fake data** (`4.8` / `120 reviews` in
  `seo/schema.ts:101–104`). Remove during Phase 4 SEO work; don't try to
  localize fake data.
- **OG `locale: "en_US"` is currently hardcoded** and will produce
  incorrect OG locale tags for any non-English page. Fix in Phase 4.
- **TwiML `<Say>` defaults to English-male voice.** Localized prompt text
  with the wrong `language=` attribute will be mispronounced. Always pair
  locale string with `language=` attribute in Phase 5.
- **Cloudflare Worker bundle size.** Each locale adds ~2–8kb compressed
  per template surface. 8 locales × (email + seo + stripe + api-error +
  ledger catalogs) is ~200–400kb gzipped — within Workers' 10MB limit but
  bears monitoring during Phase 2.
- **Per-locale TS interface drift.** Enforce by giving every catalog
  module a shared TS interface — missing keys then fail `bun run typecheck`.
- **Existing translation in cloud-frontend.** The plan assumes
  cloud-frontend does not already own a catalog of these strings. Verify
  before Phase 2 — if it does, the catalog source-of-truth should live in
  one place (probably `cloud-shared/src/lib/i18n/` with cloud-frontend
  importing from it).
