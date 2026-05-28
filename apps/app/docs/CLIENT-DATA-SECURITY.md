# Client Data Security

Where client-side data lives and which package owns its encryption.

## SecureStore (this package — `apps/app/src/secure-store/`)

Holds the small set of values that must be encrypted at rest in the client:

- `eliza.device.auth` — device auth token
- `eliza.device.identity` — device identifier
- `eliza.control.settings.v1` — user-configurable settings (may contain
  per-connector secrets)
- `eliza.security.vision-consent.v1` — vision-feature consent record

Backend selection at runtime:

| Surface       | Backend                                | Encrypted at rest |
| ------------- | -------------------------------------- | ----------------- |
| iOS / Android | Capacitor SecureStorage plugin         | Yes (Keychain / AndroidKeyStore) |
| Desktop       | Electrobun keychain bridge             | Yes (OS keychain) |
| Browser       | WebCrypto AES-GCM + PBKDF2 passphrase  | Yes (passphrase-locked) |
| Tests         | In-memory                              | No                |

A one-time migration moves any legacy plaintext values out of
`localStorage` and into the SecureStore on first launch (see
`src/secure-store/migration.ts`).

## PGlite / conversation history (`@elizaos/app-core` — not in this package)

The local PGlite database that holds conversation history is provisioned
and owned by `@elizaos/app-core`. Column-level encryption of sensitive
columns is **owned by the `app-core` runtime maintainers** and is out of
scope for `apps/app`.

For SOC2 L-6, the planned approach is:

1. Use `@elizaos/security`'s `userKey(userId, "client-data")` to derive an
   AES-256-GCM column key per user.
2. Encrypt at write-time in the runtime layer; decrypt at read-time.
3. For searchable columns, introduce an HMAC-based blind index. TODO
   tracked by the app-core agent — must be designed before encrypting
   columns we still want to query.

If a future change in `apps/app` introduces a separate, app-local PGlite
instance (rather than going through the runtime), that data goes through
the same encryption envelope and gets a feature-flag rollout.

## PTY-spawned sub-agents (client side — partial)

Where the desktop client spawns its own sub-coding-agents through PTY,
the same allowlist / cwd-validation / binary-path-whitelist controls as
the server-side fix in audit A-3 apply. Implementation lives in
`@elizaos/plugin-sub-agent-claude-code` (owned by the agent-runtime
agent); `apps/app` re-uses that package transparently.

Resource limits applied by the client-side wrapper:

- Per-session wall-clock cap (default 30 min).
- Spawn audit emit via `emitClientAudit({ action: "agent.spawn", ... })`.
- CPU/memory caps where the host OS exposes them (macOS `sandbox-exec`,
  Linux cgroups via the Electrobun host helper).

## Dev endpoints in prod builds

`/api/dev/stack`, `/api/dev/cursor-screenshot`, `/api/dev/console-log` are
loopback-only at the server (verified — `eliza/packages/app-core/src/api/dev-stack.ts`).
The build-time guard `scripts/prod-bundle-dev-endpoint-guard.mjs` ensures no
production bundle in `apps/app/dist` references these endpoints.
