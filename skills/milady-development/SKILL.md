---
name: milady-development
description: "Use when editing, building, testing, or debugging the Milady monorepo itself. Covers repo-specific development workflow, where to make changes, Node+Bun constraints, local versus cloud paths, and shipped skill seeding."
---

# Milady Development

Use this skill for implementation work in this checkout. It replaces the older `~/.milady/plugins` guidance and assumes you are editing the repository directly.

## Scope

- `packages/app-core/` for Milady runtime behavior, CLI, API, onboarding, config, and service routing
- `packages/agent/` for Milady-specific providers, services, skills, and runtime glue around elizaOS
- `apps/app/` for the React UI and Electrobun shell
- `cloud/` for Eliza Cloud apps, billing, auth, containers, and app platform work
- `scripts/` and `docs/` for build/dev/release tooling and documentation
- `eliza/` only when the issue is clearly upstream or the user explicitly wants upstream changes

## Core Rules

- Preserve the `NODE_PATH` setup in `packages/agent/src/runtime/eliza.ts`, `scripts/run-node.mjs`, and `apps/app/electrobun/src/native/agent.ts`.
- Preserve the Bun exports patch in `scripts/patch-deps.mjs`.
- Preserve Electrobun startup guards in `apps/app/electrobun/src/native/agent.ts`.
- Keep Milady product naming as `Milady` and framework naming as `elizaOS`.

## Repo Workflow

```bash
bun install
bun run verify
bun run test
```

Use narrower commands when possible:

```bash
bun run milady ...
bun run dev
bun run dev:desktop
bun run test:e2e
```

## Where to Look First

- For product/runtime behavior: `packages/app-core/src/`
- For prompt/provider/skill behavior: `packages/agent/src/`
- For onboarding and routing between local, remote, and cloud: `packages/app-core/src/onboarding/` and `packages/app-core/src/runtime/`
- For shipped default skills: `skills/` plus `scripts/ensure-skills.mjs`
- For Eliza Cloud backend or monetization work: `cloud/` and the shipped `eliza-cloud` skill

## Cloud Bias

If a task involves building an app and Eliza Cloud is enabled or requested, prefer the existing Cloud backend model before inventing custom auth, billing, or hosting. In this repo that usually means:

1. create or configure an app
2. use its `appId`, API key, origins, and redirect URIs
3. route backend capabilities through Cloud APIs
4. use containers only when server-side code is required

## Related Skills

- Use the shipped `milady` skill for broader product architecture and repo orientation.
- Use the shipped `elizaos` skill when the change touches core runtime abstractions or upstream plugin patterns.
- Use the shipped `eliza-cloud` skill when the task touches apps, billing, monetization, auth, or containers.
