# Milaidy Life-Ops Implementation Plan

Date: 2026-04-04
Owner: Shaw / Milady
Input PRD: `/Users/shawwalters/Downloads/milaidy_prd_v1.docx`

## 1. Executive summary

The clean implementation path is to build Milaidy's life-ops system in Milady core, not by stretching `@elizaos/plugin-todo` and `@elizaos/plugin-goals` until they become a second product.

The existing stack already gives us four important foundations:

- `eliza/packages/typescript/src/services/task.ts` gives us a real scheduler substrate.
- `milady/packages/agent/src/triggers/*` gives us a workable inspectable workflow shell.
- `milady/packages/agent/src/api/workbench-*` and `packages/app-core/src/components/chat/TasksEventsPanel.tsx` give us the right UI insertion point.
- Milady already has OAuth-style onboarding and credential persistence patterns for Anthropic/OpenAI subscriptions that we can reuse for Google.

The missing pieces are the actual product primitives from the PRD:

- task definition versus occurrence
- habits with morning/night windows
- reminder plans and escalation ladders
- first-class goals and workflows
- connector grants and channel policies
- personal Google Calendar and Gmail OAuth
- private browser visibility state
- auditability for why something fired

## 2. Review snapshot

### 2.1 PRD conclusions

The PRD is directionally correct. The core product is not a task list. It is a behavior-support system that needs durable primitives, deterministic scheduling, explicit permissions, and private-channel safety.

The most important architectural sentence in the PRD is effectively correct: introduce a small set of durable primitives instead of one-off reminder logic.

### 2.2 `eliza/` review

Relevant reuse points:

- `eliza/docs/TASK_SCHEDULER.md`
- `eliza/packages/typescript/src/services/task.ts`

Conclusion:

- Reuse `TaskService` as the scheduler and worker substrate.
- Do not use raw tasks as the user-facing domain model for habits/goals/reminders. They are the execution layer, not the source of truth.

### 2.3 `milady/` review

Relevant reuse points:

- onboarding and provider-selection flow in `packages/app-core/src/onboarding/*`
- local subscription OAuth pattern in `packages/agent/src/api/subscription-routes.ts`
- credential persistence in `packages/app-core/src/auth/credentials.ts`
- trigger runtime in `packages/agent/src/triggers/*`
- workbench aggregation in `packages/agent/src/api/workbench-helpers.ts`
- right-rail task surface in `packages/app-core/src/components/chat/TasksEventsPanel.tsx`

Conclusion:

- Milady already has the right shape for connector onboarding, local credential storage, workbench rendering, and background execution.
- The implementation should slot into these existing seams instead of inventing a parallel shell.

### 2.4 `plugins/` review

Local plugin inventory in this workspace: 126 plugin directories.

Most relevant local plugins:

- `plugin-browser`
- `plugin-cron`
- `plugin-experience`
- `plugin-gmail-watch`
- `plugin-goals`
- `plugin-google-chat`
- `plugin-google-genai`
- `plugin-imessage`
- `plugin-personality`
- `plugin-rolodex`
- `plugin-scheduling`
- `plugin-signal`
- `plugin-telegram`
- `plugin-todo`
- `plugin-trust`
- `plugin-twilio`
- `plugin-webhooks`
- `plugin-whatsapp`

Conclusions:

- `plugin-todo` is useful as a compatibility surface for simple todos and reminder UIs, but it is too flat to be the primary data model for occurrences, due windows, progression rules, or escalation.
- `plugin-goals` is too shallow for the PRD's goal-support behavior.
- `plugin-browser` is directly useful and should be reused for the visible-browser requirement.
- `plugin-gmail-watch` is not a user OAuth solution. It is a later-stage server-side ingest optimization after account binding exists.
- `plugin-scheduling` may help with meeting creation logic, but it does not replace Google Calendar sync.
- `plugin-twilio`, `plugin-signal`, `plugin-whatsapp`, `plugin-telegram`, and `plugin-imessage` are the right channel adapters for escalation once policy and consent exist.

### 2.5 `elizaOS-plugins` registry review

Registry snapshot date: 2026-04-04
Registry index URL: `https://raw.githubusercontent.com/elizaos-plugins/registry/main/index.json`
Registry size at review time: 371 entries

High-level conclusion:

