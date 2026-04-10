# Milady Runtime And Cloud

## Runtime Shape

Milady persists canonical runtime state in config fields such as:

- `deploymentTarget` for where the active runtime lives: `local`, `cloud`, or `remote`
- `linkedAccounts` for which providers and cloud accounts are connected
- `serviceRouting` for which backend handles each capability (`llmText`, `tts`, `media`, `embeddings`, `rpc`)

This separation matters. Hosting on Eliza Cloud does not require all inference to run through Eliza Cloud, and direct provider keys can still be used for selected capabilities.

## Onboarding Model

Onboarding chooses:

1. identity and persona
2. hosting target
3. provider/account links
4. service routing
5. credentials

The stored config then drives runtime behavior after restart.

## Providers And Skills

Milady injects runtime context through providers. In the repo you will see providers for things like:

- workspace context
- admin trust / access level
- autonomous state
- UI catalog or action availability

Shipped skills are separate from providers. Skills are disk-backed knowledge assets discovered from `skills/` and the managed skills directory, then selected dynamically per turn by the Milady skill provider.

## Eliza Cloud In Milady

Milady treats Eliza Cloud as a first-class managed backend:

- cloud login and API key persistence
- credit balance and in-app billing proxies
- cloud-hosted agent provisioning
- cloud media and TTS paths
- app platform integration
- containers and remote runtimes

If a task is about app building and Cloud is enabled or requested, prefer the Cloud backend path before inventing custom auth, billing, analytics, or hosting.

## Cloud-As-Backend Heuristic

For new app work, the default path should usually be:

1. create or reuse an Eliza Cloud app
2. use its `appId` plus API key
3. configure origins, redirect URIs, and domains
4. use Cloud APIs for chat/media/agent features
5. turn on monetization if the app should earn
6. deploy a container only if server-side code is required

## Current Cloud Monetization Reality

In this repo's current implementation, app monetization is driven by markup/share fields and creator earnings tracking, not only generic per-request pricing prose. When docs drift, prefer:

- schema fields in `cloud/packages/db/schemas/`
- app monetization UI under `cloud/packages/ui/src/components/apps/`
- billing and earnings APIs used by the UI
