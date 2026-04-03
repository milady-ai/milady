---
title: "Current Transitional Seams"
sidebarTitle: "Transitional Seams"
description: "This page records what is true in the current codebase versus the target architecture."
---

This page is intentionally blunt. It exists so the docs stay honest while the startup and config migration is still underway.

## Already Aligned

- The startup surface now has a chooser-first direction instead of only a provider wizard.
- The client has a canonical `milady:active-server` record for startup persistence.
- `local`, `remote`, and `Eliza Cloud` are being treated as server targets.
- provider routing is being normalized around `deploymentTarget`, `linkedAccounts`, and `serviceRouting`.

## Still Transitional

- `eliza:connection-mode` still exists as a compatibility mirror for the active server record.
- `milady_api_base` session fallback still exists in some API-base and asset-resolution paths.
- onboarding and compat server routes still perform some direct config authorship while the gateway-owned settings model is being completed.
- the repo still contains both legacy docs and reset-era compatibility code.

## How To Read The Repo Right Now

If you are reading the code during this migration:

- treat `milady:active-server` as the preferred client startup source
- treat `eliza:connection-mode` as compatibility only
- treat raw `cloud.*` routing semantics as legacy behavior, not the target model
- expect some routes to still backfill or preserve older config shapes until the server settings API is fully dominant

## Documentation Policy During The Migration

When a behavior is target-only, docs should say so explicitly.

When a behavior exists in code today, docs should name it exactly instead of pretending it is already gone.