- The registry is broad on channels, model providers, wallets, and execution tools.
- It does not already contain the product-specific personal life-ops domain we need.
- There is no existing first-class personal Google Calendar plus Gmail connector for Milaidy's local-first behavior-support use case.

## 3. Architectural decisions

### 3.1 Build life-ops in Milady core first

Do not start by creating a generic registry plugin for the entire product surface.

Reason:

- the data model is still moving
- the UX is tightly coupled to Milady's chat and right rail
- the product needs app-specific permission and privacy behavior
- the current plugin-todo and plugin-goals boundaries are not the right abstraction

Recommendation:

- implement the domain in `milady/packages/agent` and `milady/packages/app-core`
- reuse plugins only for connectors and external actions
- extract a plugin later only if the domain stabilizes and other apps genuinely need the same primitives

### 3.2 Core primitives

Create these as first-class Milady objects:

- `TaskDefinition`: one logical task or habit rule
- `TaskOccurrence`: one concrete actionable window derived from a definition
- `GoalDefinition`: an ongoing desired condition or recurring relationship objective
- `WorkflowDefinition`: a scheduled or rule-based automation
- `ReminderPlan`: multi-step channel and timing policy
- `ConnectorGrant`: a connected account plus granted scopes and allowed capabilities
- `ChannelPolicy`: which channels may be used for private reminders, escalations, or public posting
- `AuditEvent`: why the system suggested, reminded, escalated, synced, or acted

### 3.3 Source of truth versus execution layer

Use this split consistently:

- Life-ops tables are the product source of truth.
- `TaskService` tasks are derived execution jobs.
- Workbench panels render from life-ops read models, with optional compatibility projections into existing todo/task panels.

That split prevents scheduler details from leaking into the user model.

## 4. Proposed package and file layout

### 4.1 Shared types

Add shared DTOs and enums under `milady/packages/shared/src/lifeops/`:

- `types.ts`
- `dto.ts`
- `scopes.ts`
- `policies.ts`
- `audit.ts`

These should hold:

- lifecycle enums
- connector capability enums
- API request and response shapes
- reminder channel enums
- workflow schedule DTOs
- audit event DTOs

### 4.2 Agent-side domain

Add `milady/packages/agent/src/lifeops/`:

- `schema.ts`
- `repository.ts`
- `definitions-service.ts`
- `occurrence-engine.ts`
- `occurrence-materializer.ts`
- `reminder-engine.ts`
- `escalation-engine.ts`
- `workflow-service.ts`
- `workflow-runner.ts`
- `google-scopes.ts`
- `google-oauth.ts`
- `google-calendar-service.ts`
- `gmail-triage-service.ts`
- `channel-policy-service.ts`
- `audit-service.ts`
- `read-models.ts`

Add API routes:

- `packages/agent/src/api/lifeops-routes.ts`
- `packages/agent/src/api/google-connector-routes.ts`
- `packages/agent/src/api/reminder-routes.ts`
- `packages/agent/src/api/goals-routes.ts`
- `packages/agent/src/api/workflow-routes.ts`

### 4.3 App-core UI and client state

Add `milady/packages/app-core/src/lifeops/` and adjacent UI modules:

- `api/client-lifeops.ts`
- `state/useLifeOpsState.ts`
- `state/useGoogleConnectorState.ts`
- `components/chat/TodayTasksWidget.tsx`
- `components/chat/CalendarWidget.tsx`
- `components/chat/ReminderStateWidget.tsx`
- `components/settings/GoogleConnectorSettings.tsx`
- `components/settings/ChannelPolicySettings.tsx`
- `components/goals/GoalsView.tsx`
- `components/workflows/WorkflowsView.tsx`
- `components/reminders/ReminderHistoryView.tsx`

Modify:

- `packages/app-core/src/components/chat/TasksEventsPanel.tsx`
- onboarding connection components so Google appears as a first-class connector
- workbench client and polling hooks so right-rail data includes calendar, reminders, and goal attention state

## 5. Data model

### 5.1 Task definitions

Table: `life_task_definitions`

Suggested fields:

- `id`
- `user_id`
- `kind` (`task`, `habit`, `routine`)
- `title`
- `description`
- `original_intent`
- `timezone`
- `status` (`active`, `paused`, `archived`)
- `priority`
- `cadence_json`
- `window_policy_json`
- `progression_rule_json`
- `default_reminder_plan_id`
- `goal_id` nullable
- `source` (`chat`, `gmail`, `calendar`, `workflow`, `manual`)
- `created_at`
- `updated_at`

Important rule:

- this table stores the rule, not every future repetition

### 5.2 Task occurrences

Table: `life_task_occurrences`

Suggested fields:

- `id`
- `definition_id`
- `occurrence_key`
- `relevance_start_at`
- `scheduled_at` nullable
- `due_at` nullable
- `relevance_end_at`
- `state` (`pending`, `visible`, `snoozed`, `completed`, `skipped`, `expired`, `muted`)
- `snoozed_until` nullable
- `completion_payload_json`
- `derived_target_json`
- `rule_version`
- `created_at`
- `updated_at`

Important rules:

- occurrence rows are bounded windows, not immortal repeating todos
- completion affects the current occurrence only
- snooze mutates the occurrence, not the definition

### 5.3 Goals

Table: `life_goal_definitions`

Suggested fields:

- `id`
- `user_id`
- `title`
- `description`
- `cadence_json` nullable
- `support_strategy_json`
- `success_criteria_json`
- `status`
- `review_state`
- `created_at`
- `updated_at`

Support table: `life_goal_links`

- link goals to task definitions, workflows, reminders, or connector-derived suggestions

### 5.4 Workflows

Tables:

- `life_workflow_definitions`
- `life_workflow_runs`

Definition fields:

- `id`
- `user_id`
- `title`
- `trigger_type`
- `schedule_json`
- `action_plan_json`
- `permission_policy_json`
- `status`
- `created_by`
- `created_at`
- `updated_at`

Run fields:

- `id`
- `workflow_id`
- `started_at`
- `finished_at`
- `status`
- `result_json`
- `audit_ref`

### 5.5 Reminder and escalation

Tables:

- `life_reminder_plans`
- `life_reminder_attempts`

Plan fields:

- `id`
- `owner_type`
- `owner_id`
- `steps_json`
- `mute_policy_json`
- `quiet_hours_json`
- `created_at`
- `updated_at`

Attempt fields:

- `id`
- `plan_id`
- `owner_type`
- `owner_id`
- `occurrence_id` nullable
- `channel`
- `step_index`
- `scheduled_for`
- `attempted_at`
- `outcome`
- `connector_ref`
- `delivery_metadata_json`

### 5.6 Connectors and permissions

Tables:

- `life_connector_grants`
- `life_channel_policies`

Connector grant fields:

- `id`
- `provider` (`google`, `x`, `telegram`, `discord`, `twilio`, `signal`, `whatsapp`, `imessage`)
- `identity_json`
- `granted_scopes_json`
- `capabilities_json`
- `token_ref`
- `mode` (`local`, `remote`)
- `last_refresh_at`
- `created_at`
- `updated_at`

Channel policy fields:

- `id`
- `channel_type`
- `channel_ref`
- `privacy_class` (`private`, `shared`, `public`)
- `allow_reminders`
- `allow_escalation`
- `allow_posts`
- `require_confirmation_for_actions`

### 5.7 Audit log

Table: `life_audit_events`

Fields:

- `id`
- `event_type`
- `owner_type`
- `owner_id`
- `reason`
- `inputs_json`
- `decision_json`
- `actor` (`agent`, `user`, `workflow`, `connector`)
- `created_at`

This is mandatory for the PRD's "why did this happen" requirement.

## 6. Scheduling and occurrence semantics

### 6.1 Morning and night

Do not hardcode `morning = 8am` and `night = 10pm`.

Implement a `time-of-day window policy` that supports:

- explicit windows
- timezone-aware defaults
- per-user sleep offset overrides later
- fallback defaults for users who never configured sleep rhythm

Initial default:

- `morning`: local 05:00 to 12:00
- `afternoon`: local 12:00 to 17:00
- `evening`: local 17:00 to 22:00
- `night`: local 22:00 to 04:00 next day

Then add a user-level override model in P0.5 or P1:

- preferred wake window
- preferred sleep window
- irregular schedule flag

### 6.2 Occurrence generation

Implement deterministic occurrence generation:

- generate only the current and near-future window, not infinite rows
- derive current occurrence from definition cadence plus timezone plus window policy
- keep an `occurrence_key` stable enough to dedupe regeneration after restart
- persist enough derived state to survive restarts and snoozes

### 6.3 Reminder evaluation

The reminder engine should run on a short cadence, ideally every minute.

Mechanics:

- query visible and soon-due occurrences
- query upcoming calendar events inside reminder thresholds
- check channel policy and quiet hours
- emit reminder attempts into `life_reminder_attempts`
- create derived scheduler tasks only for the next due reminder step, not the whole ladder

### 6.4 Workflow scheduling

Use Milady triggers and `TaskService` as the execution substrate for workflows.

Important split:

- user-facing workflow definition lives in life-ops tables
- low-level trigger/task rows are execution plumbing and can be replaced without changing the product model

## 7. Google OAuth and permissions plan

### 7.1 Capability model

Represent Google permissions as product capabilities, not raw scope strings in the UI.

Suggested capability groups:

- `google.basic_identity`
- `google.calendar.read`
- `google.calendar.write`
- `google.gmail.triage`
- `google.gmail.send`

Map these to scopes on the backend.

Recommended initial scope map:

- basic identity: `openid`, `email`, `profile`
- calendar read: `https://www.googleapis.com/auth/calendar.readonly`
- calendar write: `https://www.googleapis.com/auth/calendar.events`
- gmail triage: start with `https://www.googleapis.com/auth/gmail.metadata` if metadata-only triage is enough, otherwise `https://www.googleapis.com/auth/gmail.readonly`
- gmail send later: `https://www.googleapis.com/auth/gmail.send`

Important caveat from Google's current docs:

- installed-app OAuth does not support incremental authorization the same way confidential web-server apps do
- for local/native Milady, adding Gmail later likely means re-consenting with the union of requested scopes

That is acceptable. Plan the UX explicitly around re-consent.

### 7.2 Local-first desktop flow

Use Google's installed-app OAuth flow with PKCE and a loopback redirect.

Recommended local flow:

1. User clicks `Connect Google`.
2. Milady local API route creates `state`, `code_verifier`, `code_challenge`, and a loopback listener on `127.0.0.1` using a random port.
3. API returns an auth URL.
4. Desktop shell opens the system browser.
5. Google redirects to `http://127.0.0.1:{port}/oauth/google/callback?...`.
6. Local agent exchanges the authorization code for access and refresh tokens.
7. Tokens are stored locally and referenced by `life_connector_grants`.
8. UI polls `GET /api/connectors/google/status` or receives websocket status.

Why this is correct:

- it matches Google's installed-app guidance
- it avoids embedded webviews, which Google disallows for OAuth
- it preserves the local-first trust model

### 7.3 Hosted web or remote runtime flow

For Milady web or Eliza Cloud-hosted runtimes, use Google's confidential web-server OAuth flow.

Recommended remote flow:

1. User clicks `Connect Google` from a remote-backed session.
2. Remote server generates `state` and redirect URL for a web OAuth client.
3. Browser redirects to Google consent.
4. Google returns to a remote HTTPS callback.
5. Remote server exchanges the code and stores encrypted refresh tokens server-side.
6. UI polls the same connector status endpoint.

Important design rule:

- local and remote should share the same product capability model and status APIs
- only the token broker changes

### 7.4 Token storage

Do not overload the current subscription credential store with Google payloads.

Instead:

- keep OAuth token material in a connector-specific encrypted store
- persist token references and granted scopes in `life_connector_grants`
- keep the existing `~/.eliza/auth` pattern as a local storage precedent, but give Google its own files or keystore entries

Recommended local storage options in order:

- OS keychain if Milady desktop already has a secure native credential bridge
- file-based encrypted token blobs with `0600` perms if keychain support is not ready
- never store Google refresh tokens in plain config JSON

### 7.5 Calendar sync design

P1 should not start with push notifications.

Start with:

- periodic pull sync for the next 1 to 7 days
- sync token or etag-based incremental fetches where possible
- local cache table for event summaries used by the right-rail widget and reminder engine

Then add later:

- push notifications if the operational value justifies it

The current `plugin-gmail-watch` pattern is a warning here: push infra is operationally expensive and not required for a single-user local-first MVP.

### 7.6 Gmail design

