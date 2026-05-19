# cloud-shared i18n Audit

Hardcoded English / brand strings in `eliza/packages/cloud-shared/` and the
adjacent cloud-api bootstrap. **Inventory only — no code changes.**

Categories:

- `email-subject` — `subject:` field passed to SendGrid/SMTP. The recipient sees this in their inbox.
- `email-body` — copy inside `.html` / `.txt` templates and inline HTML in `template-renderer.ts`.
- `seo-title` / `seo-description` — page title / OG / Twitter / JSON-LD strings rendered into HTML head served to clients and crawlers.
- `stripe-product` — `product_data.name` / `product_data.description` / x402 product `name` shown in checkout UI and on the customer's card statement.
- `api-error` — strings thrown from services that reach the HTTP boundary as `{ error: <msg> }` JSON (the client renders the verbatim string).
- `transactional-copy` — operator-style copy reaching real users (TwiML voice prompts, A2A agent card descriptions).
- `legal-footer` — copyright lines, "Powered by" lines, support email addresses.

User-facing? "Internal logger messages don't count" — I have excluded log lines, in-code `Error()` whose message is purely a developer/internal contract (e.g. `"organizationId is required"` for missing-arg programming errors that should never reach the user), and Discord-webhook embed footers (admin internal observability surface).

---

## 1. Email templates

All emails are sent from `email.ts` and use `template-renderer.ts` to load
files under `templates/`. All current subjects are English emoji-prefixed
strings; none reads a locale.

### 1.1 `src/lib/services/email.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 34 | `"noreply@elizacloud.ai"` (fallback for `SENDGRID_FROM_EMAIL` / `SMTP_FROM`) | brand / sender | Y (visible as From: address) |
| 135 | `"🎉 Welcome to Eliza Cloud - Let's Get Started!"` | email-subject | Y |
| 153 | `"⚠️ Low Credits Alert - Action Required"` | email-subject | Y |
| 171 | `` `🎉 You've been invited to join ${data.organizationName} on Eliza Cloud` `` | email-subject | Y |
| 189 | `"✓ Auto Top-Up Successful - Balance Recharged"` | email-subject | Y |
| 207 | `"⚠ Auto Top-Up Disabled - Action Required"` | email-subject | Y |
| 225 | `"✓ Purchase Confirmed - Credits Added to Your Account"` | email-subject | Y |
| 247 | `` `🚨 URGENT: Container "${data.containerName}" will be shut down in 48 hours` `` | email-subject | Y |

### 1.2 `src/lib/email/utils/template-renderer.ts`

Two of the auto-top-up emails inline their HTML + text body directly in this
TypeScript file (rest are loaded from `templates/`).

**`renderAutoTopUpSuccessTemplate` (lines 137–223):**

| Lines | String | Category |
|---|---|---|
| 157 | `<title>Auto Top-Up Successful</title>` | email-body |
| 161 | `✓ Auto Top-Up Successful` (header) | email-body |
| 162 | `Hi ${templateData.organizationName} team,` | email-body |
| 163 | `Your account has been automatically topped up with <strong>$${...}</strong>.` | email-body |
| 166 | `Transaction Details` | email-body |
| 169 | `Previous Balance:` | email-body |
| 173 | `Amount Added:` | email-body |
| 177 | `New Balance:` | email-body |
| 181 | `Payment Method:` | email-body |
| 188 | `This automatic top-up ensures your services continue running without interruption. You can manage your auto top-up settings in your dashboard.` | email-body |
| 194 | `© ${currentYear} Eliza Cloud. All rights reserved.` | legal-footer |
| 200–220 | mirror text version of the same English copy | email-body |

**`renderAutoTopUpDisabledTemplate` (lines 231–308):**

| Lines | String | Category |
|---|---|---|
| 248 | `<title>Auto Top-Up Disabled</title>` | email-body |
| 252 | `⚠ Auto Top-Up Disabled` | email-body |
| 253 | `Hi ${...} team,` | email-body |
| 254 | `Your auto top-up feature has been automatically disabled.` | email-body |
| 257 | `Reason:` / `Current Balance:` | email-body |
| 261 | `What should you do?` | email-body |
| 263 | `Log in to your dashboard and review your payment method settings` | email-body |
| 264 | `Update your payment information if needed` | email-body |
| 265 | `Re-enable auto top-up in your billing settings` | email-body |
| 268 | `To prevent service interruptions, please address this issue as soon as possible. Your current balance is displayed above.` | email-body |
| 275 | `© ${currentYear} Eliza Cloud. All rights reserved.` | legal-footer |
| 281–305 | text version of the same English copy | email-body |

### 1.3 `src/lib/email/templates/welcome.html`

