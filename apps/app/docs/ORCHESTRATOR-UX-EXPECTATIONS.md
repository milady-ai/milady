# Orchestrator UX Expectations

The `/orchestrator` route is a full-page multi-agent workbench. It must not be
covered by the global chat overlay or fall back to the default chat workspace.

## Page Shell

- The workbench is visible at `/orchestrator` with `data-testid="orchestrator-workbench"`.
- The header shows aggregate task count, active count, validating/blocked counts when present, active/total agent count, and token/cost usage.
- Global chat is not rendered over this route. The timeline, task rail, and inspector are directly visible.

## Task Rail

- The left rail lists current tasks with status, priority, active/total agents, and latest activity.
- Search, status filter, and "Show archived" controls are available.
- Archived tasks are hidden by default.
- The rail supports at least 10 active tasks and can reveal at least 20 archived tasks without losing row identity.

## Timeline

- Selecting a task opens its room timeline.
- Timeline data includes user turns, orchestrator messages, sub-agent output, tool/status events, and validation events in chronological order.
- User messages recorded as main-thread `stdin` must be visible; forwarded sub-agent stdin and raw keypress records remain hidden.
- Sending a message clears the composer, records the message, forwards it to active sessions, and refreshes the visible timeline.
- Running tasks show an interrupt bar with an active stop action.

## Inspector

- The inspector shows goal, sub-agents, current plan, acceptance criteria, artifacts, token/cost usage, and provider policy.
- Agent rows show framework, model, status, workdir/repo context, active tool when available, and usage.
- Artifacts show type/path and verification status.

## Task Operations

- New task creation records title, goal, priority, and acceptance criteria, then opens the created task.
- Add-agent records framework, model, label, workdir/repo when provided, and optional sub-task.
- Pause, resume, archive, reopen, fork, delete, and priority updates refresh list/detail state after the mutation.
- Validation approve/reject actions post `humanOverride: true` and must include default human evidence when the operator does not provide explicit evidence:
  - `Human approved in the orchestrator UI.`
  - `Human rejected in the orchestrator UI.`

## Tested Data Contract

The UI smoke spec fixtures assert these screen-level expectations:

- A live task titled `Build Pixel Notes app` displays Codex and Eliza sessions using `gpt-oss-120b`.
- Header usage renders `22.3K` tokens and `$0.0234`.
- Timeline renders the orchestrator plan message, sub-agent output, tool event, posted user follow-up, and human validation evidence.
- Inspector renders the app goal, Codex builder, acceptance criteria, artifact, and provider policy.
- Scale coverage renders 10 active tasks, hides 20 archived tasks by default, reveals all 30 after "Show archived", and opens a selected active task with visible browser-E2E status data.
