---
title: Onboarding UI flow
sidebarTitle: Onboarding UI
summary: How Milady moves from the startup server chooser into the six-step onboarding wizard, and how that maps to canonical server and routing state.
description: Architecture of Milady’s chooser-first startup and in-app onboarding wizard, including server selection, hosting vs provider separation, and the pure connection flow helpers.
---

# Onboarding UI: chooser first, provider second

This guide describes the **in-app onboarding UI flow** and its relationship to the startup chooser. It is about the client-side user experience, not the HTTP `/api/onboarding` contract.

## Current shape

Milady now has two layers before the first chat:

1. **Startup chooser**
   The user chooses which server to use:
   - create a local server
   - connect to a discovered LAN server
   - connect to an existing remote server
   - use Eliza Cloud when cloud credentials are available

2. **Onboarding wizard**
   Once a server target is selected, the app runs the six-step wizard defined in
   [`packages/app-core/src/state/types.ts`](../../packages/app-core/src/state/types.ts):
   - `identity`
   - `hosting`
   - `providers`
   - `voice`
   - `permissions`
   - `launch`

**Important rule:** choosing where the server runs is not the same as choosing who handles inference. Hosting is server selection. Provider choice is service routing.

## Source of truth

The client should treat these concerns separately:

- **Server target**
  The selected server: local, remote/LAN, or Eliza Cloud.
- **Linked accounts**
  Accounts available to the selected server, such as Eliza Cloud, OpenAI, or Anthropic.
- **Service routing**
  Which backend handles chat, TTS, media, embeddings, or RPC on that server.

The canonical runtime config on disk uses:

- `deploymentTarget`
- `linkedAccounts`
- `serviceRouting`

The onboarding UI should guide the user toward those fields. It should not rebuild old global cloud toggles or infer active providers from linked credentials.

## Why split startup chooser from onboarding?

The old flow mixed too many responsibilities into one place:

- deciding whether the app was local or cloud
- deciding which backend it should connect to
- deciding which provider should handle chat
- deciding whether linked cloud services were active

That created conflicts where cloud login, remote attach, and provider switching could overwrite each other.

The chooser-first split fixes that:

- **Startup chooser** decides which server the client is talking to.
- **Onboarding** configures that selected server.
- **Chat** opens only after the selected server has a valid chat route.

## Step responsibilities

| Step | What it owns | What it must not own |
|------|---------------|----------------------|
| `identity` | Name, persona, style, basic profile | Hosting or provider routing |
| `hosting` | Selecting a server target or attaching to a backend | Choosing the active chat model |
| `providers` | Choosing `serviceRouting.llmText` and related linked accounts | Changing where the server runs |
| `voice` | Voice/TTS routing and related credentials | Changing chat inference implicitly |
| `permissions` | Local device capability permissions | Provider selection |
| `launch` | Final readiness and first-chat handoff | Rewriting routing defaults silently |

## Pure connection flow

The hosting step still has a nested pure state machine for its internal panels.

Relevant files:

| File | Role |
|------|------|
| [`packages/app-core/src/onboarding/server-target.ts`](../../packages/app-core/src/onboarding/server-target.ts) | Canonical mapping between onboarding server target and the temporary compatibility fields still used at the onboarding API boundary. |
| [`packages/app-core/src/onboarding/types.ts`](../../packages/app-core/src/onboarding/types.ts) | Types for the nested connection flow snapshots, patches, screens, and events. |
| [`packages/app-core/src/onboarding/connection-flow.ts`](../../packages/app-core/src/onboarding/connection-flow.ts) | Pure routing logic for the hosting step panels. No React, no API calls. |
| [`packages/app-core/src/components/onboarding/ConnectionStep.tsx`](../../packages/app-core/src/components/onboarding/ConnectionStep.tsx) | React shell that renders the pure flow and performs effectful actions. |
| [`packages/app-core/src/onboarding/tests/connection-flow.test.ts`](../../packages/app-core/src/onboarding/tests/connection-flow.test.ts) | Table-driven coverage for the nested hosting-step decisions. |

**Why this split still exists:** the hosting step has richer nested UI than the outer wizard, and the pure module keeps that behavior deterministic and testable.

## What “hosting” means now

Inside the hosting flow, the user is answering:

- should Milady start a local server?
- should it connect to a remote or discovered server?
- should it use Eliza Cloud as the server target?

They are **not** yet answering:

- should chat use OpenAI?
- should chat use Anthropic?
- should chat use Eliza Cloud inference?
- should TTS come from ElevenLabs or Eliza Cloud?

Those answers belong to the provider and voice steps, where the app writes canonical service routing for the selected server.

## Back/next behavior

The outer wizard navigation still comes from pure flow helpers in
[`packages/app-core/src/onboarding/flow.ts`](../../packages/app-core/src/onboarding/flow.ts), while effectful transitions stay in AppContext and onboarding callbacks.

Use:

- `handleOnboardingNext` / `advanceOnboarding` for forward progress
- `handleOnboardingBack` / `revertOnboarding` for backward motion
- `goToOnboardingStep` for controlled jumps that must also sync guide state

Do not write raw step changes from UI components unless the transition is administrative and intentionally bypasses normal wizard behavior.

## Safe editing rules

When changing the onboarding UI:

1. Update the chooser or step responsibility first.
2. Keep hosting and provider logic separate.
3. Add or update table tests in the pure flow modules.
4. Keep API calls and bridge effects out of pure onboarding helpers.
5. Verify that first-chat still depends on both:
   - a selected server target
   - an active chat provider route

## Related docs

- [Onboarding REST API](../rest/onboarding.md)
- [Quickstart](../quickstart.mdx)
- [Configuration](../configuration.mdx)
- [Architecture](../architecture.mdx)