| Lines | String | Category |
|---|---|---|
| 6 | `<title>Welcome to Cloud</title>` | email-body |
| 111 | `alt="Cloud"` (logo) | email-body |
| 135 | `Welcome to Cloud` (h1) | email-body |
| 153–157 | `We've added <span>$5</span> in credits to your account.<br/>You're ready to start building powerful AI agents.` | email-body |
| 186, 279, 371, 475, 646, 655 | Hardcoded `https://dev.elizacloud.ai/...` URLs (chat, api-explorer, dashboard, privacy-policy, terms-of-service) | email-body + brand domain |
| 212 | `alt="AI Agent Icon"` | email-body |
| 230–232 | `Deploy AI agents with custom personalities, capabilities, and integrations tailored to your needs.` | email-body |
| 242 | `alt="Arrow"` | email-body |
| 305 | `alt="API Icon"` | email-body |
| 323–324 | `Use our API to seamlessly connect Eliza agents to your apps, workflows, and existing systems.` | email-body |
| 397 | `alt="Dashboard Icon"` | email-body |
| 415–416 | `Easily monitor your balance, track usage, and manage all your account settings in dashboard.` | email-body |
| 456 | `Build AI agents in seconds` | email-body |
| 489 | `Get Started` (CTA) | email-body |
| 552–553 | `You received this email because you created an account at Eliza Cloud.` | legal-footer |
| 573 | `alt="Powered by elizaOS"` | brand asset alt |
| 595 | `https://discord.gg/mPsBnEXJuA` link | brand link |
| 610 | `https://x.com/elizaos` link | brand link |
| 651 | `>Privacy</a>` | legal-footer |
| 660 | `>Terms</a>` | legal-footer |
| 671 | `Cloud © 2025 Eliza Cloud` (hard-coded 2025) | legal-footer |

### 1.4 `src/lib/email/templates/welcome.txt`

| Lines | String | Category |
|---|---|---|
| 1 | `🎉 Welcome to Eliza Cloud!` | email-body |
| 3 | `Hi {{userName}}, we're excited to have you here!` | email-body |
| 5 | `Your organization "{{organizationName}}" has been successfully created, and you're ready to start building amazing AI agents.` | email-body |
| 7 | `🎁 STARTING BALANCE: ${{creditBalance}}` | email-body |
| 8 | `Perfect for building your first agents!` | email-body |
| 10 | `GET STARTED IN 3 EASY STEPS:` | email-body |
| 12 | `Explore Your Dashboard` | email-body |
| 13 | `View your balance, usage analytics, and account settings` | email-body |
| 15 | `Create Your First Agent` | email-body |
| 16 | `Deploy intelligent AI agents with custom personalities and capabilities` | email-body |
| 18 | `Integrate with Your App` | email-body |
| 19 | `Use our API to connect Eliza agents to your applications` | email-body |
| 21 | `→ View Dashboard:` | email-body |
| 22 | `→ Read Documentation:` | email-body |
| 24 | `NEED HELP?` | email-body |
| 25 | `Check out our documentation or reach out to our support team.` | email-body |
| 28 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |
| 30 | `You received this email because you created an account at Eliza Cloud.` | legal-footer |

### 1.5 `src/lib/email/templates/low-credits.html`

| Lines | String | Category |
|---|---|---|
| 6 | `<title>Low Credits Alert</title>` | email-body |
| 236 | `Low Balance Alert` (h1) | email-body |
| 237 | `Action required for {{organizationName}}` | email-body |
| 242 | `🚨 Your account balance is running low` | email-body |
| 243–246 | `To ensure uninterrupted service for your AI agents and applications, please add funds to your account as soon as possible.` | email-body |
| 250 | `Current Balance` (label) | email-body |
| 252 | `remaining` | email-body |
| 258 | `What happens when balance runs out?` | email-body |
| 262 | `AI agent requests will be rejected` | email-body |
| 264 | `All chat and agent interactions will stop working` | email-body |
| 268 | `API calls will return errors` | email-body |
| 270–271 | `Your applications will receive "insufficient funds" responses` | email-body |
| 275 | `Limited container access` | email-body |
| 277 | `Containers will continue running but in read-only mode` | email-body |
| 284 | `💳 Add Funds Now →` (CTA) | email-body |
| 290 | `Pro Tip: Set Up Auto-Recharge` | email-body |
| 292–297 | `Never run out of funds again! Configure automatic top-ups in your billing settings to maintain uninterrupted service. We'll automatically add funds when your balance falls below your chosen threshold.` | email-body |
| 310–311 | `Need help?` / `Our support team is here to assist you with billing questions or account management.` | email-body |
| 317 | `Eliza Cloud` (footer logo text) | legal-footer |
| 318 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |
| 320–321 | `You received this alert because your account balance fell below ${{threshold}}.` | legal-footer |

### 1.6 `src/lib/email/templates/low-credits.txt`

