# Milady Repo Map

## What Milady Is

Milady is a product layer on top of elizaOS. It combines:

- a local-first runtime and CLI
- a web dashboard
- an Electrobun desktop shell
- connector integrations
- Eliza Cloud routing, provisioning, and billing hooks

## Main Edit Targets

### `packages/app-core/`

Primary product logic.

- `src/runtime/` for runtime bootstrap, env shaping, provider routing, and process behavior
- `src/cli/` for CLI wiring
- `src/api/` for Milady HTTP routes
- `src/config/` for config schemas and canonical routing/storage fields
- `src/connectors/` for platform integrations
- `src/providers/` for prompt/state context builders used by Milady

### `packages/agent/`

Milady agent glue around elizaOS.

- providers
- skill discovery and skill catalog plumbing
- runtime compatibility layers
- training/testing helpers

### `apps/app/`

Main React UI and desktop shell.

- web UI
- onboarding flows
- settings UI
- Electrobun native process under `apps/app/electrobun/`

### `cloud/`

Eliza Cloud product code.

- apps
- billing
- earnings
- auth
- containers
- domains
- cloud-side agent runtime and plugins

### `eliza/`

Repo-local upstream elizaOS checkout used for linked development. Change this only when the issue is genuinely upstream or the user asks for upstream work.

## Commands

```bash
bun install
bun run verify
bun run test
```

Useful narrower commands:

```bash
bun run dev
bun run dev:desktop
bun run milady ...
bun run test:e2e
bun run test:coverage
```

## Non-Negotiable Runtime Invariants

- `NODE_PATH` setup is required for dynamic plugin imports.
- The Bun exports patch is required for some published `@elizaos/*` packages.
- Electrobun startup guards keep the desktop UI usable when the runtime fails.

## Default Skill Seeding

Shipped skills live in repo `skills/` and are seeded into `~/.milady/skills` by `scripts/ensure-skills.mjs`. These skills are part of the repo's default agent knowledge, not optional extras.
