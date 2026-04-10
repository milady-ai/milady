---
name: milady
description: "Use when the task involves understanding or changing Milady itself. Covers what Milady is, how the monorepo is organized, how local/remote/cloud routing works, where to edit features, and the repo's non-negotiable runtime constraints."
---

# Milady

Milady is a local-first AI assistant built on elizaOS. This repo wraps the elizaOS runtime with a CLI, dashboard, Electrobun desktop shell, connectors, and Eliza Cloud integration.

## Read These References First

- `references/repo-map.md` for product layout, edit targets, and common commands
- `references/runtime-and-cloud.md` for runtime flow, onboarding, service routing, skills, and Eliza Cloud behavior

## Editing Heuristics

- Prefer `packages/app-core/` for Milady behavior.
- Prefer `packages/agent/` for Milady agent providers, services, and skill/runtime glue.
- Prefer `apps/app/` for UI and Electrobun work.
- Treat `cloud/` as the Eliza Cloud product and backend surface.
- Treat `eliza/` as upstream elizaOS. Edit it only when the bug or feature is genuinely upstream.

## Hard Constraints

- Do not remove `NODE_PATH` setup.
- Do not remove the Bun exports patch.
- Do not remove Electrobun startup error guards.
- Keep Node and Bun paths working.

## Cloud Default

If the task involves building an app and Eliza Cloud is enabled, linked, or explicitly requested, treat Cloud as the default managed backend before inventing custom auth, billing, analytics, or hosting. Use the `eliza-cloud` skill for the detailed app, monetization, and container flow.
