# Onboarding Contracts

The wire contract for first-run flow in Milady. Anything here changing is a breaking change — bump tests and the QA matrix in lockstep.

All file paths are relative to the Milady repo root. Source lives under `eliza/` when running in `local` mode and under the published `@elizaos/*` packages in `packages` mode; line numbers here reference the `eliza/` checkout used to author this doc (2026-05-10).

## 1. State keys

### localStorage (browser/desktop)

Defined in [packages/ui/src/platform/onboarding-reset.ts](../eliza/packages/ui/src/platform/onboarding-reset.ts) and [packages/ui/src/state/persistence.ts](../eliza/packages/ui/src/state/persistence.ts):

- `eliza:onboarding-complete` — key constant defined at [persistence.ts:374](../eliza/packages/ui/src/state/persistence.ts#L374) (`ONBOARDING_COMPLETE_STORAGE_KEY`). Reader `loadPersistedOnboardingComplete()` at [persistence.ts:376-388](../eliza/packages/ui/src/state/persistence.ts#L376) treats only `"1"` as completed. Writer `savePersistedOnboardingComplete()` at [persistence.ts:391-407](../eliza/packages/ui/src/state/persistence.ts#L391) writes `"1"` on `complete === true` and removes the key on `complete === false`. The reset path at [onboarding-reset.ts:11](../eliza/packages/ui/src/platform/onboarding-reset.ts#L11) and [onboarding-reset.ts:93](../eliza/packages/ui/src/platform/onboarding-reset.ts#L93) clears the same key when `?reset` is in the URL.
  - The literal value is **`"1"`**, not `"true"`. No writer in the repo writes `"true"` — earlier QA docs that claimed `"true"` were incorrect.
- `eliza:onboarding:step` — current wizard step (`deployment | providers | features`). Defined as `ONBOARDING_STEP_STORAGE_KEY` in [persistence.ts:312](../eliza/packages/ui/src/state/persistence.ts#L312); written by `saveOnboardingStep()` ([persistence.ts:360](../eliza/packages/ui/src/state/persistence.ts#L360)); cleared on reset at [onboarding-reset.ts:91](../eliza/packages/ui/src/platform/onboarding-reset.ts#L91).
- `eliza:onboarding-step` — `LEGACY_ONBOARDING_STEP_STORAGE_KEY` in [onboarding-reset.ts:10](../eliza/packages/ui/src/platform/onboarding-reset.ts#L10). Removed on reset; kept for back-compat reads.
- `elizaos:active-server` — `ACTIVE_SERVER_STORAGE_KEY` in [onboarding-reset.ts:8](../eliza/packages/ui/src/platform/onboarding-reset.ts#L8) and [persistence.ts:853](../eliza/packages/ui/src/state/persistence.ts#L853). Holds the persisted `PersistedActiveServer` (kind: `local | cloud | remote | …`, `apiBase`, `accessToken`). Cleared on reset.
- `elizaos:onboarding:force-fresh` — `FORCE_FRESH_ONBOARDING_STORAGE_KEY` in [onboarding-reset.ts:12](../eliza/packages/ui/src/platform/onboarding-reset.ts#L12). Set to `"1"` after a `?reset` to short-circuit subsequent `getOnboardingStatus()` / `getConfig()` calls until the next `submitOnboarding()` clears it. See `installForceFreshOnboardingClientPatch()` at [onboarding-reset.ts:114](../eliza/packages/ui/src/platform/onboarding-reset.ts#L114).
- `elizaos_api_base` (localStorage + sessionStorage) — removed on reset at [onboarding-reset.ts:102-104](../eliza/packages/ui/src/platform/onboarding-reset.ts#L102).
- `eliza:mobile-runtime-mode` — `MOBILE_RUNTIME_MODE_STORAGE_KEY` in [packages/ui/src/onboarding/mobile-runtime-mode.ts:4](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L4). Values: `"remote-mac" | "cloud" | "cloud-hybrid" | "local"`. Read at boot to pick `elizacloud` vs `elizacloud-hybrid` server target ([useOnboardingState.ts:173](../eliza/packages/ui/src/state/useOnboardingState.ts#L173), [onboarding-resume.ts:74](../eliza/packages/ui/src/state/onboarding-resume.ts#L74)).

The reset query param itself is `?reset` ([onboarding-reset.ts:13](../eliza/packages/ui/src/platform/onboarding-reset.ts#L13)).

### Capacitor / native (iOS, Android)

Mirror of `eliza:mobile-runtime-mode` is written through `@capacitor/preferences` at [mobile-runtime-mode.ts:68-88](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L68). No-op on non-native shells.

### Runtime provider state

- `firstRunPending: boolean` — surfaced in `values` by [plugins/app-lifeops/src/providers/first-run.ts:108-112](../eliza/plugins/app-lifeops/src/providers/first-run.ts#L108). Goes `false` (the `QUIET_RESULT` constant at [first-run.ts:33-37](../eliza/plugins/app-lifeops/src/providers/first-run.ts#L33)) once `createFirstRunStateStore(runtime).read()` returns `status === "complete"` ([first-run.ts:94-96](../eliza/plugins/app-lifeops/src/providers/first-run.ts#L94)). Position `-10`, planner-only — exposes no action.
- `firstRunStatus` and `firstRunPath` are emitted alongside when pending ([first-run.ts:110-111](../eliza/plugins/app-lifeops/src/providers/first-run.ts#L110)).

Backing store path / file: // TBD verify against `plugins/app-lifeops/src/lifeops/first-run/state.js` (`createFirstRunStateStore`).

### Filesystem

- `~/.eliza/eliza.json` — primary on-disk config. Written via `saveElizaConfig(...)` from `@elizaos/agent`. Cloud routes log the path explicitly at [cloud-routes.ts:217](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L217).
- `meta.onboardingComplete = true` is set on this config by [onboarding-compat-routes.ts:238](../eliza/packages/app-core/src/api/onboarding-compat-routes.ts#L238).
- `config.cloud.apiKey` — cloud API key in cleartext; warning logged at [cloud-routes.ts:216-219](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L216).
- `<stateDir>/config.env` — `persistConfigEnv()` at [plugins/plugin-elizacloud/src/lib/config-env.ts:123](../eliza/plugins/plugin-elizacloud/src/lib/config-env.ts#L123) writes key/value pairs atomically (0600). Keys must match `/^[A-Z][A-Z0-9_]*$/` ([config-env.ts:8](../eliza/plugins/plugin-elizacloud/src/lib/config-env.ts#L8)) and are blocked if in `BLOCKED_CONFIG_ENV_KEYS` ([config-env.ts:10-32](../eliza/plugins/plugin-elizacloud/src/lib/config-env.ts#L10)) — `PATH`, `NODE_OPTIONS`, dynamic-linker hijack vectors, proxy vars, etc. Cloud-related writes use this for `ELIZAOS_CLOUD_API_KEY`, `ELIZAOS_CLOUD_ENABLED`, `ELIZA_CLOUD_USER_ID`, `ELIZA_CLOUD_ORGANIZATION_ID` (and their `ELIZAOS_*` aliases). // TBD verify the full set of keys against the call sites of `persistConfigEnv` — `lib/config-env.ts` itself does not enumerate them.
- `<stateDir>` is resolved by `resolveStateDir()` (Milady override defaults to `~/.milady`; elizaOS default is `~/.eliza`). See top-level CLAUDE.md for `MILADY_STATE_DIR` / `ELIZA_STATE_DIR`.

## 2. Step definitions

Canonical step ids: `"deployment" | "providers" | "features"`.

- Type: `OnboardingStep` at [packages/ui/src/state/types.ts:122](../eliza/packages/ui/src/state/types.ts#L122).
- Step metadata array `ONBOARDING_STEPS` at [types.ts:131-147](../eliza/packages/ui/src/state/types.ts#L131) — each has `id`, an i18n `name` key (`onboarding.stepName.<id>`), and an i18n `subtitle` key (`onboarding.stepSub.<id>`).
- Linear order resolution lives in [packages/ui/src/onboarding/flow.ts](../eliza/packages/ui/src/onboarding/flow.ts):
  - `getStepOrder()` ([flow.ts:27](../eliza/packages/ui/src/onboarding/flow.ts#L27)) returns `ONBOARDING_STEPS.map(s => s.id)`.
  - `resolveOnboardingNextStep` / `resolveOnboardingPreviousStep` ([flow.ts:40-60](../eliza/packages/ui/src/onboarding/flow.ts#L40)).
  - `canRevertOnboardingTo` ([flow.ts:67](../eliza/packages/ui/src/onboarding/flow.ts#L67)) — forward jumps via the sidebar are explicitly disallowed.
  - `getOnboardingNavMetas(currentStep, cloudOnly)` ([flow.ts:80-88](../eliza/packages/ui/src/onboarding/flow.ts#L80)) — drops `deployment` when `cloudOnly === true` or `canRunLocal() === true`.
  - `shouldSkipFeaturesStep` ([flow.ts:102](../eliza/packages/ui/src/onboarding/flow.ts#L102)) — currently always `false`.
  - `shouldUseCloudOnboardingFastTrack` ([flow.ts:109](../eliza/packages/ui/src/onboarding/flow.ts#L109)).

Onboarding mode (separate axis from step): `OnboardingMode = "basic" | "advanced" | "elizacloudonly"` ([types.ts:149](../eliza/packages/ui/src/state/types.ts#L149)). Default is `"basic"` (state initial at [useOnboardingState.ts:224](../eliza/packages/ui/src/state/useOnboardingState.ts#L224)).

Initial step selection ([useOnboardingState.ts:208-216](../eliza/packages/ui/src/state/useOnboardingState.ts#L208)):
- Reads persisted step from localStorage.
- Else: if `canRunLocal()` (desktop / dev), starts at `"providers"`. Otherwise `"deployment"`.
- If persisted step is `"deployment"` and `canRunLocal()`, it is upgraded to `"providers"`.

Resume-from-config: `inferOnboardingResumeStep` ([onboarding-resume.ts:40](../eliza/packages/ui/src/state/onboarding-resume.ts#L40)) returns `"providers"` if a partial connection config is present, otherwise `"deployment"`.

## 3. HTTP routes

All routes below are served by the local Eliza API (default port `31337`, env `MILADY_API_PORT`). Authentication is gated through `ensureRouteAuthorized` (cookie session, bearer, or trusted-loopback) unless noted.

### `POST /api/onboarding` — submit onboarding payload

Handler: [packages/app-core/src/api/onboarding-compat-routes.ts:160](../eliza/packages/app-core/src/api/onboarding-compat-routes.ts#L160) (`handleOnboardingCompatRoute`).

Request body (JSON; legacy keys rejected with 400 — `LEGACY_ONBOARDING_REQUEST_KEYS` at [server-onboarding-compat.ts:86-95](../eliza/packages/app-core/src/api/server-onboarding-compat.ts#L86)):

```ts
interface OnboardingRequestBody {
  // Identity / agent defaults (persisted by persistCompatOnboardingDefaults).
  name?: string;
  language?: string;            // normalized via normalizeCharacterLanguage
  presetId?: string;            // style preset id
  avatarIndex?: number;
  bio?: string[];
  systemPrompt?: string;
  style?: { all?: string[]; chat?: string[]; post?: string[] };
  adjectives?: string[];
  topics?: string[];
  postExamples?: unknown[];
  messageExamples?: unknown[];

  // Canonical onboarding shape (replaces the legacy keys).
  deploymentTarget?: DeploymentTargetConfig;   // @elizaos/shared
  linkedAccounts?: LinkedAccountFlagsConfig;   // @elizaos/shared
  serviceRouting?: ServiceRoutingConfig;       // @elizaos/shared
  credentialInputs?: OnboardingCredentialInputs; // @elizaos/shared

  // Forbidden legacy keys (cause 400):
  // connection, runMode, cloudProvider, provider, providerApiKey,
  // primaryModel, smallModel, largeModel
}
```

Response: `200 { ok: true }` on success; `400 { error }` for legacy bodies / parse failures.

Side effects: `extractAndPersistOnboardingApiKey()` + `persistCompatOnboardingDefaults()` mutate `eliza.json`; `meta.onboardingComplete = true` is forced ([onboarding-compat-routes.ts:235-238](../eliza/packages/app-core/src/api/onboarding-compat-routes.ts#L235)). A loopback `PUT /api/config` sync follows.

### `GET /api/onboarding/status`

Handler: [auth-pairing-compat-routes.ts:209-222](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L209).

Response shape:

```ts
{
  complete: boolean;        // hasCompatPersistedOnboardingState(config)
  cloudProvisioned: boolean; // metadata only — see isCloudProvisioned()
}
```

Auth: requires `ensureRouteAuthorized`. The historical "cloud-provisioned skips auth" bypass has been removed (see comment at [auth-pairing-compat-routes.ts:206-208](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L206)).

### `GET /api/auth/status` — public probe

Handler: [auth-pairing-compat-routes.ts:228-280](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L228).

Response shape:

```ts
{
  required: boolean;
  authenticated: boolean;
  loginRequired: boolean;
  bootstrapRequired: boolean;  // required && cloudProvisioned
  localAccess: boolean;
  passwordConfigured: boolean;
  pairingEnabled: boolean;
  expiresAt: number | null;    // ms epoch; null when pairing disabled
}
```

### `GET /api/auth/pair-code` — loopback-only

Handler: [auth-pairing-compat-routes.ts:285-297](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L285). Returns `{ code, expiresAt }`. `403` for non-loopback callers, `503` if pairing not enabled.

### `POST /api/auth/pair`

Handler: [auth-pairing-compat-routes.ts:300-388](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L300).

Request: `{ code: string }`. Codes accepted in the `XXXX-XXXX-XXXX` form generated at [auth-pairing-compat-routes.ts:74-80](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L74); normalized to uppercase alphanumeric before comparison ([auth-pairing-compat-routes.ts:70](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L70)).

Response: `200 { token: string }` (session id bearer; static-token fallback only when DB unavailable). Errors: `400`, `403`, `410` (expired), `429` (rate-limited), `500`.

Rate limit: 5 attempts per remote address per 10 min window ([auth-pairing-compat-routes.ts:35-36](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L35)).

### `POST /api/auth/bootstrap/exchange`

Handler: [auth-bootstrap-routes.ts:84-223](../eliza/packages/app-core/src/api/auth-bootstrap-routes.ts#L84).

Request: `{ token: string }` — single-use RS256 JWT from the cloud control plane (`ELIZA_CLOUD_BOOTSTRAP_TOKEN`).

Success: `200`

```ts
{ sessionId: string; identityId: string; expiresAt: number /* ms epoch */ }
```

Cookies set on success: `serializeSessionCookie(session)` + `serializeCsrfCookie(session)` ([auth-bootstrap-routes.ts:195-198](../eliza/packages/app-core/src/api/auth-bootstrap-routes.ts#L195)).

Failure: `400` `missing_token`, `401` `auth_required` (with `reason` from `VerifyBootstrapFailureReason`), `429` `rate_limited`, `503` `db_unavailable` / `missing_issuer_env` / `missing_container_env`.

Session TTL: 12 h sliding (`BROWSER_SESSION_TTL_MS` at [auth-bootstrap-routes.ts:38](../eliza/packages/app-core/src/api/auth-bootstrap-routes.ts#L38)).

### `POST /api/cloud/login` — initiate cloud login session

Handler: [routes/cloud-routes-autonomous.ts:310-360](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes-autonomous.ts#L310). Plugin route registration at [plugins/plugin-elizacloud/src/plugin.ts:188](../eliza/plugins/plugin-elizacloud/src/plugin.ts#L188).

Behavior: server-side generates a `sessionId`, POSTs to the cloud `/api/auth/cli-session`, returns the browser URL to open. // TBD verify success-response shape against [cloud-routes-autonomous.ts](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes-autonomous.ts) (only the request side was read).

### `GET /api/cloud/login/status?sessionId=<uuid>`

Handler: [routes/cloud-routes.ts:427-…](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L427) (also autonomous mirror at [routes/cloud-routes-autonomous.ts:377](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes-autonomous.ts#L377)).

Polls `${baseUrl}/api/auth/cli-session/<sessionId>`. On `status === "authenticated"` it calls `persistCloudLoginStatus()` ([cloud-routes.ts:164-314](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L164)) which:
- writes `config.cloud.apiKey`, calls `applyCanonicalOnboardingConfig({ linkedAccounts: { elizacloud: { status: "linked", source: "api-key" } } })`,
- sets `process.env.ELIZAOS_CLOUD_API_KEY` and toggles `ELIZAOS_CLOUD_ENABLED`,
- mirrors keys onto `runtime.character.secrets` + `runtime.setSetting(...)` for `ELIZA_CLOUD_USER_ID`, `ELIZAOS_CLOUD_USER_ID`, `ELIZA_CLOUD_ORGANIZATION_ID`, `ELIZAOS_CLOUD_ORG_ID`.

Disconnect-race guard: a monotonic `cloudDisconnectEpoch` ([cloud-routes.ts:113-121](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L113)) is sampled before the poll and re-checked before persist — an in-flight login is discarded if `POST /api/cloud/disconnect` fires meanwhile.

Errors: `400` (missing `sessionId` or invalid base URL), `502` (unreachable / redirect), `504` (timeout).

Response shape (success path): // TBD verify against [cloud-routes.ts:480+](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L480) — the success branch was below the read window.

### `POST /api/cloud/login/persist`

Handler: [routes/cloud-routes.ts:400-425](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L400).

Request:

```ts
{ apiKey: string; userId?: string; organizationId?: string }
```

Response: `200 { ok: true }`, `400 { ok: false, error: "apiKey is required" }`, `500 { ok: false, error }`.

Same `persistCloudLoginStatus()` side effects as the poll-success path, with no race guard (direct push).

### `POST /api/cloud/disconnect`

Handler: [routes/cloud-routes.ts:377-395](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L377). Bumps `cloudDisconnectEpoch++`, calls `disconnectUnifiedCloudConnection(...)`. Response `200 { ok: true, status: "disconnected" }` or `500 { ok: false, error }`.

### Cloud-side: `POST /api/auth/cli-session`

Lives on `elizacloud.ai`, not on the local Eliza API. Called by both the CLI (`cloudLogin()` in [plugins/plugin-elizacloud/src/cloud/auth.ts:69](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L69)) and the local cloud-login routes ([cloud-routes-autonomous.ts:326](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes-autonomous.ts#L326)).

- Request: `{ sessionId: string /* uuid */ }`, `redirect: "manual"`. Redirects are treated as errors.
- The browser URL the user opens is `${baseUrl}/auth/cli-login?session=<sessionId>` ([cloud/auth.ts:99](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L99)).
- Polled at `GET ${baseUrl}/api/auth/cli-session/<sessionId>` ([cloud/auth.ts:118](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L118)).
- Poll response (consumed shape):

```ts
{
  status: "pending" | "authenticated" | string;
  apiKey?: string;
  keyPrefix?: string;
  expiresAt?: string;  // ISO
}
```

Default timeouts: 5 min overall (`timeoutMs`), 2 s poll interval, 10 s per-request ([cloud/auth.ts:59-62](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L59)). Single-use semantics: `status === "authenticated"` without `apiKey` is treated as "already retrieved" and forces a retry ([cloud/auth.ts:165-169](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L165)).

### Cloud SSO (separate from CLI session)

Helpers in [services/cloud-auth.ts](../eliza/plugins/plugin-elizacloud/src/services/cloud-auth.ts):

- `getSsoRedirectUrl()` ([cloud-auth.ts:215](../eliza/plugins/plugin-elizacloud/src/services/cloud-auth.ts#L215)) — builds `${ELIZA_CLOUD_ISSUER}/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&scope=openid%20profile&state=…[&eliza_return_to=…]`.
- `exchangeCodeForSession()` ([cloud-auth.ts:322](../eliza/plugins/plugin-elizacloud/src/services/cloud-auth.ts#L322)) — POSTs `${issuer}/oauth/token` with `grant_type=authorization_code`, verifies the returned `id_token` via JWKS (RS256 only).
- Callback URL: `${scheme}://${bindHost}:${port}/api/auth/login/sso/callback` ([cloud-auth.ts:185-196](../eliza/plugins/plugin-elizacloud/src/services/cloud-auth.ts#L185)). // TBD verify the local callback route handler against `app-core/src/api/auth/cloud-sso.ts` (referenced in the file's preamble but not read).
- Required env: `ELIZA_CLOUD_CLIENT_ID`, `ELIZA_CLOUD_CLIENT_SECRET`. Throws if either is missing.

## 4. Cloud pairing state machine

Source: [plugins/plugin-elizacloud/src/onboarding.ts](../eliza/plugins/plugin-elizacloud/src/onboarding.ts) — CLI / first-time-setup orchestration. Each block below names the failing transitions found in the file.

States the orchestrator traverses ([onboarding.ts:238-355](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L238)):

1. **availability-check** — `checkCloudAvailability(baseUrl)` ([onboarding.ts:50-82](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L50)) GETs `${baseUrl}/api/compat/availability`. Failure transitions:
   - Non-2xx → `"Cloud returned HTTP <code>. It may be temporarily unavailable."`
   - `success=false` or `acceptingNewAgents=false` → `"Eliza Cloud is currently at capacity..."`
   - Timeout → `"Could not reach Eliza Cloud (request timed out)..."`
   - Either way, the user is prompted to fall back to local; "yes" → return `null` (caller continues local).
2. **auth-pending** — `runCloudAuth(clack, baseUrl)` ([onboarding.ts:92](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L92)) invokes `cloudLogin()`. On failure the user is offered one retry; second failure → fall back to local.
3. **agent-provisioning** — `provisionCloudAgent(...)` ([onboarding.ts:139](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L139)):
   - `client.createAgent(...)` → polls `client.getAgent(agentId)` every `PROVISION_POLL_INTERVAL_MS = 3_000` ms ([onboarding.ts:40](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L40)).
   - Status transitions observed: `queued → provisioning → running` (or `completed`); terminal failure on `failed | error`.
   - Timeout: `PROVISION_TIMEOUT_MS = 120_000` ms ([onboarding.ts:39](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L39)) — on timeout the agent id is still returned so the user can reconnect later.
4. **running** — final result `{ apiKey, agentId?, baseUrl, bridgeUrl? }` ([onboarding.ts:27-32](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L27)). `agentId` is `undefined` only when provisioning failed but the user declined to fall back to local.

Timeouts and intervals:

- Availability fetch: 10_000 ms ([onboarding.ts:58](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L58)).
- `cloudLogin` overall: 300_000 ms ([onboarding.ts:102](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L102)).
- `cloudLogin` per-request: `DEFAULT_CLOUD_REQUEST_TIMEOUT_MS = 10_000` ms ([cloud/auth.ts:26](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L26)).
- `cloudLogin` poll interval: 2_000 ms ([cloud/auth.ts:62](../eliza/plugins/plugin-elizacloud/src/cloud/auth.ts#L62)).
- Provisioning poll: 3_000 ms / 120_000 ms total ([onboarding.ts:39-40](../eliza/plugins/plugin-elizacloud/src/onboarding.ts#L39)).
- Local-side disconnect-race window: tracked via `cloudDisconnectEpoch` ([cloud-routes.ts:113-121](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L113)).

## 5. Plugin / connector setup contract

Each plugin that needs an out-of-band setup step exports a `Route[]` named `<plugin>SetupRoutes` and registers it with `rawPath: true` (so the leading `/api/<plugin>-…` path is served verbatim). There is no shared request/response schema today — the shapes diverge per plugin.

Representative samples:

### Discord ([plugins/plugin-discord/setup-routes.ts:312-349](../eliza/plugins/plugin-discord/setup-routes.ts#L312))

```ts
export const discordSetupRoutes: Route[] = [
  { type: "GET",  path: "/api/discord-local/status",        handler: handleStatus,        rawPath: true },
  { type: "POST", path: "/api/discord-local/authorize",     handler: handleAuthorize,     rawPath: true },
  { type: "POST", path: "/api/discord-local/disconnect",    handler: handleDisconnect,    rawPath: true },
  { type: "GET",  path: "/api/discord-local/guilds",        handler: handleGuilds,        rawPath: true },
  { type: "GET",  path: "/api/discord-local/channels",      handler: handleChannels,      rawPath: true },
  { type: "POST", path: "/api/discord-local/subscriptions", handler: handleSubscriptions, rawPath: true },
];
```

Has its own data model: post-auth resource browsing (`/guilds`, `/channels`, `/subscriptions`).

### Telegram ([plugins/plugin-telegram/src/setup-routes.ts:234-253](../eliza/plugins/plugin-telegram/src/setup-routes.ts#L234))

```ts
export const telegramSetupRoutes: Route[] = [
  { type: "POST", path: "/api/telegram-setup/validate-token", handler: handleValidateToken, rawPath: true },
  { type: "GET",  path: "/api/telegram-setup/status",         handler: handleStatus,        rawPath: true },
  { type: "POST", path: "/api/telegram-setup/disconnect",     handler: handleDisconnect,    rawPath: true },
];
```

Token-validate pattern only; no post-auth browsing endpoints.

### Signal ([plugins/plugin-signal/src/setup-routes.ts:418-444](../eliza/plugins/plugin-signal/src/setup-routes.ts#L418))

```ts
export const signalSetupRoutes: Route[] = [
  { type: "POST", path: "/api/signal/pair",      handler: handlePair,     rawPath: true },
  { type: "GET",  path: "/api/signal/status",    handler: handleStatus,   rawPath: true },
  { type: "POST", path: "/api/signal/pair/stop", handler: handlePairStop, rawPath: true },
  { type: "POST", path: "/api/signal/disconnect",handler: handleDisconnect, rawPath: true },
];
```

QR-pair pattern — `/pair` / `/pair/stop` semantics; status is also patched into `/api/plugins` results via `applySignalQrOverride()` ([signal/setup-routes.ts:449](../eliza/plugins/plugin-signal/src/setup-routes.ts#L449)).

### Known divergence (to normalize in Stage 1.6)

- Path prefix is per-plugin (`/api/discord-local/`, `/api/telegram-setup/`, `/api/signal/`). No shared `/api/connectors/<id>/...` namespace.
- Discord exposes resource enumeration (`/guilds`, `/channels`, `/subscriptions`); Telegram and Signal don't.
- Signal exposes a pair lifecycle (`/pair`, `/pair/stop`); Discord and Telegram don't.
- All three define their own status response shape. No common `ConnectorStatus` DTO. // TBD verify by reading the handler return shapes — only the route declarations were inspected here.
- All three rely on `rawPath: true`, i.e. the plugin owns the URL.

## 6. Completion markers — invariants

When onboarding "completes", all of the following must be true:

- **localStorage `eliza:onboarding-complete = "1"`** — key constant at [persistence.ts:374](../eliza/packages/ui/src/state/persistence.ts#L374); writer `savePersistedOnboardingComplete()` at [persistence.ts:391-407](../eliza/packages/ui/src/state/persistence.ts#L391); reader `loadPersistedOnboardingComplete()` checks for `"1"` at [persistence.ts:380-382](../eliza/packages/ui/src/state/persistence.ts#L380). No writer in the repo writes `"true"`.
- **`meta.onboardingComplete === true`** in `~/.eliza/eliza.json` — forced on by [onboarding-compat-routes.ts:235-238](../eliza/packages/app-core/src/api/onboarding-compat-routes.ts#L235). `hasCompatPersistedOnboardingState(config)` (used by `GET /api/onboarding/status` at [auth-pairing-compat-routes.ts:215](../eliza/packages/app-core/src/api/auth-pairing-compat-routes.ts#L215)) consumes this. // TBD verify the full predicate against `compat-route-shared.ts`.
- **`firstRunProvider` → `firstRunPending: false`** — provider returns `QUIET_RESULT` once `createFirstRunStateStore(runtime).read().status === "complete"` ([first-run.ts:94-96](../eliza/plugins/app-lifeops/src/providers/first-run.ts#L94)). The transition to `"complete"` happens in the lifeops first-run state store. // TBD verify against `plugins/app-lifeops/src/lifeops/first-run/state.js` (not read).
- **Selected character persisted** — `persistCompatOnboardingDefaults` writes `config.agents.list[0].name | bio | system | style | adjectives | topics | postExamples | messageExamples` and `config.agents.defaults.adminEntityId` ([server-onboarding-compat.ts:202-313](../eliza/packages/app-core/src/api/server-onboarding-compat.ts#L202)). UI mirror lands in `config.ui.assistant.name`, `config.ui.language`, `config.ui.avatarIndex`, `config.ui.presetId`. Path: `~/.eliza/eliza.json` (`saveElizaConfig(config)` at [server-onboarding-compat.ts:311](../eliza/packages/app-core/src/api/server-onboarding-compat.ts#L311)).
- **Selected provider credentials persisted** — `extractAndPersistOnboardingApiKey()` ([server-onboarding-compat.ts:108-200](../eliza/packages/app-core/src/api/server-onboarding-compat.ts#L108)) calls `applyOnboardingCredentialPersistence()` then `saveElizaConfig()`. For cloud-linked installs, `config.cloud.apiKey` is resolved via [onboarding-compat-routes.ts:134-158](../eliza/packages/app-core/src/api/onboarding-compat-routes.ts#L134) (request body → sealed secret → env). `process.env.ELIZAOS_CLOUD_API_KEY` and `process.env.ELIZAOS_CLOUD_ENABLED` are also set when cloud inference is chosen ([cloud-routes.ts:229-234](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L229)).
- **Persisted active server** — localStorage `elizaos:active-server` carries `{ kind, apiBase?, accessToken? }` so subsequent boots route directly through the chosen server ([useOnboardingState.ts:146-196](../eliza/packages/ui/src/state/useOnboardingState.ts#L146)).
- **Step storage cleared / advanced** — `eliza:onboarding:step` reflects the wizard's terminal step until the dashboard transitions away. Setter for `ONBOARDING_COMPLETE_STORAGE_KEY` is `savePersistedOnboardingComplete()` at [persistence.ts:391-407](../eliza/packages/ui/src/state/persistence.ts#L391).

## 7. Mobile runtime mode

Source: [packages/ui/src/onboarding/mobile-runtime-mode.ts](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts).

Modes (`MobileRuntimeMode`, [mobile-runtime-mode.ts:19-23](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L19)):

- `"local"` — bundled on-device agent. Endpoint constants `MOBILE_LOCAL_AGENT_API_BASE = "http://127.0.0.1:31337"`, `MOBILE_LOCAL_AGENT_SERVER_ID = "local:mobile"`, `MOBILE_LOCAL_AGENT_LABEL = "On-device agent"` ([mobile-runtime-mode.ts:11-13](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L11)).
- `"cloud"` — Eliza Cloud, fully managed agent (server target `elizacloud`).
- `"cloud-hybrid"` — Eliza Cloud with on-device handoff (server target `elizacloud-hybrid`). Selected automatically when the persisted mode is `"cloud-hybrid"` ([useOnboardingState.ts:173](../eliza/packages/ui/src/state/useOnboardingState.ts#L173), [onboarding-resume.ts:74](../eliza/packages/ui/src/state/onboarding-resume.ts#L74)).
- `"remote-mac"` — remote desktop runtime (server target `remote`).

Mapping (`mobileRuntimeModeForServerTarget` at [mobile-runtime-mode.ts:40-55](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L40)):

| `OnboardingServerTarget` | `MobileRuntimeMode` |
| --- | --- |
| `"remote"`              | `"remote-mac"` |
| `"elizacloud"`          | `"cloud"` |
| `"elizacloud-hybrid"`   | `"cloud-hybrid"` |
| `"local"`               | `"local"` |
| other                   | `null` |

### Android (`"local"` pre-seed)

Constants `ANDROID_LOCAL_AGENT_API_BASE`, `ANDROID_LOCAL_AGENT_SERVER_ID = "local:android"`, `ANDROID_LOCAL_AGENT_LABEL` ([mobile-runtime-mode.ts:15-17](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L15)) alias the mobile defaults and are pre-seeded so the device routes through loopback to the bundled APK agent on `127.0.0.1:31337`. Pre-seed implementation: // TBD verify against [packages/ui/src/onboarding/pre-seed-local-runtime.ts](../eliza/packages/ui/src/onboarding/pre-seed-local-runtime.ts) (file listed but not read).

### iOS

Same URL shape (`http://127.0.0.1:31337`) is used as a stable client identity. There is no loopback HTTP server on iOS; calls resolve through the in-process ITTP transport. See the comment block at [mobile-runtime-mode.ts:5-14](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L5).

### Persistence

`persistMobileRuntimeModeForServerTarget(target)` ([mobile-runtime-mode.ts:90-112](../eliza/packages/ui/src/onboarding/mobile-runtime-mode.ts#L90)) writes the resolved mode to both `localStorage` (`eliza:mobile-runtime-mode`) and `@capacitor/preferences`, then dispatches `MOBILE_RUNTIME_MODE_CHANGED_EVENT` on `document`. Capacitor failures are swallowed silently (intentional for web/test shells).

---

## Files read while authoring this doc

- `packages/ui/src/state/useOnboardingState.ts`
- `packages/ui/src/state/onboarding-bootstrap.ts`
- `packages/ui/src/state/onboarding-resume.ts`
- `packages/ui/src/state/onboarding-restart.ts`
- `packages/ui/src/state/persistence.ts` (excerpts)
- `packages/ui/src/state/types.ts` (excerpts)
- `packages/ui/src/platform/onboarding-reset.ts` (canonical location — the task spec listed `packages/app-core/src/api/onboarding-reset.ts`, which does not exist in the current tree)
- `packages/ui/src/onboarding-config.ts`
- `packages/ui/src/onboarding/flow.ts`
- `packages/ui/src/onboarding/mobile-runtime-mode.ts`
- `packages/shared/src/onboarding-presets.ts`
- `packages/app-core/src/api/server-onboarding-compat.ts`
- `packages/app-core/src/api/onboarding-compat-routes.ts`
- `packages/app-core/src/api/auth-bootstrap-routes.ts`
- `packages/app-core/src/api/auth-pairing-compat-routes.ts`
- `packages/app-core/src/api/plugins-compat-routes.ts`
- `plugins/plugin-elizacloud/src/onboarding.ts`
- `plugins/plugin-elizacloud/src/cloud/auth.ts`
- `plugins/plugin-elizacloud/src/services/cloud-auth.ts`
- `plugins/plugin-elizacloud/src/lib/config-env.ts`
- `plugins/plugin-elizacloud/src/routes/cloud-routes.ts` (excerpts around persistence + the disconnect/persist/status handlers)
- `plugins/plugin-elizacloud/src/routes/cloud-routes-autonomous.ts` (excerpt: `POST /api/cloud/login` create-session block)
- `plugins/plugin-elizacloud/src/plugin.ts` (route registration table only)
- `plugins/plugin-discord/setup-routes.ts` (route table only)
- `plugins/plugin-telegram/src/setup-routes.ts` (route table only)
- `plugins/plugin-signal/src/setup-routes.ts` (route table + override export)
- `plugins/app-lifeops/src/providers/first-run.ts`

### TBDs

Resolved during the 2026-05-10 onboarding QA campaign:

1. ✅ `eliza:onboarding-complete` is stored as the literal `"1"` (not `"true"`). Setter is `savePersistedOnboardingComplete()` at [persistence.ts:391-407](../eliza/packages/ui/src/state/persistence.ts#L391).
2. ✅ `cloudDisconnectEpoch` lives in [`plugins/plugin-elizacloud/src/routes/cloud-routes.ts:121`](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L121), NOT in `onboarding.ts`. Bumped on `POST /api/cloud/disconnect` at [cloud-routes.ts:379](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L379) and re-checked before persisting login at [cloud-routes.ts:179](../eliza/plugins/plugin-elizacloud/src/routes/cloud-routes.ts#L179).
3. ✅ Android pre-seed lives in [`packages/ui/src/onboarding/pre-seed-local-runtime.ts`](../eliza/packages/ui/src/onboarding/pre-seed-local-runtime.ts), gated by `ElizaOS/<tag>` user-agent detection from the AOSP product build. Stock-Android Capacitor APKs MUST NOT pre-seed (would dead-end on 127.0.0.1:31337).
4. ✅ Setter for `ONBOARDING_COMPLETE_STORAGE_KEY` is `savePersistedOnboardingComplete()` at [persistence.ts:391-407](../eliza/packages/ui/src/state/persistence.ts#L391).

Still unverified:

5. The `firstRunStateStore` backing path/file — `plugins/app-lifeops/src/lifeops/first-run/state.js` was not read.
6. The full set of keys written through `persistConfigEnv()` — file enumerates only the blocklist; the cloud-side set was inferred from `persistCloudLoginStatus`.
7. The cloud SSO callback handler location — `app-core/src/api/auth/cloud-sso.ts` was referenced but not read.
8. The success-response shape of `POST /api/cloud/login` (initiate) — only the request-side block was read.
9. The success-response shape of `GET /api/cloud/login/status` — only failure branches were in the read window.
10. The full predicate of `hasCompatPersistedOnboardingState(config)` — used by `/api/onboarding/status` but its body was not read.
11. The connector setup handler return shapes (Discord / Telegram / Signal) — only the route tables were inspected. Cross-plugin normalization tracked by `plugins/__tests__/setup-routes-contract.test.ts` (Stage 1.6).
12. The exact `VerifyBootstrapFailureReason` union for `POST /api/auth/bootstrap/exchange` — referenced via `verifyBootstrapToken(...)` but its file (`auth/index`) was not read.
13. The `loadPersistedActiveServer` return shape — only the location of the storage key was confirmed.
