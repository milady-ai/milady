# First-Run Contracts

## Owner

`FirstRunShell` is the only renderer entry point for fresh setup:

- `eliza/packages/ui/src/components/shell/StartupShell.tsx`
- `eliza/packages/ui/src/components/shell/FirstRunShell.tsx`
- `eliza/packages/ui/src/first-run/first-run.ts`

The flow is owner name -> agent name -> runtime target. Remote runtime adds URL
and token fields before completion. First-run is voice-driven out of the box:
the controller speaks each completed prompt when the renderer supports speech
output, listens through the browser speech API when available, and applies final
transcripts through the same deterministic first-run state helpers used by text
entry.

`FirstRunShell` stays render-only. It receives voice state and handlers from the
controller; it must not import mic capture, speech APIs, storage, app context,
or desktop bridge behavior directly.

## Completion

First-run completion requires both client and server state:

- `POST /api/first-run` receives the payload from
  `buildFirstRunSubmitPlan(...)`.
- `eliza:first-run-complete` is written in renderer storage.
- `config.meta.firstRunComplete` is written in `<stateDir>/eliza.json`.
- `elizaos:active-server` is written for local and remote runtime targets.
- `eliza:mobile-runtime-mode` mirrors the runtime target on mobile.
- `features.voice.enabled` and `features.voice.firstRun` are included in the
  first-run payload.

## State Paths

- Direct Milady: `$XDG_STATE_HOME/milady` or `~/.local/state/milady`.
- Direct elizaOS: `$XDG_STATE_HOME/eliza` or `~/.local/state/eliza`.
- Store/sandbox desktop builds: the platform user-data state directory exposed
  by Electrobun, with direct-build import handled by the migration RPC.
- Config: `<stateDir>/eliza.json` unless `MILADY_CONFIG_PATH` or
  `ELIZA_CONFIG_PATH` is set.
- Explicit state override: `MILADY_STATE_DIR` is mirrored to
  `ELIZA_STATE_DIR`; `ELIZA_STATE_DIR` is the canonical runtime value.

## Runtime Timing

Local runtime starts before first-run completion. Desktop calls the Electrobun
`agentStart` RPC, mobile calls the native Agent bridge, then the renderer polls
`/api/auth/status` for up to 180 seconds before submitting first-run setup. This
keeps chat from opening against a dead local agent while still allowing local
model download to run in the background after completion.

## Runtime Switching

Settings clears the persisted active server and runtime mode, then reloads with
`runtime=first-run&runtimeTarget=<local|cloud|remote>`. AOSP Android pre-seed
honors that query and does not skip into the local agent path when the user is
switching runtime.
