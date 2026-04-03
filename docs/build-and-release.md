---
title: "Build And Release"
sidebarTitle: "Build And Release"
description: "High-signal release guidance for the current Milady packaging and CI surface."
---

This page is the active source for the packaging and release paths that are still part of the shipped Milady surface.

## What Matters Right Now

- desktop packaging and smoke checks
- Bun and Node setup in CI
- release workflow stability
- preserving the desktop runtime module layout

## Current Guidance

- keep release workflows aligned with the actual packaged runtime layout
- keep docs and tests in sync when release steps change
- prefer explicit validation over ad hoc release notes

For repo-wide release policy, also read [`RELEASING.md`](/Users/home/.codex/worktrees/07ca/milady/RELEASING.md).