| Lines | String | Category |
|---|---|---|
| 1 | `⚠️ LOW BALANCE ALERT` | email-body |
| 3 | `Action required for {{organizationName}}` | email-body |
| 5 | `Your account balance is running low. To avoid service interruption, please add funds to your account soon.` | email-body |
| 7 | `CURRENT BALANCE: ${{currentBalance}} remaining` | email-body |
| 9 | `WHAT HAPPENS WHEN BALANCE RUNS OUT?` | email-body |
| 10–12 | bulleted impact list | email-body |
| 14 | `→ Add Funds Now:` | email-body |
| 16 | `💡 PRO TIP:` / `Set up automatic top-ups to ensure uninterrupted service...` | email-body |
| 20 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |
| 22 | `You received this alert because your account balance fell below ${{threshold}}.` | legal-footer |

### 1.7 `src/lib/email/templates/invite.html`

| Lines | String | Category |
|---|---|---|
| 253 | `You're Invited!` (h1) | email-body |
| 254 | `Join your team on Eliza Cloud` | email-body |
| 258 | `Hi there,` | email-body |
| 262–265 | `<strong>{{inviterName}}</strong> has invited you to join<br/><strong>{{organizationName}}</strong> on Eliza Cloud` | email-body |
| 269 | `Your Assigned Role` | email-body |
| 274 | `🚀 What You'll Get Access To:` | email-body |
| 277 | `Collaborate seamlessly with your team members` | email-body |
| 280 | `Access shared account balance and resources` | email-body |
| 282 | `Deploy and manage AI agents together` | email-body |
| 284 | `Share characters, conversations, and integrations` | email-body |
| 287 | `Track team analytics and usage insights` | email-body |
| 293 | `✓ Accept Invitation` (CTA) | email-body |
| 297 | `⏰ This invitation expires in 7 days` | email-body |
| 302 | `Didn't expect this invitation?` | email-body |
| 303–304 | `You can safely ignore this email. No account will be created without your acceptance.` | email-body |
| 310 | `Eliza Cloud` (footer logo) | legal-footer |
| 311 | `Autonomous AI Agents Platform` | legal-footer |
| 313 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |

### 1.8 `src/lib/email/templates/invite.txt`

| Lines | String | Category |
|---|---|---|
| 1 | `You've been invited to join {{organizationName}} on Eliza Cloud!` | email-body |
| 5 | `{{inviterName}} has invited you to join {{organizationName}} on Eliza Cloud.` | email-body |
| 7 | `Your Role: {{role}}` | email-body |
| 9–14 | "What You'll Get Access To" bullets | email-body |
| 16 | `Accept your invitation:` | email-body |
| 19 | `⏰ This invitation expires in 7 days` | email-body |
| 23 | `Didn't expect this invitation?` | email-body |
| 24 | `You can safely ignore this email. No account will be created without your acceptance.` | email-body |
| 28 | `Eliza Cloud` (signature line) | legal-footer |
| 29 | `Autonomous AI Agents Platform` | legal-footer |
| 31 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |

### 1.9 `src/lib/email/templates/purchase-confirmation.html`

| Lines | String | Category |
|---|---|---|
| 6 | `<title>Purchase Confirmation - Eliza Cloud</title>` | email-body |
| 162 | `Purchase Confirmed!` (h1) | email-body |
| 163 | `Your credits have been added successfully` | email-body |
| 167 | `Hi {{organizationName}} team,` | email-body |
| 169–172 | `Your credit purchase has been processed successfully. The credits have been added to your account and are ready to use immediately.` | email-body |
| 175 | `Transaction Summary` | email-body |
| 178 | `Purchase Amount` | email-body |
| 183 | `Credits Added` | email-body |
| 188 | `Payment Method` | email-body |
| 193 | `Transaction Date` | email-body |
| 198 | `Invoice Number` | email-body |
| 204 | `Your New Balance` | email-body |
| 209–211 | `Previous Balance:` / `Credits Added:` / `New Balance:` | email-body |
| 226 | `Invoice Number:` | email-body |
| 228 | `Transaction Date:` | email-body |
| 230 | `Payment Method:` | email-body |
| 235–239 | `This transaction has been completed successfully. All details are included above for your records. If you need assistance, please contact our support team.` | email-body |
| 243 | `Thank you for using Eliza Cloud!` | legal-footer |
| 245 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |
| 246 | `Questions? Contact us at` | legal-footer |
| 248, 250 | `mailto:support@eliza.cloud` + visible text | legal-footer / brand |

### 1.10 `src/lib/email/templates/purchase-confirmation.txt`

