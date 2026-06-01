#!/usr/bin/env node
// Shim: the upstream `eliza/packages/app-core/scripts/run-node.mjs` spawns
// `eliza.mjs` (see line 176), but Milady's fork renamed the entry to
// `milady.mjs`. This shim lets `bun run doctor` and any other script that
// goes through run-node.mjs find the entry without patching upstream.
//
// Tracked as Finding #1 in qa-findings.md — proper upstream fix is to make
// run-node.mjs read the entry filename from an env var.
await import("./milady.mjs");
