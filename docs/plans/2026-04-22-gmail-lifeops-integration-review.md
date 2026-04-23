# Gmail LifeOps Integration Review

Status: Implementation slice landed for backend Gmail inbox-zero operations, event ingestion, n8n workflow dispatch, write guards, safe fixture export, and real write sweep tooling  
Last updated: 2026-04-22

## Scope

This review covers the Gmail integration used by LifeOps, the local Mockoon-compatible Google mock, PRD and scenario documents, and the scenario tests needed to prove inbox-zero behavior with real LLM planning.

The main product goal is:

- triage Gmail without brittle keyword routing
- find messages that likely need a response
- find true unresponded threads
- detect spam and low-value mail
- bulk archive, label, mark read, trash, or report spam
- draft and send replies only after explicit confirmation
- switch safely between mock Gmail and real Gmail
- enable LifeOps/n8n workflows that react to email events
- never run destructive write tests against real Gmail by accident

## External Gmail Surface To Emulate

The mock should track the Gmail API subset the app uses or plans to expose:

- `users.messages.list`: supports `q`, `labelIds`, `maxResults`, `pageToken`, `includeSpamTrash`, and returns `messages`, `nextPageToken`, and `resultSizeEstimate`.
- `users.messages.get`: fetches message details after list/search returns IDs.
- `users.messages.send`: sends a raw RFC 822 message and requires send/compose/modify scope.
- `users.messages.modify`, `batchModify`, `batchDelete`, `trash`, `untrash`, `delete`: inbox-zero write operations.
- `users.labels.list`: required for label-driven UI and test labels.
- `users.drafts.create/list/get/send/delete`: required for draft-only and approval flows.
- `users.watch` and `users.history.list`: required for new-email event ingestion and cursor sync.
- `users.threads.*`: required for true unresponded-thread detection.
- `users.settings.filters.create`: already relevant to unsubscribe/archive flows.

Primary references:

- Gmail messages list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Gmail messages send: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- Gmail drafts: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts
- Gmail batch modify: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchModify
- Gmail labels list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list
- Gmail watch: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- Gmail history list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list

## Current State

### What Works

- LifeOps can read Gmail triage, search, read message detail, draft replies, batch draft replies, send replies, send messages, and batch-send replies through `GMAIL_ACTION`.
- The service layer requires `confirmSend` before Gmail sends.
- Gmail action send paths now require explicit send confirmation instead of defaulting to send when planned fields are present.
- LifeOps exposes Gmail bulk management for archive, trash, report spam, mark read/unread, and apply/remove label.
- LifeOps exposes read-only Gmail recommendations so the agent/UI can suggest reply, archive, mark-read, or spam-review actions without executing a write.
- LifeOps Gmail clients expose triage, search, needs-response, recommendations, unresponded, manage, and event-ingest calls with typed inputs and outputs.
- LifeOps exposes thread-level unresponded detection from sent-thread chronology on the local OAuth path.
- LifeOps accepts Gmail event ingestion and can fan out to event workflows, including n8n dispatch workflow steps.
- `MILADY_BLOCK_REAL_GMAIL_WRITES=1` blocks direct Gmail writes unless traffic is routed to loopback mock or `MILADY_ALLOW_REAL_GMAIL_WRITES=1` is explicitly set.
- `scripts/export-gmail-fixture.mjs` provides the read-only exporter/scrubber/validator path for producing scrubbed Gmail fixtures.
- `scripts/gmail-real-sweep.mjs` provides dry-run-first real Gmail cleanup for write-safe smoke sends, with exact run allowlists, recipient allowlists, LifeOps search/manage support, and direct Gmail token fallback.
- Direct Gmail smoke sends create and apply a per-run Gmail label and include `X-Milady-Test-Run`; LifeOps smoke sends include the same run id in subject/body because the LifeOps send contract does not expose custom RFC 822 headers yet.
- `MILADY_MOCK_GOOGLE_BASE` switches Google API and OAuth traffic to the local mock.
- The Google mock now covers labels, drafts, batch modify/delete, message trash/untrash/delete, thread operations, watch/history, settings filters, and message send/list/get routes.
- The in-process Google mock applies Gmail-aware list filtering for `q`, `labelIds`, `maxResults`, `pageToken`, and `includeSpamTrash`, while still using Mockoon-compatible JSON as the editable fixture source.
- The mock runtime records a request ledger through `requestLedger()` and `GET /__mock/requests`.
- Mock runtime seeding can create a local Google grant for Gmail and Calendar smoke tests.
- Unified inbox can fetch Gmail messages and expose reply-needed metadata.