Do not start Gmail with server-side full-message ingestion.

Safer rollout:

- Stage 1: local-only Gmail triage using metadata or readonly scope, cached locally, summarize in-app
- Stage 2: draft suggestions only, no send action without explicit user approval
- Stage 3: optional send permission via a distinct capability and separate consent copy
- Stage 4: optional server-side watch / push if and only if product value outweighs verification and security costs

### 7.7 Compliance reality

Google's current documentation makes the risk explicit:

- Calendar scopes should be kept narrow and least-privilege.
- Gmail scopes such as `gmail.readonly`, `gmail.modify`, and even `gmail.metadata` are listed as restricted scopes.
- If restricted-scope Gmail data is stored on servers or transmitted through servers, Google requires a restricted-scope verification process and a third-party security assessment.

Practical implication:

- If you want the fastest path, ship Calendar first and keep Gmail local-only in early development and test projects.
- If Eliza Labs wants cloud Gmail for external users, budget for verification and annual security assessment.

### 7.8 What Eliza Labs needs to do

Eliza Labs can own the Google Cloud project and request the auth. The concrete checklist is:

1. Create separate Google Cloud projects for `dev/test` and `production`.
2. Enable these APIs in the project:
   - Google Calendar API
   - Gmail API
   - People API or basic OpenID userinfo only if display-name inference is wanted
3. Configure the OAuth consent screen.
4. Verify the app domains used in the consent screen, privacy policy, and callback hosts.
5. Create OAuth clients:
   - Desktop client for Milady local/native flow
   - Web client for remote or hosted flow
   - Mobile-specific clients later if native mobile shipping matters
6. Register redirect targets:
   - desktop installed-app loopback flow
   - local web dev callback
   - production HTTPS callback on Milady/Eliza-owned domain
7. Start production scope submission with this order:
   - basic identity
   - calendar read
   - calendar write
   - gmail triage
   - gmail send only when draft/send feature is real
8. Decide whether Gmail P1 is local-test-only or production-verified.
9. If Gmail restricted data will transit or rest on Eliza Labs servers, start the restricted-scope verification and security-assessment path early.
10. For Workspace tenants, be ready for `admin_policy_enforced` cases where admins must explicitly allow the app.

### 7.9 Immediate recommendation for Shaw

Use this rollout order:

- dev project immediately
- external test users only at first
- Calendar first in production path
- Gmail behind test users until the verification decision is made

This keeps product work moving without waiting on Google's full review cycle.

## 8. Product delivery plan by phase

### 8.1 P0: Core support loop

Scope:

- conversational onboarding
- task and habit model
- morning and night windows
- occurrence generation
- snooze and completion
- right-rail basics
- privacy-safe defaults

Backend work:

- add life-ops schema and repositories
- add occurrence engine
- add reminder plan model with in-app delivery only
- add read models for current tasks and active reminders
- add chat intent mapping from natural language into task, habit, or goal definition
- persist original user phrasing

Frontend work:

- replace or extend `TasksEventsPanel` to show:
  - current task occurrences
  - active reminders
  - placeholder calendar area
- add quick actions:
  - complete
  - snooze 15m
  - snooze 30m
  - tonight
  - tomorrow morning
- add a simple goals view separate from immediate tasks

Exit criteria:

- one task definition produces bounded occurrences
- morning occurrence is not visible late at night if expired
- snooze survives app restart
- recurring completion affects current occurrence only
- goals are distinct from tasks in storage and UI

### 8.2 P1: Schedule and inbox

Scope:

- Google auth
- calendar widget
- event reminders
- Gmail triage
- scheduling commands

Backend work:

- implement Google connector routes and token storage
- add calendar cache and sync job
- add calendar reminder integration into reminder engine
- add Gmail triage service and local cache
- add event scheduling commands with explicit write capability checks

Frontend work:

- Google connector settings/onboarding card
- calendar widget with today list and next-event context
- fuller calendar detail screen
- inbox summary panel for important mail and likely replies
- consent and re-consent UX for additional Google capabilities

Exit criteria:

- local or remote Google auth succeeds
- widget shows today's events
- agent answers "what's on my calendar today?"
- agent answers "what do I need to know for my next event?"
- Gmail triage surfaces important mail without auto-sending anything

### 8.3 P2: Escalation and workflows