| Lines | String | Category |
|---|---|---|
| 1 | `✓ PURCHASE CONFIRMED!` | email-body |
| 3 | `Hi {{organizationName}} team,` | email-body |
| 5–6 | `Your credit purchase has been processed successfully...` | email-body |
| 8–32 | "Transaction summary / balance update / additional details" labels | email-body |
| 36 | `This transaction has been completed successfully. All details are included above for your records. If you need assistance, please contact our support team.` | email-body |
| 38 | `Thank you for using Eliza Cloud!` | legal-footer |
| 40 | `Questions? Contact us at support@eliza.cloud` | legal-footer / brand |
| 42 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |

### 1.11 `src/lib/email/templates/container-shutdown-warning.html`

| Lines | String | Category |
|---|---|---|
| 6 | `<title>Container Shutdown Warning</title>` | email-body |
| 271 | `Container Shutdown Warning` (h1) | email-body |
| 272 | `Urgent action required for {{organizationName}}` | email-body |
| 277 | `⚠️ Your container will be shut down in 48 hours` | email-body |
| 278–282 | `Your account has insufficient credits to continue running your deployed container. Add funds within the next 48 hours to prevent service interruption.` | email-body |
| 286 | `Time Until Shutdown` | email-body |
| 287 | `48 Hours` (literal — could be a parameter) | email-body |
| 288 | `Scheduled: {{shutdownTime}}` | email-body |
| 292 | `📦 Container Details` | email-body |
| 294, 298, 302, 306, 312 | labels: `Container Name`, `Project`, `Daily Cost`, `Current Balance`, `Required to Continue` | email-body |
| 320 | `What happens when shutdown occurs?` | email-body |
| 324–326 | `Container will be stopped` / `Your agent will go offline and stop responding` | email-body |
| 330 | `API endpoints will become unavailable` | email-body |
| 332 | `All requests to your container URL will fail` | email-body |
| 336 | `Data in memory will be lost` | email-body |
| 338 | `Persistent storage will be retained for 30 days` | email-body |
| 345 | `💳 Add Credits Now →` (CTA) | email-body |
| 351 | `Quick Cost Reference` | email-body |
| 353–357 | `Containers are billed daily at ${dailyCost}/day (${monthlyCost}/month). Add at least ${minimumRecommended} to keep your container running for the next week, or set up auto-recharge to never worry about credits again.` | email-body |
| 371 | `Questions?` | email-body |
| 372–374 | `Reply to this email or visit our dashboard to manage your containers.` | email-body |
| 379 | `Eliza Cloud` (footer logo) | legal-footer |
| 380 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |
| 382–385 | `You received this urgent alert because your container "{{containerName}}" is scheduled for shutdown due to insufficient credits.` | legal-footer |

### 1.12 `src/lib/email/templates/container-shutdown-warning.txt`

| Lines | String | Category |
|---|---|---|
| 1 | `🚨 CONTAINER SHUTDOWN WARNING` | email-body |
| 4 | `Organization: {{organizationName}}` | email-body |
| 6 | `URGENT: Your container will be shut down in 48 hours!` | email-body |
| 8 | `Your account has insufficient credits to continue running your deployed container. Add funds within the next 48 hours to prevent service interruption.` | email-body |
| 10–11 | `TIME UNTIL SHUTDOWN: 48 Hours` / `Scheduled:` | email-body |
| 13–19 | container details labels | email-body |
| 21–25 | shutdown impact bullets | email-body |
| 27–29 | `ADD CREDITS NOW` / `Visit:` | email-body |
| 31–34 | `QUICK COST REFERENCE` block | email-body |
| 37 | `Questions? Reply to this email or visit your dashboard:` | email-body |
| 39 | `© {{currentYear}} Eliza Cloud. All rights reserved.` | legal-footer |
| 41 | `You received this urgent alert because your container "{{containerName}}" is scheduled for shutdown due to insufficient credits.` | legal-footer |

---

## 2. SEO constants and metadata

### 2.1 `src/lib/seo/constants.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 5 | `siteName: "Eliza Cloud"` | seo-title / brand | Y (used in OG site_name, JSON-LD `name`, document title suffix) |
| 6 | `twitterHandle: "@elizaos"` | brand | Y |
| 7 | `defaultTitle: "Eliza Cloud - Hosted Runtime and Dashboard for Eliza Agents"` | seo-title | Y |
| 8–9 | `defaultDescription: "Run your agent instantly in the cloud. Chat, deploy and manage Eliza agents, connect app devices, manage API access and billing, and upgrade to ElizaOS for full device control."` | seo-description | Y |
| 10–21 | `defaultKeywords: ["AI", "agents", "elizaOS", "platform", ...]` | seo-description | Y (rendered in `<meta name="keywords">`) |
| 27 | `locale: "en_US"` | seo-title | Y (hardcoded — explicit i18n problem) |
| 33–134 | `ROUTE_METADATA` — full per-route English `title` + `description` + `keywords` for `home`, `dashboard`, `containers`, `eliza`, `characterCreator`, `myAgents`, `textGeneration`, `imageGeneration`, `videoGeneration`, `voiceCloning`, `apiExplorer`, `billing`, `apiKeys`, `analytics`, `storage`, `gallery`, `account` | seo-title / seo-description | Y |

