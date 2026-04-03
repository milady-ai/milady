---
title: "Startup And Onboarding Flow"
sidebarTitle: "Startup Flow"
description: "The active startup flow now begins with a server chooser, then continues into onboarding for the selected server."
---

## Current Flow

The active flow is:

1. splash and startup restore
2. chooser-first server selection
3. onboarding for the selected server when needed
4. chat once the server is reachable and configured

## Chooser Before Provider

The startup chooser should present:

- `Create one`
- `Manually connect to one`
- discovered LAN servers
- `Use Eliza Cloud` only when cloud credentials exist

Provider selection comes **after** the server selection.

## Why This Changed

The older flow mixed together:

- where the server runs
- whether the user had linked Eliza Cloud
- which model provider handled chat

That created conflicts where logging into cloud or switching runtime target could override provider intent. The current direction separates those concerns.