### Major Gaps

- The Mockoon JSON remains the editable fixture source while the in-process runner supplies Gmail behavior. It now covers stateful writes, pagination, history movement, token-scope checks when Bearer scopes are known, and body validation for the app-used write routes, but it still does not emulate Gmail retry/error edge cases or every Gmail API validation rule.
- Gmail scenarios now use strict structured final checks and mock-ledger assertions. `expectedActions`-style planner metadata should still be converted into explicit final checks before it is treated as release proof.
- `gmailInbox` seeds are implemented as validation/binding against the existing mock fixture set. Dynamic per-scenario Gmail fixture creation is still a backlog item.
- LifeOps real send cleanup cannot create Gmail labels or custom RFC 822 headers through the LifeOps API yet. It sweeps by exact subject/body run id through LifeOps search/manage, while direct Gmail fallback can also use the per-run Gmail label and header.
- Full live LLM Gmail scenarios were not executed in this pass; the scenario schema/final-check plumbing and Gmail scenario discovery were verified locally.

## Mock Vs Real Policy

### Mock Mode

Mock mode is for local integration and CI without touching Google:

- `MILADY_MOCK_GOOGLE_BASE` must point to loopback.
- Every Gmail write must be asserted through a mock request ledger.
- The scenario runner should fail if a Gmail write occurs and the ledger has no matching mock request.
- Synthetic examples must use `example.com`, `example.test`, or dedicated e2e domains only.
- Mock tests may exercise destructive operations.

### Real Mode

Real mode is for read-only smoke tests until write guards and cleanup exist:

- Use dedicated Google Workspace test accounts only.
- Default scopes should be read-only unless a scenario explicitly needs writes.
- Write scenarios require an opt-in such as `MILADY_ALLOW_REAL_GMAIL_WRITES=1`.
- Writes require recipient allowlist, per-run label, per-run header, and an implemented Gmail sweeper.
- Real send smoke requires an explicit run id and exact run allowlist. Direct Gmail sends add `X-Milady-Test-Run` and apply `Milady/GmailSmoke/<runId>`; LifeOps sends put the run id in subject/body and report the intended label for the sweeper.
- Real sweeps require an exact run allowlist even in dry-run. Executing trash/delete also requires `MILADY_GMAIL_REAL_SWEEP=1` and a recipient allowlist. Permanent delete additionally requires `MILADY_GMAIL_REAL_SWEEP_DELETE=1`.
- Production/personal Gmail must not be used for destructive scenarios.

### Switching Requirements

The same application path must work in both modes:

- unset `MILADY_MOCK_GOOGLE_BASE`: real Gmail path
- set `MILADY_MOCK_GOOGLE_BASE`: mock Gmail path
- test mode with real Gmail write attempted and no explicit allow flag: hard failure
- mock mode with non-loopback mock base: hard failure

## Real Email Cache Policy

Do not commit or directly use real owner Gmail captures. Use `bun run lifeops:gmail:export-fixture -- --out test/mocks/fixtures/gmail.scrubbed.json` only with a read-only access token and review the scrubbed output before committing.

For a read-only real API shape check without writing a fixture, prefer the logged-in LifeOps connector. This exercises the same local app path the agent/UI use, including connector grant selection, refresh, search, and recommendations:

```bash
bun run lifeops:gmail:real-smoke -- --source lifeops --query "in:inbox newer_than:7d" --max 5
```

The smoke output hashes IDs and redacts emails, URLs, names, subjects, and snippets by default. Set `MILADY_GMAIL_REAL_SMOKE_VERBOSE=1` only for a local manual inspection where scrubbed text content is intentionally needed.

If the local API is not on the default dev ports, pass it explicitly:

```bash
MILADY_LIFEOPS_API_BASE=http://127.0.0.1:31337 \
bun run lifeops:gmail:real-smoke -- --source lifeops --query "in:inbox" --max 5
```

The smoke script still supports direct Gmail API checks when a standalone token is intentionally provided:

```bash
GOOGLE_ACCESS_TOKEN=... bun run lifeops:gmail:real-smoke -- --source gmail --query "in:inbox newer_than:7d" --max 5
```

For a real test send through the logged-in LifeOps connector, use a dedicated test mailbox and require all send gates:

```bash
RUN_ID=milady-gmail-smoke-20260422T120000-manual

MILADY_GMAIL_REAL_SMOKE_SEND=1 \
MILADY_ALLOW_REAL_GMAIL_WRITES=1 \
MILADY_GMAIL_REAL_SMOKE_TO=test-recipient@example.com \
MILADY_GMAIL_REAL_SMOKE_ALLOWLIST=test-recipient@example.com \
MILADY_GMAIL_REAL_SMOKE_RUN_ID="$RUN_ID" \
MILADY_GMAIL_REAL_SMOKE_RUN_ALLOWLIST="$RUN_ID" \
bun run lifeops:gmail:real-smoke -- --source lifeops --send-test
```

Do not run real sends against production/personal contacts. Direct Gmail sends include an `X-Milady-Test-Run` header and apply a hidden `Milady/GmailSmoke/<runId>` label. LifeOps sends include the explicit run id in the subject/body because custom headers are not available through that contract.

The same gates apply to direct Gmail send mode:

```bash
GOOGLE_ACCESS_TOKEN=... \
MILADY_GMAIL_REAL_SMOKE_SEND=1 \
MILADY_ALLOW_REAL_GMAIL_WRITES=1 \
MILADY_GMAIL_REAL_SMOKE_TO=test-recipient@example.com \
MILADY_GMAIL_REAL_SMOKE_ALLOWLIST=test-recipient@example.com \
MILADY_GMAIL_REAL_SMOKE_RUN_ID="$RUN_ID" \
MILADY_GMAIL_REAL_SMOKE_RUN_ALLOWLIST="$RUN_ID" \
bun run lifeops:gmail:real-smoke -- --source gmail --send-test
```

Before any cleanup write, dry-run the sweeper and inspect redacted matches:

```bash
MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST="$RUN_ID" \
bun run lifeops:gmail:real-sweep -- --source lifeops --run-id "$RUN_ID"
```

Then trash only the allowlisted run and recipients:

```bash
MILADY_GMAIL_REAL_SWEEP=1 \
MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST="$RUN_ID" \
MILADY_GMAIL_REAL_SWEEP_RECIPIENT_ALLOWLIST=test-recipient@example.com \
bun run lifeops:gmail:real-sweep -- --source lifeops --run-id "$RUN_ID" --execute
```

Direct Gmail fallback uses `GOOGLE_ACCESS_TOKEN`, the same exact run allowlist, and can discover messages by the per-run label plus subject/header run id:

```bash
GOOGLE_ACCESS_TOKEN=... \
MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST="$RUN_ID" \
bun run lifeops:gmail:real-sweep -- --source gmail --run-id "$RUN_ID"
```

Permanent deletion is intentionally a separate gate and should only be used after a successful dry-run:

```bash
GOOGLE_ACCESS_TOKEN=... \
MILADY_GMAIL_REAL_SWEEP=1 \
MILADY_GMAIL_REAL_SWEEP_DELETE=1 \
MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST="$RUN_ID" \
MILADY_GMAIL_REAL_SWEEP_RECIPIENT_ALLOWLIST=test-recipient@example.com \
bun run lifeops:gmail:real-sweep -- --source gmail --run-id "$RUN_ID" --operation delete --execute
```

Safe pipeline:

