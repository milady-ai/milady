# Assistant User Journey Matrix

This matrix maps the live end-to-end coverage for the user-journey prompts captured in the April 10 executive-function and assistant workflow notes.

All entries below are intended to run against real runtimes and real LLMs. "Covered" means there is now a live scenario in-repo. "Partial" means there is a real lower-level capability or adjacent live coverage, but not the full user-level journey end to end yet. "Gap" means the repo does not yet have a stable real journey for that request.

## Live Scenarios

| User journey | Status | Live coverage | Notes |
| --- | --- | --- | --- |
| Morning inbox scan across WhatsApp, WeChat, Telegram, X, and Instagram | Partial | `packages/agent/test/assistant-user-journeys.live.e2e.test.ts` | Scenario scaffold exists, but the current live runtime still falls back to explicit search-term/channel clarification instead of summarizing the seeded cross-app context. |
| "Don't forget that thing I told you this morning is still happening" | Covered | `packages/agent/test/lifeops-memory.live.e2e.test.ts` | Existing live memory suite already covers multi-turn recall and routine carry-forward behavior. |
| "What's on my schedule today?" | Covered | `packages/agent/test/assistant-user-journeys.live.e2e.test.ts` | Seeds cached Google Calendar data and verifies natural-language schedule grounding. |
| "What's going on this weekend?" including kid/sports/party/parents/wedding logistics | Partial | `packages/agent/test/assistant-user-journeys.live.e2e.test.ts` | Scenario scaffold exists, but the combined calendar-plus-email reasoning path is not yet reliable enough to mark green. |
| "What bill is the most late?" via calendar/email context | Partial | `packages/agent/test/assistant-user-journeys.live.e2e.test.ts` | Cached Gmail billing fixtures are in place, but once the assistant escalates into a real Gmail search it uses live Google auth and currently fails under fixture tokens instead of grounding from cached inbox state. |
| Recurring 9am financial/international news heartbeat | Covered | `packages/agent/test/assistant-user-journeys.live.e2e.test.ts` | Live scenario creates a real recurring trigger from natural language and verifies the stored trigger instructions/schedule. |
| "Help me implement a quick sort algorithm" | Covered | `packages/agent/test/quicksort-coding-agent.live.e2e.test.ts` | Uses the live Codex coding-agent path, waits for the generated file, then executes the sorter. |
| Multi-turn executive-function routine / reminder preference behavior | Covered | `packages/agent/test/lifeops-memory.live.e2e.test.ts` | Existing live suite already covers routine creation, confirmation, and cross-channel memory behavior. |
| Search and organize information | Covered | `test/scripts/research-task-thread-live.ts` | Existing live Codex research-thread run produces a sourced report with real web search. |
| Draft a document about a topic | Covered | `packages/agent/test/quicksort-coding-agent.live.e2e.test.ts` | Uses the live Codex path to turn a natural-language drafting request into a markdown document on disk and validates the generated structure/content. |
| Summarize financial and international news every morning and send it | Partial | `packages/agent/test/assistant-user-journeys.live.e2e.test.ts`, `test/scripts/research-task-thread-live.ts` | Scheduling is now covered end to end; the combined scheduled execution plus current-news retrieval path is still not a single live test. |
| Summarize meeting notes after a meeting and send them | Gap | None yet | Needs a stable ingestion source for meeting notes plus a verified delivery/output path. |
| Analyze data and generate charts | Gap | None yet | No full user-level live journey exists for data ingestion, analysis, and chart artifact validation. |
| Take content from a file, analyze it, generate charts, and output a PDF | Partial | `packages/agent/test/browser-workspace-api.e2e.test.ts` | PDF generation exists at the browser-workspace API level, but not the full file-to-analysis-to-chart-to-PDF workflow. |
| Put email into calendar | Gap | None yet | There are separate Gmail and Calendar capabilities, but no stable cross-tool user journey test for converting email into a calendar event. |
| Household state questions like groceries/laundry/cleaning | Gap | None yet | The current repo does not maintain grounded household-state sources for a real answer. |

## Running The New Live Coverage

Assistant journeys:

```bash
MILADY_LIVE_TEST=1 \
MILADY_LIVE_CHAT_TEST=1 \
MILADY_LIVE_ASSISTANT_JOURNEYS=1 \
MILADY_LIVE_PROVIDER=openai \
bunx vitest run --config vitest.live-e2e.config.ts \
  packages/agent/test/assistant-user-journeys.live.e2e.test.ts
```

Quicksort coding-agent journey:

```bash
MILADY_LIVE_TEST=1 \
MILADY_LIVE_CODE_AGENT_TEST=1 \
bunx vitest run --config vitest.live-e2e.config.ts \
  packages/agent/test/quicksort-coding-agent.live.e2e.test.ts
```

## Next Gaps To Close

1. Add a real meeting-notes ingestion fixture plus post-meeting summary delivery validation.
2. Build a data-analysis live fixture with deterministic source files, chart artifact assertions, and PDF validation.
3. Add a Gmail-to-Calendar conversion journey that proves the agent can extract event details from mail and persist the calendar result without mocks.