### 2.2 `src/lib/seo/metadata.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 53 | `` title: `${options.title} | ${SEO_CONSTANTS.siteName}` `` | seo-title (pipe-suffix pattern) | Y |
| 129 | `` title = `${name} - Container Details` `` | seo-title | Y |
| 131–132 | `` `View logs, metrics, and deployment history for ${name}...` `` | seo-description | Y |
| 167 | `` `${name} - AI Character` `` | seo-title | Y |
| 168 | `keywords: [name, "AI character", "AI agent", "elizaOS", ...tags]` | seo-description | Y |
| 192 | `` `Chat with ${characterName}` `` | seo-title | Y |
| 193 | `` `${messageCount} message${...} in this conversation with ${characterName}` `` | seo-description | Y |
| 198 | `keywords: [characterName, "AI chat", "conversation", "elizaOS"]` | seo-description | Y |

### 2.3 `src/lib/seo/environment.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 4 | `DEFAULT_INDEXABLE_HOSTS = ["elizacloud.ai", "www.elizacloud.ai"]` | brand domain | N directly, but controls robots `index: true` |

### 2.4 `src/lib/seo/schema.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 20–21 | Organization JSON-LD `name`/`description` use `SEO_CONSTANTS.siteName` / `defaultDescription` | seo-title / seo-description | Y |
| 24 | `sameAs: ["https://twitter.com/elizaos", "https://github.com/elizaos"]` | brand | Y |
| 27 | `contactType: "Customer Support"` | seo-description | Y |
| 44–45 | WebApplication JSON-LD `name`/`description` | seo-title / seo-description | Y |
| 47 | `applicationCategory: "DeveloperApplication"` | seo-description | Y |
| 53 | `description: "Pay-as-you-go credit system"` | seo-description | Y |
| 56–62 | featureList: `"AI Text Generation"`, `"AI Image Generation"`, `"AI Video Generation"`, `"Voice Cloning"`, `"elizaOS Agent Runtime"`, `"Container Deployment"`, `"API Access"` | seo-description | Y |
| 80 | default `category = "AI Agent"` | seo-description | Y |

---

## 3. Stripe / x402 product naming

