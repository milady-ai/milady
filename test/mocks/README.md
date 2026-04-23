# LifeOps External API Mocks

This directory contains Mockoon-compatible environment files that emulate the
external HTTP APIs LifeOps integrates with. Tests serve these files through the
in-process fixture runner in `scripts/start-mocks.ts` and point LifeOps clients
at those local URLs via env vars instead of hitting real services.

## Files

| File                              | Mocks                                | Env var                     |
| --------------------------------- | ------------------------------------ | --------------------------- |
| `environments/twilio.json`        | Twilio Programmable Messaging/Voice  | `MILADY_MOCK_TWILIO_BASE`   |
| `environments/whatsapp.json`      | WhatsApp Business Cloud (Meta Graph) | `MILADY_MOCK_WHATSAPP_BASE` |
| `environments/calendly.json`      | Calendly v2                          | `MILADY_MOCK_CALENDLY_BASE` |
| `environments/x-twitter.json`     | X (Twitter) v2                       | `MILADY_MOCK_X_BASE`        |
| `environments/google.json`        | Gmail / Calendar / OAuth token       | `MILADY_MOCK_GOOGLE_BASE`   |
| `environments/cloud-managed.json` | Eliza Cloud managed-Google endpoints | `ELIZA_CLOUD_BASE_URL`      |

Each LifeOps client reads its env var on import and falls back to the real URL
when unset. These env vars are test-only: the normal `bun run dev` launcher now
strips inherited `MILADY_MOCK_*` values so local development keeps using real
Google/Twilio/etc. unless you opt back in explicitly. See the patched files in
`eliza/apps/app-lifeops/src/lifeops/`:

- `twilio.ts`, `whatsapp-client.ts`, `calendly-client.ts`
- `x-poster.ts`, `x-reader.ts`
- `google-fetch.ts` (rewrites all `*.googleapis.com` + `accounts.google.com`)
- `google-oauth.ts` (token + userinfo go through the same rewrite helper)

## Run mocks in tests

```ts
import { startMocks } from "./scripts/start-mocks.ts";

const mocks = await startMocks({ envs: ["google", "twilio"] });
process.env.MILADY_MOCK_GOOGLE_BASE = mocks.baseUrls.google;
process.env.MILADY_MOCK_TWILIO_BASE = mocks.baseUrls.twilio;
await mocks.stop();
```

Use the dedicated test helpers or test commands for this. Do not export
`MILADY_MOCK_GOOGLE_BASE` in your regular shell before running `bun run dev`
unless you are intentionally debugging the mock path.

## Clean up a polluted dev profile

If the chat sidebar already shows old synthetic Google Calendar rows from a
past mock run:

1. Start the app normally with `bun run dev` so the dev launcher strips any
   leaked `MILADY_MOCK_*` vars.
2. In the app, disconnect the Google LifeOps connector once.
3. Reconnect Google so LifeOps clears the cached mock rows and resyncs from the
   real account.

The Google disconnect flow already clears cached calendar events, Gmail cache,
and sync state for the disconnected connector.

Ports are auto-assigned on `127.0.0.1`. The fixture runner supports the subset
of Mockoon templating used by these files: `{{body 'field'}}`,
`{{urlParam 'id'}}`, `{{faker '...'}}`, and `{{now '...'}}`.

## Run with Mockoon manually

Mockoon is optional for editing or manual inspection of the same JSON files.

```bash
bunx @mockoon/cli start --data test/mocks/environments/twilio.json
# ... or all six in parallel:
bunx @mockoon/cli start \
  --data test/mocks/environments/twilio.json \
  --data test/mocks/environments/whatsapp.json \
  --data test/mocks/environments/calendly.json \
  --data test/mocks/environments/x-twitter.json \
  --data test/mocks/environments/google.json \
  --data test/mocks/environments/cloud-managed.json
```

Then point the clients at the mocks:

```bash
export MILADY_MOCK_TWILIO_BASE=http://127.0.0.1:3001
export MILADY_MOCK_WHATSAPP_BASE=http://127.0.0.1:3002
export MILADY_MOCK_CALENDLY_BASE=http://127.0.0.1:3003
export MILADY_MOCK_X_BASE=http://127.0.0.1:3004
export MILADY_MOCK_GOOGLE_BASE=http://127.0.0.1:3005
```

## Test usage

Tests use `createMockedTestRuntime`, which boots the fixture servers, isolates
Milady state/config in a temporary directory, sets the mock env vars, and then
constructs the LifeOps runtime. Existing unit tests that use
`vi.stubGlobal('fetch', ...)` continue to work and do not require fixture
servers.

## Google / Gmail mock coverage

`environments/google.json` is the local Gmail/Google fixture used by
`MILADY_MOCK_GOOGLE_BASE`. The in-process runner also adds Gmail-specific
dynamic routes for surfaces LifeOps needs for read, send, and inbox-zero
development:

- message list/get/send/modify plus batch modify/delete
- message trash, untrash, and delete
- label list, including system labels and the `milady-e2e` user label
- draft create/list/get/send/delete
- thread list/get/modify/trash/untrash
- watch and history list
- settings filter creation for unsubscribe/archive flows

This fixture is intentionally deterministic and synthetic. It is not a full
Gmail search engine: the in-process runner matches method plus path, while query
parameters, auth scopes, request-body validation, pagination, and rate-limit
variants need a stateful Gmail fixture service or a richer runner layer. Keep
real mailbox captures out of this directory unless they have gone through a
redaction and fixture-validation pipeline.

## Add or edit mocks

Open the JSON files directly, or use the [Mockoon desktop
app](https://mockoon.com/download/) (it loads the same JSON format).
The full Mockoon templating syntax is documented at
https://mockoon.com/docs/latest/templating/overview/.