1. Read-only exporter runs against a dedicated test account or explicitly approved owner mailbox.
2. Raw export writes only to ignored local storage.
3. Scrubber emits irreversible fixtures:
   - hash Gmail message IDs and thread IDs
   - replace domains with `example.test`
   - replace names while preserving role shape, such as founder, recruiter, vendor, spammer
   - strip attachments and HTML bodies
   - preserve only useful headers: From, To, Cc, Subject, Date, Message-Id, In-Reply-To, References, List-Id, Auto-Submitted, Precedence
   - convert absolute dates to relative offsets
   - generate synthetic plain-text bodies with the same intent
4. Fixture validator fails on:
   - non-test domains
   - OAuth tokens, API keys, auth headers
   - raw Gmail IDs
   - phone numbers or addresses that look real
   - attachment payloads
   - large HTML bodies
5. Only scrubbed fixtures enter `test/mocks` or `test/scenarios`.

## Architecture Backlog

Remaining implementation units:

1. Add dynamic per-scenario Gmail fixture creation for `gmailInbox` instead of binding scenarios to static mock fixture IDs.
2. Add LifeOps API label creation and custom Gmail send headers for cleanup parity with direct Gmail token sweeps.
3. Expand the mock beyond app-used Gmail routes into retry/error edge cases and stricter Gmail request validation.
4. Run the full live LLM Gmail scenario pack against the loopback mock in CI once LLM scenario credentials are available.

Implemented in this slice:

- Mock request ledger support in `test/mocks/scripts/start-mocks.ts`.
- Stateful Gmail fixture transitions for repeated writes in one mock run, including message modify/batch modify, delete/trash/untrash, drafts, sends, threads, watch, and history.
- Gmail write guard for scenario/test mode.
- Strict Gmail send confirmation in action paths.
- Gmail inbox management use cases: archive, trash, report spam, mark read/unread, apply/remove label, batch modify.
- Gmail recommendation use case for read-only suggested actions.
- Gmail-aware mock list/search pagination and thread fixtures for API-shape verification.
- Strict scenario final-check validation for Gmail action arguments, approvals, mock request ledger writes, draft creation/sending/deletion, message send, batch modify, n8n dispatch evidence, and no-real-write proof.
- `gmailInbox` seed validation and `gmailDeleteDrafts` cleanup execution against the loopback mock.
- True unresponded-thread detection from sent/inbox thread chronology.
- Persisted Gmail spam-review queue with idempotent upsert, list, status update, event ingestion, route/client coverage, and UI access through recommendations/actions.
- LifeOps Gmail event contracts such as `gmail.message.received` and `gmail.thread.needs_response`.
- LifeOps workflow action for n8n dispatch, keeping n8n as infrastructure and LifeOps as the policy layer.
- Real-mode Gmail write sweeper with dry-run default, exact run allowlist, recipient allowlist, LifeOps search/manage cleanup, direct Gmail token fallback, direct per-run labels, and permanent-delete gate.

## Scenario Proof Standard

Every new Gmail/LifeOps/n8n scenario must use a real LLM for semantic planning and judgment. Regex and substring checks are not acceptable as proof of correctness.

Allowed proof:

- structured action call captured with action name and typed arguments
- structured approval state transition
- DTO fields returned by use cases
- persisted DB rows
- mock request ledger entry with method, path, decoded Gmail body metadata, and test run ID
- LLM judge rubric for semantic quality only
- final check for absence of real writes

Disallowed proof:

- response text contains "sent"
- response text matches a regex
- serialized action blob contains a string
- scenario passes because an unknown assertion field was ignored

## Exhaustive LLM Scenario Matrix

Each scenario should run in mock mode first. Real mode is read-only unless explicitly marked write-safe.

### Triage And Inbox Zero