### 3.1 `src/lib/services/topup-handler.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 243 | `` description: `Eliza Cloud credit top-up: $${amount}` `` (payment requirement description, returned to x402 client) | stripe-product / api-error | Y (rendered in x402 payment client UI) |
| 248 | `name: "Eliza Cloud Credits"` (x402 `extra` block, presented to payer) | stripe-product | Y |
| 410 | `` description: `x402 wallet top-up: $${amount}` `` (credit ledger entry — surfaces in user's billing history UI) | transactional-copy | Y |
| 443 | `` `${split.role === "app_owner" ? "App Owner" : "Creator"} revenue share (${...}%) for $${amount} crypto topup` `` (earnings ledger description) | transactional-copy | Y |
| 472 | `` message: `Successfully topped up $${amount}` `` (response body) | api-error | Y |

### 3.2 `src/lib/services/payment-adapters/stripe.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 95 | `` const productName = meta.productName ?? request.reason ?? "Payment" `` (fallback product name on Stripe Checkout) | stripe-product | Y (shown on Stripe-hosted checkout page) |
| 105 | `name: productName` → passes to `product_data.name` | stripe-product | Y |
| 106 | `description: meta.productDescription` → passes to `product_data.description` | stripe-product | Y |

Note: `productName`/`productDescription` are sourced from request `metadata.product_name` / `metadata.product_description`. Callers decide the string; if they don't, the user sees `"Payment"` or the raw `reason`.

### 3.3 `src/lib/services/app-charge-requests.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 369 | `` name: `${app.name} Credits` `` (Stripe `product_data.name` for in-app credit purchase) | stripe-product | Y |
| 370 | `` description: request.description ?? `$${request.amountUsd} credits for ${app.name}` `` | stripe-product | Y |

### 3.4 `src/lib/services/auto-top-up.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 238 | `` description: `Auto top-up - $${totalAmount.toFixed(2)}` `` (Stripe PaymentIntent description; appears on receipt and card statement narrative) | stripe-product | Y |
| 323 | `let paymentMethodDisplay = "Card on file";` (fallback when payment-method retrieval has no card) | transactional-copy | Y (appears in auto-top-up email) |

Stripe also has a `statement_descriptor` field (regulated, max 22 chars, governed by Stripe's rules). It is **not** currently set anywhere in cloud-shared; the descriptor seen on cardholder statements is whatever is configured on the Stripe account itself. Per-locale statement descriptors are infeasible (the regulator-imposed character set is ASCII, and the descriptor must be stable for chargeback handling). Flag in plan.

### 3.5 `src/lib/services/crypto-payments.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 268 | `` description: description ?? `Credit purchase - $${amount}` `` (OxaPay invoice description shown on hosted payment page) | stripe-product (provider-agnostic) | Y |
| 621, 980 | `` `Crypto payment (${payCurrency} on ${payment.network})` `` (credit transaction description) | transactional-copy | Y |
| 1076–1078 | `` `${role === "app_owner" ? "App Owner" : "Creator"} revenue share (${pct}%) for crypto payment $${purchaseAmount}` `` | transactional-copy | Y |

### 3.6 `src/lib/providers/openrouter.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 43 | `"X-Title": "Eliza Cloud"` (OpenRouter request header — appears in OpenRouter's dashboard, not end-user-visible) | brand / external | N (third-party operator surface) |

---

## 4. cloud-api bootstrap & A2A platform card

### 4.1 `eliza/packages/cloud-api/src/bootstrap-app.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 85 | `hostname === "x402.elizacloud.ai" || hostname === "x402.elizaos.ai"` (root response branch) | brand domain | Y (root JSON payload) |
| 87 | `name: "eliza-x402"` | api-error / discovery body | Y |
| 88 | `description: "Eliza Cloud x402 facilitator"` | api-error | Y |
| 97 | `name: "eliza-cloud-api"` | api-error | Y |
| 98 | `description: "Eliza Cloud API"` | api-error | Y |
| 99 | `docs: "https://elizacloud.ai/docs"` | brand domain | Y |
| 110 | `error: "Not found"` (404 body) | api-error | Y |

### 4.2 `src/lib/swagger/openapi-generator.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 313 | `title: "Eliza Cloud API"` | seo-title (rendered by swagger-ui clients) | Y |
| 314–315 | `description: "AI agent development platform with multi-model text generation, image creation, and enterprise features"` | seo-description | Y |
| 318 | `contact.name: "Eliza Cloud"` | api-error | Y |
| 319 | `contact.url: "https://www.elizacloud.ai"` | brand domain | Y |
| 324 | `servers[0].url: "https://www.elizacloud.ai"` (fallback when caller did not pass `baseUrl`) | brand domain | Y |
| 325 | `description: "Production server"` | api-error | Y |
| 335 | `description: "Steward session authentication"` | api-error | Y |
| 341 | `description: "API Key authentication (Bearer <key>)"` | api-error | Y |

### 4.3 `src/lib/api/a2a/platform-cloud.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 32 | `name: "Eliza Cloud"` (agent card returned by `/api/a2a` discovery) | api-error / transactional-copy | Y |
| 33–34 | `description: "Cloud platform agent for account, credits, billing, apps, agents, MCPs, containers, and admin operations."` | api-error / transactional-copy | Y |
| 37 | `provider.organization: "Eliza Cloud"` | api-error | Y |
| 48 | `schemes[0].description: "Eliza API key or Steward bearer token"` | api-error | Y |
| 49 | `schemes[1].description: "X-Wallet-* per-request signature headers"` | api-error | Y |
| 213 | `` createTextPart(`Completed ${skill}`) `` (synthetic A2A agent reply text) | api-error / transactional-copy | Y |
| 223 | `` `Result for ${skill}` `` (artifact name) | transactional-copy | Y |
| 262 | `createTextPart("Task canceled")` | transactional-copy | Y |
| 236, 251, 255, 264, 286 | error messages: `` `Task not found: ${id}` ``, `` `Task ${id} is already in terminal state...` ``, `` `Unsupported A2A method: ${request.method}` `` | api-error | Y |

---

## 5. Steward / wallet auth

### 5.1 `src/lib/steward-url.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 29–33 | `ELIZA_CLOUD_PROXIED_HOSTS = ["elizacloud.ai","www.elizacloud.ai","dev.elizacloud.ai"]` | brand domain | N (routing only, but coupled to brand) |
| 34 | `ELIZA_CLOUD_DIRECT_API = "https://api.elizacloud.ai"` | brand domain | N |
| 88–90 | `throw new Error("Steward API URL is not configured. Set STEWARD_API_URL, ...")` | api-error | Y (only seen by ops, not real users) — treat as developer error |

### 5.2 `src/lib/auth/wallet-auth.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 28 | `throw new Error("Invalid wallet address format")` | api-error | Y |
| 34 | `throw new Error("Invalid timestamp format")` | api-error | Y |
| 39 | `throw new Error("Signature timestamp expired")` | api-error | Y |
| 51 | `throw new Error("Service temporarily unavailable")` | api-error | Y |
| 54 | `` `Eliza Cloud Authentication\nTimestamp: ${...}\nMethod: ${...}\nPath: ${...}` `` — this is **the message the user signs in their wallet**. Treated as a brand string. | api-error / brand | Y (visible in wallet signing prompt) |
| 65 | `throw new Error("Invalid wallet signature")` | api-error | Y |
| 71 | `throw new Error("Signature has already been used")` | api-error | Y |
| 83 | `throw new Error("User account is inactive")` | api-error | Y |
| 86 | `throw new Error("Organization is inactive")` | api-error | Y |

---

## 6. Eliza managed launch / agent defaults

### 6.1 `src/lib/services/eliza-managed-launch.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 104 | `` `Failed to read onboarding status (HTTP ${...})` `` | api-error | Y (bubbled to launch UI) |
| 118 | `name: sandbox.agent_name?.trim() || "Agent"` | api-error / transactional-copy | Y (default agent name) |
| 121 | `bio: ["An autonomous AI agent running on Eliza Cloud."]` | transactional-copy | Y (default agent bio used during managed onboarding) |
| 122 | `` systemPrompt: `You are ${sandbox.agent_name?.trim() || "Agent"}, an autonomous AI agent running on Eliza Cloud.` `` | transactional-copy / system-prompt | Y (becomes the agent's system prompt — influences user-visible behavior) |
| 142–144 | `` `Failed to bootstrap managed onboarding (HTTP ${...})...` `` | api-error | Y |
| 181 | `throw new ManagedElizaLaunchError("Agent not found", 404)` | api-error | Y |
| 203–204 | `shutdownResult.error || "Failed to refresh sandbox environment"` | api-error | Y |
| 215–216 | `provisionResult.error || "Provisioning failed"` | api-error | Y |
| 222 | `"Provisioning failed"` | api-error | Y |
| 230–232 | `"Managed launch is unavailable because no agent web endpoint is configured"` | api-error | Y |
| 249 | `agentName: sandbox.agent_name ?? "Agent"` | transactional-copy | Y |
| 285–287 | `"Managed launch is unavailable because the session cache is unreachable."` | api-error | Y |

### 6.2 `src/lib/services/managed-eliza-config.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 5 | `DEFAULT_ELIZA_APP_URL = "https://eliza.app"` | brand domain | N (URL, not displayed) |
| 6 | `DEFAULT_CLOUD_PUBLIC_URL = "https://www.elizacloud.ai"` | brand domain | N |

---

## 7. Other user-facing surfaces

### 7.1 `src/lib/services/discord.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 292, 636, 827, 852, 891 | `footer.text: "Eliza Cloud"` (Discord embed footer) | brand | N (admin internal observability) — flag but de-prioritize |

### 7.2 `eliza/packages/cloud-api/v1/twilio/voice/inbound/route.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 41–42 | `INITIAL_PROMPT = "Hi, you're connected to Eliza. What would you like to work on?"` | transactional-copy (TwiML `<Say>` heard by phone caller) | Y |
| 43–44 | `NOT_CONFIGURED_PROMPT = "This phone number is not configured for voice yet. Please check the Eliza Cloud control panel."` | transactional-copy | Y |
| 45 | `NO_SPEECH_PROMPT = "I didn't catch that. Please say that again."` | transactional-copy | Y |
| 46–47 | `EMPTY_AGENT_REPLY = "I heard you, but I don't have a response yet. Please try again."` | transactional-copy | Y |

### 7.3 `src/lib/services/eliza-app/onboarding-chat.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 67 | `DEFAULT_ONBOARDING_APP_URL = "https://app.elizacloud.ai"` | brand domain | N |

### 7.4 `src/lib/services/invites.ts`

Validation errors thrown from the invite flow — these reach the API client as `{ error: <msg> }`.

| Lines | String | Category | User-facing |
|---|---|---|---|
| 74 | `"Invalid role. Must be 'admin' or 'member'"` | api-error | Y (validation; should be schema-driven) |
| 79 | `"User is already a member of this organization"` | api-error | Y |
| 85 | `"An invite for this email is already pending"` | api-error | Y |
| 128 | `error: "Invalid invite"` | api-error | Y |
| 145 | `error: "Invite expired"` | api-error | Y |
| 161 | `"User not found"` | api-error | Y |
| 169 | `"You are already a member of this organization"` | api-error | Y |
| 187 | `"Failed to mark invite as accepted"` | api-error | Y |
| 197 | `"Invite not found"` | api-error | Y |
| 201 | `"Invite does not belong to this organization"` | api-error | Y |
| 205 | `"Can only revoke pending invites"` | api-error | Y |
| 211 | `"Failed to revoke invite"` | api-error | Y |

### 7.5 `src/lib/services/payment-methods.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 50 | `"Failed to create payment customer. Please try again."` | api-error | Y |
| 67, 110, 165 | `"Organization not found"` | api-error | Y |
| 114 | `"Organization does not have a Stripe customer. Please contact support."` | api-error | Y |
| 121 | `"Payment method does not belong to this customer"` | api-error | Y |

### 7.6 `src/lib/services/credits.ts`

User-facing validation/error strings thrown into HTTP responses.

| Lines | String | Category | User-facing |
|---|---|---|---|
| 269, 278, 342 | `"Organization not found"` | api-error | Y |
| 405 | `"Amount must be positive"` | api-error | Y |
| 665 | `"Refund amount must be positive"` | api-error | Y |
| 729 | `` `${description} (refund)` `` (ledger description fragment composed at write time; affects user-visible billing history when caller-supplied description is English) | transactional-copy | Y |
| 754 | `` `${description} (overage)` `` | transactional-copy | Y |
| 867 | `` `${description} (reserved)` `` | transactional-copy | Y |

### 7.7 `src/lib/services/signup-code.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 17 | `INVALID_CODE: "Invalid signup code"` | api-error | Y |
| 18 | `ALREADY_USED: "Your account has already used a signup code"` | api-error | Y |
| 93 | `description: "Signup code bonus"` (ledger description) | transactional-copy | Y |

### 7.8 `src/lib/services/auto-top-up.ts`

| Lines | String | Category | User-facing |
|---|---|---|---|
| 51 | `"Auto top-up settings must be valid numbers"` | api-error | Y |
| 132, 136 | `"Missing Stripe customer"` (disable reason — embedded in `auto-top-up-disabled` email body via `reason` template variable) | api-error / email-body | Y |
| 270, 274 | `` `Payment ${paymentIntent.status}` `` (disable reason; same path as above) | api-error / email-body | Y |
| 323 | `"Card on file"` (payment-method fallback display in email) | email-body | Y |
| 391, 413 | `"Organization not found"` | api-error | Y |

### 7.9 `src/lib/services/app-credits.ts`

Ledger descriptions composed at billing time that surface in the user's transaction history UI.

| Lines | String | Category | User-facing |
|---|---|---|---|
| 353 | `description: "Credit purchase (monetization disabled)"` | transactional-copy | Y |
| 426 | `` description: description ?? `App inference (${app.name ?? appId})` `` | transactional-copy | Y |
| 585 | `` `App reconciliation refund (${app.name ?? appId})` `` | transactional-copy | Y |
| 646 | `` `App reconciliation charge (${app.name ?? appId})` `` | transactional-copy | Y |
| 907 | `"Reconciliation adjustment (refund)"` | transactional-copy | Y |
| 922 | `` `Reconciliation adjustment for app: ${app.name || appId}` `` | transactional-copy | Y |

---

## 8. Summary count

Rough counts of distinct hardcoded English string sites by category:

| Category | Approx count |
|---|---|
| email-subject | 7 distinct subjects |
| email-body | ~140 distinct strings across 10 templates + 2 inline renderers |
| seo-title | 18 (`siteName` + `defaultTitle` + 17 route titles + 4 dynamic-page title patterns) |
| seo-description | 25 (`defaultDescription`, `defaultKeywords`, 17 route descriptions + keywords, 4 dynamic-page descriptions, JSON-LD descriptions) |
| stripe-product | 6 product/description sites (topup-handler, stripe adapter, app-charge-requests, auto-top-up, crypto-payments x2) |
| api-error | ~50 sites across `wallet-auth`, `eliza-managed-launch`, `invites`, `credits`, `payment-methods`, `signup-code`, `bootstrap-app`, A2A platform |
| transactional-copy | ledger descriptions in `credits.ts`, `app-credits.ts`, `crypto-payments.ts`, `topup-handler.ts`, `auto-top-up.ts`; TwiML voice prompts; A2A artifact names; managed-launch agent default name + bio + system prompt |
| legal-footer | per-template copyright + "received this because..." + privacy/terms links + support email (`support@eliza.cloud`) + Discord/X/GitHub links |
| brand domain | `elizacloud.ai`, `dev.elizacloud.ai`, `www.elizacloud.ai`, `api.elizacloud.ai`, `blob.elizacloud.ai`, `app.elizacloud.ai`, `apps.elizacloud.ai`, `x402.elizacloud.ai`, `containers.elizacloud.ai`, `eliza.app` — partially behind env vars, partially hardcoded as fallbacks |

The big-ticket items: the 10 email templates (locale + brand), `SEO_CONSTANTS` + `ROUTE_METADATA` (locale + brand), the `noreply@elizacloud.ai` sender, and the Stripe checkout `product_data.name` strings. The TwiML phone-call prompts are a separate axis (voice-only — must be locale-aware to be usable for non-English speakers).
