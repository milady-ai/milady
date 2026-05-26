# First-Run And Startup QA

First-run setup is owned by `eliza/packages/ui/src/components/shell/FirstRunShell.tsx`.
It speaks each prompt, listens for the same owner-name, agent-name, runtime,
and remote-target answers that the text controls accept, and keeps the current
Milady background surface. Local runtime starts the embedded agent first, waits
for the API to answer, submits the server-backed first-run payload, then enters
chat. Cloud runtime signs in and provisions through Eliza Cloud. Remote runtime
verifies the supplied agent API before persisting it.

## State

- Direct desktop/dev state: `$XDG_STATE_HOME/milady`, or
  `~/.local/state/milady` when `XDG_STATE_HOME` is unset.
- elizaOS default state: `$XDG_STATE_HOME/eliza`, or
  `~/.local/state/eliza` when `XDG_STATE_HOME` is unset.
- Explicit overrides: `MILADY_STATE_DIR` is mirrored to `ELIZA_STATE_DIR` by
  Milady entrypoints; `ELIZA_STATE_DIR` remains the canonical runtime env var.
- Config path: `<stateDir>/eliza.json` unless `MILADY_CONFIG_PATH` or
  `ELIZA_CONFIG_PATH` is set.

## Manual Checks

| Area | Check | Expected |
| --- | --- | --- |
| Cold launch | Remove the state dir, run `bun run dev`, open `/chat` | `FirstRunShell` renders owner-name step |
| Voice first-run | Fresh first-run shell finishes typing a prompt | Prompt is spoken when supported, mic control appears, final transcripts drive the same draft/step transitions as text |
| Identity | Enter owner and agent names | Runtime step appears, values are sent in `POST /api/first-run` |
| Local runtime | Pick Local | Embedded agent starts, `/api/auth/status` answers before completion |
| Cloud runtime | Pick Cloud | Login/provisioning flow completes before chat |
| Remote runtime | Pick Remote with URL/token | URL is verified, active server is persisted, then chat opens |
| Runtime switch | Settings -> Runtime -> switch target | Local storage target clears and page reloads with `runtime=first-run` |
| Android AOSP | Boot branded system image | Local runtime is pre-seeded unless `runtime=first-run` is present |

## Automated Checks

- `eliza/packages/ui/src/first-run/first-run.test.ts`
- `eliza/packages/ui/src/first-run/__tests__/deep-link-entry.test.ts`
- `eliza/packages/ui/src/components/shell/startup-shell-assets.test.ts`
- `eliza/packages/core/src/utils/state-dir.test.ts`