Scope:

- SMS and phone permissions
- escalation engine
- scheduled workflows
- audit logs

Backend work:

- channel policy service
- escalation engine with per-step laddering
- connector adapters for Twilio and approved private messaging channels
- workflow execution runner on top of triggers and `TaskService`
- audit-event capture for reminder firing, delivery attempt, escalation, and workflow execution

Frontend work:

- consent UX for phone and SMS
- workflow editor and pause/resume controls
- reminder history and reason view
- audit trail in task, goal, and event details

Exit criteria:

- reminder plan can escalate from in-app to approved private channels
- workflows are inspectable, editable, pausable, and attributable
- user can inspect why a reminder fired and what channel was used

### 8.4 P3: Social and browser depth

Scope:

- X read/write with separated permissions
- browser session visibility
- richer context synthesis

Backend work:

- X connector grant model with distinct read and write capabilities
- browser session presence adapter that exposes session state to workbench APIs
- policy checks that require confirmation before public posting or account-affecting browser actions

Frontend work:

- visible browser-state widget
- open-inspect browser session affordance
- X scope and posting policy UI

Exit criteria:

- user can see whether an agent browser session is active, waiting, navigating, or done
- X posting never happens without explicit confirmation or a separately-approved trusted policy

## 9. Implementation sequencing inside the codebase

### 9.1 First code slice

Implement these in order:

1. shared types and schema
2. occurrence engine
3. basic life-ops routes
4. right-rail read model
5. task and habit chat mapping
6. snooze and completion actions

This produces P0 value before touching Google.

### 9.2 Second code slice

Implement Google connector shell before calendar sync logic.

Order:

1. `google-scopes.ts`
2. `google-oauth.ts`
3. connector status route
4. onboarding/settings UI
5. calendar sync read path
6. scheduling write path
7. Gmail triage path

### 9.3 Third code slice

Add escalation only after the private-channel policy model exists. Otherwise you will create reminder spam and privacy regressions.

## 10. Validation strategy

### 10.1 Unit tests

Must cover:

- natural-language intent classification into task versus habit versus goal versus workflow
- occurrence generation across timezones and day boundaries
- morning/night relevance logic
- snooze rescheduling and restart persistence
- progression rules for habits
- reminder ladder step selection
- channel policy gating
- audit event emission

### 10.2 API and integration tests

Must cover:

- life-ops CRUD routes
- workbench overview aggregation
- Google connector start/status/disconnect routes
- calendar cache refresh behavior
- Gmail triage read models
- workflow create/update/pause/execute routes
- reminder execution and escalation logs

### 10.3 UI tests

Must cover:

- onboarding connector card visibility and status
- right-rail calendar and reminders widgets
- snooze/complete UX
- browser state visibility
- goal review surfaces
- explicit confirmation before risky actions

### 10.4 Live connector tests

Must cover:

- desktop loopback OAuth callback
- remote HTTPS callback
- token refresh
- revoked grant recovery
- calendar sync against a real account
- Gmail triage against a real account
- policy behavior when a Workspace admin blocks scopes

### 10.5 Added validation artifact

Add a dedicated contract suite that inventories the PRD acceptance criteria and milestone-specific TODOs.

File to add:

- `packages/agent/test/milaidy-life-ops-prd-validation.e2e.test.ts`

Purpose:

- keep the acceptance inventory inside the repo
- force the work to be tracked by phase and domain
- provide a place to replace `todo` cases with executable tests as implementation lands

## 11. Recommended decisions that should not slip

- Do not make `plugin-todo` the source of truth.
- Do not start Gmail with server-side restricted-scope ingest unless Eliza Labs is ready for verification and assessment work.
- Do not ship escalation before channel policy and auditability exist.
- Do not let public or shared channels receive private life-management content by default.
- Do not bury Google capability grants as raw OAuth scopes in the UI. Keep user-facing permissions product-readable.

## 12. Immediate next actions

1. Approve the in-core architecture for life-ops.
2. Have Eliza Labs create the Google Cloud dev project and desktop plus web OAuth clients.
3. Implement P0 data model and occurrence engine before touching Gmail.
4. Implement Google Calendar read-only auth and widget before Gmail send or workflow escalation.
5. Keep Gmail external-user rollout behind test users until the verification decision is explicit.