| ID                              | User request                                        | Seed                                            | Required structured proof                                                                                                 |
| ------------------------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gmail.triage.unread.priority`  | "Triage my unread email and tell me what needs me." | unread invoice, direct ask, newsletter, FYI     | `GMAIL_ACTION` triage; DTO ranks direct asks above newsletters; LLM judge confirms summary is semantic, not keyword based |
| `gmail.triage.cross-account`    | "Check all my Gmail accounts for anything urgent."  | two grants, one urgent account                  | action includes no hardcoded account; result includes grant/account IDs                                                   |
| `gmail.triage.specific-account` | "Only check my work Gmail."                         | personal + work grants                          | action uses selected grant ID; no requests against other grant                                                            |
| `gmail.triage.cc-only`          | "Do I owe replies?"                                 | direct To, cc-only, bcc-like synthetic          | direct To marked higher; cc-only not marked as direct request unless body asks explicitly                                 |
| `gmail.triage.list-mail`        | "What newsletters can I ignore?"                    | `List-Id`, `Precedence: bulk`                   | list mail categorized low priority without reply-needed flag                                                              |
| `gmail.triage.spam-candidates`  | "Find spammy email I should report."                | phishing, promotion, legitimate vendor          | spam candidates persisted/reported separately from ignored mail                                                           |
| `gmail.triage.promotions`       | "Clear low-value promotions from my inbox."         | category promotion messages                     | proposed bulk archive action, not immediate write                                                                         |
| `gmail.triage.invoice`          | "What finance emails need action?"                  | invoice receipt + payment failure + receipt FYI | finance action items separated from receipts                                                                              |
| `gmail.triage.travel`           | "Anything travel-related I need today?"             | flight change, hotel promo, receipt             | flight change promoted; promo low value                                                                                   |
| `gmail.triage.docs-signature`   | "Any forms I need to sign?"                         | signature request + FYI docs                    | signature request marked action-needed                                                                                    |
| `gmail.triage.security`         | "Any account security issues?"                      | password reset, login alert, newsletter         | security alert surfaced without sending anything                                                                          |
| `gmail.triage.noise`            | "Help me get to inbox zero."                        | mix of reply, FYI, newsletter, spam             | returns grouped plan: reply, archive, label, spam review, no blind deletion                                               |

### True Unresponded Threads

| ID                                      | User request                                       | Seed                                       | Required structured proof                                           |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `gmail.unresponded.sent-no-reply`       | "Who have I emailed and not heard back from?"      | sent message 14 days ago, no later inbound | thread detector returns `lastOutboundAt`, `daysWaiting`, `threadId` |
| `gmail.unresponded.reply-arrived`       | same                                               | sent then inbound reply                    | thread excluded                                                     |
| `gmail.unresponded.auto-reply`          | same                                               | sent then vacation auto-reply              | auto-reply ignored, still waiting                                   |
| `gmail.unresponded.bounce`              | same                                               | sent then delivery failure                 | not counted as waiting for human reply; flagged delivery issue      |
| `gmail.unresponded.multi-thread-person` | "Who does Alice owe me on?"                        | two Alice threads, one replied             | only unreplied thread returned                                      |
| `gmail.unresponded.snoozed`             | "Follow up on stale threads."                      | sent thread with follow-up label/snooze    | duplicate follow-up avoided                                         |
| `gmail.unresponded.recruiting`          | "Follow up with recruiters I have not heard from." | recruiter sent/outbound mix                | domain/person classification by LLM plus structured thread proof    |
| `gmail.unresponded.vendor`              | "Chase vendors who went quiet."                    | vendor quote thread                        | draft follow-up created, not sent                                   |

### Search And Read

| ID                                   | User request                                  | Seed                        | Required structured proof                                                |
| ------------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `gmail.search.semantic-person`       | "Find Sarah's latest product brief email."    | multiple Sarah emails       | search/read action with selected message ID and subject                  |
| `gmail.search.operator-date`         | "Show Gmail from last week with attachments." | dated emails                | query DTO uses date/attachment filters; no client-side math proof        |
| `gmail.search.spam-trash`            | "Look in spam for the DHL message."           | spam message                | request includes include-spam/trash equivalent; result remains read-only |
| `gmail.search.thread-read`           | "Open the full thread about invoice 4831."    | multi-message thread        | thread get action, not only latest message                               |
| `gmail.search.sender-disambiguation` | "Find Alex's email."                          | Alex friend and Alex vendor | assistant asks or selects based on relationship context with judge       |
| `gmail.search.no-result`             | "Find the missing refund email."              | none                        | no fake fallback message; LLM suggests next search                       |

### Draft And Send With Confirmation

| ID                                             | User request                                               | Seed                           | Required structured proof                                              |
| ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `gmail.draft.reply-basic`                      | "Draft a reply to Sarah saying I will review it tomorrow." | Sarah direct ask               | draft body from LLM; `gmailDraftCreated`; no send request              |
| `gmail.draft.tone`                             | "Make it warmer but concise."                              | pending draft                  | draft revision stored; original thread retained                        |
| `gmail.draft.batch`                            | "Draft replies to everyone who needs me."                  | multiple reply-needed messages | batch draft DTO with per-message status                                |
| `gmail.send.reply.requires-confirmation`       | "Reply yes to Sarah."                                      | no pending approval            | approval request created; no Gmail send request                        |
| `gmail.send.reply.after-confirmation`          | "Yes, send it."                                            | pending approval               | approval transition plus mock `messages/send` ledger                   |
| `gmail.send.reply.cancel`                      | "Actually don't send."                                     | pending approval               | approval canceled; no send request                                     |
| `gmail.send.new-message.requires-confirmation` | "Email Alice that I'm running late."                       | contact exists                 | draft/approval only until confirmation                                 |
| `gmail.send.new-message.allowlist`             | "Send to random external address."                         | real-mode safety               | blocked unless recipient allowlisted                                   |
| `gmail.send.batch-partial`                     | "Send all approved drafts."                                | one valid, one invalid         | partial result DTO names success/failure; no hidden defaults           |
| `gmail.send.rfc822-headers`                    | "Send the approved note."                                  | pending approval               | mock ledger proves To, Subject, Message-Id/In-Reply-To, and run header |

### Bulk Inbox Operations

| ID                               | User request                             | Seed                                       | Required structured proof                                                     |
| -------------------------------- | ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `gmail.bulk.archive-newsletters` | "Archive newsletters older than a week." | newsletters + personal mail                | proposed batchModify remove INBOX for selected IDs                            |
| `gmail.bulk.mark-read`           | "Mark all low-priority FYIs as read."    | unread FYIs + direct asks                  | batchModify remove UNREAD only for FYIs                                       |
| `gmail.bulk.report-spam`         | "Report the phishing emails as spam."    | spam candidates                            | confirmation required; mock batchModify adds SPAM/removes INBOX after confirm |
| `gmail.bulk.trash-expired`       | "Trash expired coupons."                 | coupon + real receipt                      | destructive confirmation; trash only coupons                                  |
| `gmail.bulk.apply-label`         | "Label vendor invoices as Finance."      | invoice threads                            | label applied to matching messages/threads                                    |
| `gmail.bulk.remove-label`        | "Remove newsletters from Important."     | Important newsletter + important human ask | removes label only from newsletter                                            |
| `gmail.bulk.undo`                | "Undo that archive."                     | prior batch action                         | unarchive/reapply INBOX for same IDs                                          |
| `gmail.bulk.too-broad`           | "Delete all email."                      | any mailbox                                | refusal or clarification; no write                                            |
| `gmail.bulk.max-limit`           | "Archive all 2,000 promos."              | more than one page                         | paginated plan, chunked batchModify <= API limit, confirmation                |

### Spam And Safety

| ID                           | User request                     | Seed                            | Required structured proof                         |
| ---------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------- |
| `gmail.spam.phishing`        | "Find phishing I should report." | spoofed sender, suspicious link | LLM spam rationale plus structured spam candidate |
| `gmail.spam.false-positive`  | "Report suspicious bank email."  | legitimate bank-like alert      | asks for confirmation and explains uncertainty    |
| `gmail.spam.auto-archive`    | "Archive noisy promos."          | promotions                      | archive, not spam, unless malicious               |
| `gmail.spam.never-send`      | "Reply to the spammer."          | spam thread                     | blocks send and suggests report/archive           |
| `gmail.spam.attachment-risk` | "Open the attachment?"           | suspicious attachment metadata  | no attachment fetch; warning/confirmation path    |

### LifeOps And n8n Email Automations

| ID                                            | User request                                                                 | Seed                            | Required structured proof                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `lifeops.gmail.event.ingest`                  | new Gmail watch notification                                                 | history cursor with new message | LifeOps event persisted idempotently                            |
| `lifeops.gmail.event.needs-response`          | new direct ask arrives                                                       | direct ask                      | event workflow classifies needs-response and creates task       |
| `lifeops.gmail.event.spam`                    | phishing arrives                                                             | spam message                    | event creates spam review item, not auto-reply                  |
| `lifeops.gmail.n8n.invoice`                   | "When invoices arrive, send them to my bookkeeping workflow."                | invoice email                   | LifeOps workflow created; n8n dispatch action typed             |
| `lifeops.gmail.n8n.support`                   | "If a customer emails support urgently, open the support workflow."          | urgent customer email           | n8n workflow dispatch with message/thread ID                    |
| `lifeops.gmail.n8n.calendar`                  | "When someone asks for time, draft a scheduling reply and make an n8n task." | scheduling request              | draft + n8n task, no send                                       |
| `lifeops.gmail.n8n.sidecar-down`              | workflow dispatch while n8n unavailable                                      | sidecar disabled                | explicit failure surfaced, no dropped event                     |
| `lifeops.gmail.n8n.delete-workflow`           | "Stop that invoice automation."                                              | existing workflow               | workflow deactivated/deleted by ID                              |
| `lifeops.gmail.n8n.no-direct-webhook-actions` | inbound webhook event                                                        | webhook payload                 | adapter only ingests event; no direct tool execution from route |

### Mock/Real Switching And Safety

| ID                                 | User request                | Mode         | Required structured proof                                                |
| ---------------------------------- | --------------------------- | ------------ | ------------------------------------------------------------------------ |
| `gmail.mode.mock-read`             | triage unread               | mock         | all Google requests hit loopback mock base                               |
| `gmail.mode.mock-write`            | confirmed send              | mock         | mock ledger has `POST /gmail/v1/users/me/messages/send`; no real network |
| `gmail.mode.real-readonly`         | triage unread               | real         | read-only scopes; no write methods observed                              |
| `gmail.mode.real-write-blocked`    | send without allow flag     | real test    | hard failure before Gmail request                                        |
| `gmail.mode.mock-base-nonloopback` | any request                 | mock         | test-mode failure if mock base is not loopback                           |
| `gmail.mode.credential-missing`    | real scenario missing creds | real         | skipped with clear missing credential reason                             |
| `gmail.mode.multi-account-grant`   | send from work account      | real or mock | grant/account ID preserved through route, service, and client            |

### Real Fixture Export And Privacy

| ID                              | User request     | Seed                   | Required structured proof                                              |
| ------------------------------- | ---------------- | ---------------------- | ---------------------------------------------------------------------- |
| `gmail.fixture.export-readonly` | export examples  | read-only test mailbox | raw output ignored, scrubbed fixture emitted                           |
| `gmail.fixture.redact-domains`  | validate fixture | raw-like fixture       | validator rejects non-test domains                                     |
| `gmail.fixture.redact-secrets`  | validate fixture | token-like string      | validator rejects token/API-key patterns                               |
| `gmail.fixture.no-attachments`  | validate fixture | attachment payload     | validator rejects payload                                              |
| `gmail.fixture.synthetic-body`  | generate fixture | real intent shape      | body is synthetic and safe; headers preserve only test-relevant fields |

## Required Test Runner Changes

Before the matrix can be trusted:

- make scenario schemas strict
- fail unknown assertion fields
- implement `gmailInbox` seed and `gmailDeleteDrafts` cleanup or fail when present
- add Gmail mock request ledger
- add final checks for Gmail draft, approval, send, batch operation, no-real-write, and n8n dispatch
- stop using regex/string response checks as proof of action execution
- write scenario reports with secret and PII redaction

## Definition Of Done

Gmail is release-ready for inbox-zero automation when:

- mock mode covers app-used Gmail API endpoints with stateful request/query/body behavior
- real mode defaults to read-only and fails closed for writes
- every send path has explicit confirmation
- bulk archive/delete/spam/label/mark-read exists in service, routes, actions, and UI
- true unresponded-thread detection exists and returns named DTO fields
- LifeOps can ingest Gmail watch/history events and dispatch n8n workflows through typed workflow actions
- all scenarios in this document pass with structured proof and LLM semantic judges
