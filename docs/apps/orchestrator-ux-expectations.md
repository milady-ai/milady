# Orchestrator UX Expectations

`/orchestrator` is the full-screen multi-agent task workbench for coding-agent tasks. It must render as its own app-shell page, not as the generic Views catalog or the compact chat task widget.

## First Paint

- The page mounts `data-testid="orchestrator-workbench"` at `/orchestrator`.
- The header shows the `Orchestrator` title and server-derived counters from `GET /api/orchestrator/status`: total tasks, active tasks, blocked tasks, validating tasks, active/total agents, and token/cost usage.
- The left rail shows task rows from `GET /api/orchestrator/tasks`, including title, status, priority, active/total sessions, token usage, and latest activity.
- Empty and loading states are explicit: "Loading tasks..." while fetching and "No tasks yet" when the route returns no tasks.

## Task Detail

Selecting a rail item opens the task room:

- The center timeline merges task messages from `GET /api/orchestrator/tasks/:id/messages` and system events from `GET /api/orchestrator/tasks/:id/events`.
- User, orchestrator, and sub-agent messages are visually distinct. Sub-agent messages use the session label when available.
- The composer posts to `POST /api/orchestrator/tasks/:id/messages` and clears only after the server records and forwards the message.
- The right inspector is populated from `GET /api/orchestrator/tasks/:id`: goal, sub-agents, current plan, acceptance criteria, artifacts, usage, and provider policy.

## Controls

- Header controls create a task, pause all active tasks, and resume paused tasks.
- The create dialog requires title and goal, accepts priority and one-criterion-per-line acceptance criteria, and posts to `POST /api/orchestrator/tasks`.
- Inspector controls can pause/resume, archive/reopen, fork, delete, validate, change priority, copy a direct task link, add a sub-agent, and stop a sub-agent.
- The add-agent form captures framework, model, label, workdir, repo, and sub-task, then posts to `POST /api/orchestrator/tasks/:id/agents`.

## Mobile

- On narrow screens the rail is the first view.
- Selecting a task switches to the timeline with a back button.
- The inspector becomes a slide-over opened by the Details button and dismissed by its close button or backdrop.

## E2E Coverage

The Playwright smoke spec at `apps/app/test/ui-smoke/orchestrator.spec.ts` verifies the route registration, expected server data on screen, timeline rendering, inspector rendering, message send, sub-agent add, and task creation flow against realistic `/api/orchestrator/*` fixtures.
