# Rewrite small-model operational replies into character voice

## Context

Many fast operational paths use `ModelType.TEXT_SMALL` correctly for cheap structured extraction, classification, or summarization, but then send fixed user-facing text such as "I couldn't understand...", "Please try again", "Message sent successfully.", or "I'll look into that." These callbacks bypass the configured character voice. The result is that action-heavy Discord, WhatsApp, trigger, task-agent, music, EVM, and personality flows sound like generic system canned responses even when the underlying chat model is otherwise in character.

The goal is not to make structured outputs poetic. JSON extraction, classifiers, validators, acceptance criteria, transaction facts, and internal summaries must remain deterministic. The issue is the visible prose around those results: success messages, parse failures, permission errors, not-found replies, no-result replies, and automation status fallbacks.

## Scope rule

Rewrite only user-visible operational prose. Do not rewrite:

- JSON or typed extraction payloads.
- Classifier decisions.
- Transaction-critical facts, addresses, amounts, assets, or warnings.
- Internal memories or telemetry.
- Search/read result data that must stay factual, except for short intro/fallback text.

## Detailed call-site inventory

All paths below are in `/Users/binkyfishai/milady-fisbat`.

### Discord action extraction paths with canned callbacks

- `plugins/plugin-discord/typescript/actions/sendMessage.ts:85-108`
  - `TEXT_SMALL` extracts `text` and `channelRef`.
  - Parse failure sends fixed text: user should make a clearer request.
  - Needs character-voice rewrite for parse failure while preserving that the message/channel could not be understood.

- `plugins/plugin-discord/typescript/actions/sendMessage.ts:118-120`, `151-165`, `196-197`
  - Sends fixed current-channel failure, non-text-channel failure, success text, and permission/error text.
  - Success text is especially generic: "Message sent successfully."

- `plugins/plugin-discord/typescript/actions/sendDM.ts:43-57`
  - `TEXT_SMALL` extracts recipient and DM body.
  - Extraction remains structured; only the visible wrapper/fallback text should change.

- `plugins/plugin-discord/typescript/actions/sendDM.ts:168-186`, `204-235`, `258-270`
  - Sends generic state unavailable, parse failure, user not found, cannot-DM-bot, success, DMs-disabled, and generic permission/error callbacks.
  - Success echoes recipient and content; rewrite must preserve both facts exactly.

- `plugins/plugin-discord/typescript/actions/pinMessage.ts:38-50`
  - `TEXT_SMALL` extracts message reference.
  - Keep extraction deterministic.

- `plugins/plugin-discord/typescript/actions/pinMessage.ts:125-136`, `145-177`, `232-254`, `268-283`
  - Sends canned service unavailable, parse failure, current-channel failure, non-text-channel failure, missing `Manage Messages` permission, not-found, already-pinned, success, max-pins, and generic permission/error text.
  - Rewrite should preserve permission names and the 50 pinned message limit.

- `plugins/plugin-discord/typescript/actions/unpinMessage.ts:41-53`
  - `TEXT_SMALL` extracts pinned message reference.

- `plugins/plugin-discord/typescript/actions/unpinMessage.ts:128-152`, `160-197`, `210-270`, `291-313`
  - Sends generic service/state failures, parse failure, current-channel failure, non-text-channel failure, missing `Manage Messages` permission, no pinned messages, matching pinned message not found, success, retry, and permission/error callbacks.

- `plugins/plugin-discord/typescript/actions/deleteMessage.ts:90-116`
  - `TEXT_SMALL` extracts `messageId` and `channelRef`.
  - Parse failure sends fixed text: could not determine which message to delete.

- `plugins/plugin-discord/typescript/actions/deleteMessage.ts:141-182`, `193-197`
  - Sends canned channel not found, message not found, no permission, success, and raw `Failed to delete message: ${errorMessage}` text.
  - Rewrite must preserve raw error detail or expose it as a required fact.

- `plugins/plugin-discord/typescript/actions/editMessage.ts:98-129`
  - `TEXT_SMALL` extracts `messageId`, `newText`, and `channelRef`.
  - Parse failure is generic and should be character-voiced.

- `plugins/plugin-discord/typescript/actions/editMessage.ts:154-190`, `202-206`
  - Sends fixed channel/message not found, own-message-only restriction, success text that quotes the new text, and raw `Failed to edit message: ${errorMessage}`.
  - Rewrite must preserve `newText` and error detail.

- `plugins/plugin-discord/typescript/actions/reactToMessage.ts:274-299`
  - `TEXT_SMALL` extracts reaction target/emoji for explicit reaction requests.
  - Parse failure currently includes a hard-coded example; rewrite can keep an example but should use character voice.

- `plugins/plugin-discord/typescript/actions/reactToMessage.ts:309-322`, `376-401`, `416-431`
  - Sends generic current-channel failure, non-text-channel failure, target-message not found, success, invalid emoji/permission, and generic permission/error callbacks.
  - Rewrite must preserve emoji tokens and target facts.

- `plugins/plugin-discord/typescript/actions/createPoll.ts:40-58`
  - `TEXT_SMALL` extracts question/options.
  - Poll body itself is deterministic and should stay deterministic by default.

- `plugins/plugin-discord/typescript/actions/createPoll.ts:138-162`, `172-188`, `244-268`
  - Sends generic service/state failures, parse failure, channel failures, success, and permission/error callbacks.
  - Rewrite success/failure prose but do not rewrite poll options.

- `plugins/plugin-discord/typescript/actions/searchMessages.ts:37-63`
  - `TEXT_SMALL` extracts search parameters.

- `plugins/plugin-discord/typescript/actions/searchMessages.ts:212-223`, `248-269`, `319-345`, `359-360`
  - Sends canned service unavailable, parse failure, server/channel lookup failure, no-results text, formatted results intro, and generic search error.
  - The result list should remain factual; the intro/no-result/error line should be character-voiced.

- `plugins/plugin-discord/typescript/actions/readChannel.ts:43-69`
  - `TEXT_SMALL` extracts channel read parameters.

- `plugins/plugin-discord/typescript/actions/readChannel.ts:165-183`, `215-256`, `291-325`, `357-364`, `390-412`
  - Sends generic state unavailable, parse failure, server/channel/permission failures, no messages, fixed summary preambles, fixed raw-message preamble, and generic read error.
  - Summary text uses `TEXT_LARGE`; the wrappers around it still need the character-voice helper.

- `plugins/plugin-discord/typescript/actions/joinChannel.ts:46-60`
  - `TEXT_SMALL` extracts join target and voice/text flag.

- `plugins/plugin-discord/typescript/actions/joinChannel.ts:245-263`, `333-420`, `433-457`
  - Sends state unavailable, parse failure, channel not found, voice unavailable, voice-channel success, already-listening, text-channel success, add-channel failure, and generic permission error text.
  - Rewrite must preserve channel names and mentions.

- `plugins/plugin-discord/typescript/actions/leaveChannel.ts:44-58`
  - `TEXT_SMALL` extracts leave target and voice/text flag.

- `plugins/plugin-discord/typescript/actions/leaveChannel.ts:272-374`, `416-506`, `521-522`
  - Sends service failure, voice unavailable, not in voice, no active connection, voice leave success, parse failure, channel not found, not listening, text-channel leave success, cannot remove configured channel, and generic retry text.
  - Rewrite must preserve whether the channel is configured in environment settings.

### Other Discord small-model utility/action paths

- `plugins/plugin-discord/typescript/actions/chatWithAttachments.ts:39-45`, `281-288`
  - Uses `TEXT_SMALL` for attachment chat/extraction and summary handling.
  - User-visible summary wrappers and failure text should use the helper; attachment-derived facts must remain unchanged.

- `plugins/plugin-discord/typescript/actions/getUserInfo.ts:30-36`
  - Uses `TEXT_SMALL` to extract user lookup parameters.
  - Any parse/not-found/result intro prose should be character-voiced.

- `plugins/plugin-discord/typescript/actions/transcribeMedia.ts:34-40`
  - Uses `TEXT_SMALL` to extract transcription target.
  - Visible parse/error wrappers should be rewritten; transcription text should remain factual.

- `plugins/plugin-discord/typescript/actions/summarizeConversation.ts:141-147`, `419-425`
  - Uses `TEXT_SMALL` for summary parameter extraction and later summary handling.
  - Summary wrapper/fallback text should be voiced; do not alter summarized facts.

- `plugins/plugin-discord/typescript/actions/downloadMedia.ts:35-41`
  - Uses `TEXT_SMALL` to extract media download target.
  - Parse/failure/success messages should use character voice while preserving filenames and media metadata.

- `plugins/plugin-discord/typescript/utils.ts:281-298`, `682`
  - Calls `TEXT_SMALL` for utility summarization/prompt handling.
  - If the returned text or fallback wrapper is posted directly, route it through the helper or include character instructions in the prompt.

### Core agent/API small-model paths

- `packages/agent/src/api/server.ts:3893-3910`
  - `triggerChatContinuation` already prompts `TEXT_SMALL` to stay in character.
  - Use this as the positive pattern for the shared helper.

- `packages/agent/src/api/server.ts:4059-4090`
  - Swarm synthesis fallback uses `TEXT_SMALL` and asks for personality, but the final no-LLM fallback is fixed: "All N task agents finished...".
  - When runtime is available, route the fallback through the helper; if no runtime exists, keep deterministic text.

- `packages/agent/src/api/server.ts:4096-4186`
  - Coordinator event routing forces small model for responsiveness and supplies `resolveNoResponseText: () => "I'll look into that."`.
  - This is a high-impact canned response and should be character-voiced.

- `packages/agent/src/api/chat-routes.ts:1590-1602`
  - Conversation title generation uses `TEXT_SMALL`.
  - Not a chat reply, but prompt should more explicitly use character flavor while keeping title clarity.

- `packages/agent/src/triggers/action.ts:173-194`, `310-336`, `361`
  - Trigger action uses `TEXT_SMALL` for extraction and sends generic empty-text, disabled, schedule failure, fallback note, and error messages.
  - These are visible action replies and should use the helper.

- `packages/agent/src/api/memory-routes.ts:329`
  - Uses `TEXT_SMALL`; needs classification as internal summary vs visible response.
  - If visible, rewrite wrapper/fallback text only.

- `packages/agent/src/api/misc-routes.ts:521`
  - Uses `TEXT_SMALL`; audit visible response path and route user-facing text through helper.

- `packages/agent/src/api/binance-skill-helpers.ts:904`
  - Uses `TEXT_SMALL` for a summary.
  - Keep financial/trade facts exact; character-voice only the surrounding explanation if user-visible.

- `packages/agent/src/api/character-routes.ts:512`
  - Uses `TEXT_SMALL`; classify whether output is metadata or visible prose before applying rewrite.

### Orchestrator and coding-agent small-model paths

- `plugins/plugin-agent-orchestrator/src/services/task-acceptance.ts:113`
  - Uses `TEXT_SMALL` to create structured acceptance criteria.
  - Do not characterize the criteria payload. Only user-visible fallback/reporting text around criteria should be rewritten.

- `plugins/plugin-agent-orchestrator/src/services/swarm-event-triage.ts:202`
  - Uses `TEXT_SMALL` for event triage.
  - Keep classifier output deterministic; rewrite any surfaced blocked/triage explanation.

- `plugins/plugin-agent-orchestrator/src/services/swarm-decision-loop.ts:812`, `1684`
  - Uses `TEXT_SMALL` for swarm decision paths.
  - Do not rewrite JSON/control decisions. Rewrite visible status/fallback messages only.

- `plugins/plugin-agent-orchestrator/src/services/swarm-idle-watchdog.ts:280`
  - Uses `TEXT_SMALL` for idle-watchdog decisions.
  - Any user-visible idle notice should be character-voiced.

- `plugins/plugin-agent-orchestrator/src/services/task-verifier-runner.ts:639`
  - Uses `TEXT_SMALL` for verification.
  - Preserve pass/fail facts; rewrite only visible summary prose.

- `plugins/plugin-agent-orchestrator/src/services/task-validation.ts:744`
  - Uses `TEXT_SMALL` for validation.
  - Keep validation output structured; rewrite visible validation failure prose.

- `plugins/plugin-agent-orchestrator/src/services/stall-classifier.ts:316`, `537`
  - Uses `TEXT_SMALL` for stall classification.
  - Do not rewrite classifier payload; rewrite user-facing stall reports.

- `plugins/plugin-coding-agent/src/services/swarm-decision-loop.ts:101`, `341`
  - Uses `TEXT_SMALL` for coding swarm decision paths.
  - Same rule: keep control output structured, rewrite visible status text.

- `plugins/plugin-coding-agent/src/services/swarm-idle-watchdog.ts:165`
  - Uses `TEXT_SMALL` for idle behavior.
  - Visible idle/blocked notices should be rewritten.

- `plugins/plugin-coding-agent/src/services/stall-classifier.ts:198`
  - Uses `TEXT_SMALL` for stall classification.
  - Classifier output stays deterministic; visible fallback summaries should use helper.

### Non-Discord plugin paths with visible operational replies

- `plugins/plugin-whatsapp/typescript/src/actions/sendMessage.ts:102-109`
  - Uses `TEXT_SMALL` to extract WhatsApp send parameters.
  - Parse failure, send success, and send failure callbacks should use the same character-voice helper.

- `plugins/plugin-whatsapp/typescript/src/actions/sendReaction.ts:102-109`
  - Uses `TEXT_SMALL` to extract reaction parameters.
  - Visible parse/success/failure text should be voiced while preserving emoji and message identifiers.

- `plugins/plugin-evm/typescript/actions/transfer.ts:78-83`
  - Uses `TEXT_SMALL` for transfer extraction.
  - Never rewrite addresses, amounts, chain names, assets, or warnings. Only rewrite surrounding validation/failure/success prose.

- `plugins/plugin-evm/typescript/providers/get-balance.ts:42`
  - Uses `TEXT_SMALL` around balance response generation.
  - Preserve balances/tokens exactly; apply character voice only to non-critical prose.

- `plugins/plugin-personality/typescript/src/actions/modify-character.ts:110`, `595`, `667`, `749`
  - Uses small/large models for intent, extraction, and safety.
  - Generic visible text around `modify-character.ts:267-456` includes unclear-instruction, safety rejection, validation error, and generic failure replies. These must be character-voiced carefully because this plugin changes character identity.

- `plugins/plugin-personality/typescript/src/evaluators/character-evolution.ts:129`, `260`
  - Uses small/large model analysis and stores example messages.
  - Most evaluator output is internal. Any visible evolution notification should go through the helper.

- `packages/plugin-music-library/src/services/musicEntityDetectionService.ts:81`
  - Uses `TEXT_SMALL` for entity detection.
  - Keep entity extraction structured. Rewrite visible "could not find/play" wrappers in the action layer.

- `packages/plugin-music-library/src/actions/playMusicQuery.ts:136`, `187`, `206`, `233`, `272`
  - Uses `TEXT_SMALL` for music query interpretation and answering.
  - User-visible answers and fallback text should include character context and avoid generic assistant phrasing while preserving artist/song/genre facts.

- `plugins/plugin-form/typescript/src/extraction.ts:188`, `384`, `491`
  - Uses `TEXT_SMALL` for form extraction.
  - Keep extracted fields structured. Rewrite visible validation/fallback messages if they reach chat.

- `plugins/plugin-experience/typescript/evaluators/experienceEvaluator.ts:149`
  - Uses `TEXT_SMALL` for experience extraction.
  - Internal evaluator output should remain structured; only visible summaries/fallbacks need the helper.

## Proposed implementation plan

1. Add a shared helper, likely in core or a shared action utility:

   `rewriteOperationalReply(runtime, state, input): Promise<string>`

   Suggested input fields:

   - `source`: platform/source such as `discord`, `whatsapp`, `coordinator`, `trigger`.
   - `actionName`: action or subsystem name.
   - `status`: `success`, `parse_failure`, `not_found`, `permission_denied`, `unavailable`, `error`, or `no_results`.
   - `defaultText`: current deterministic text.
   - `facts`: structured facts that must remain true.
   - `mustInclude`: exact strings that must appear unchanged.
   - `maxChars` or `maxTokens`.
   - `allowPersonality`: defaults true, can be false for safety-critical paths.

2. Implement the helper using `runtime.useModel(ModelType.TEXT_SMALL)` with a strict prompt:

   - Speak as `runtime.character.name`.
   - Match the character's style from character config and recent state.
   - Preserve all required facts exactly.
   - Do not add new actions, outcomes, permissions, IDs, amounts, or promises.
   - Return plain text only.
   - Stay concise.

3. Add post-generation validation:

   - Empty output falls back to `defaultText`.
   - Dropped `mustInclude` tokens fall back to `defaultText`.
   - Overlong output falls back or is trimmed only if no required facts are lost.
   - JSON-looking output is rejected for visible replies.

4. Migrate Discord action callbacks first.

   - Start with `sendMessage`, `sendDM`, `pinMessage`, `deleteMessage`, `editMessage`, `reactToMessage`, `createPoll`, `searchMessages`, `readChannel`, `joinChannel`, and `leaveChannel`.
   - Keep deterministic result payloads and `ActionResult.data` untouched.

5. Migrate core automation fallbacks next.

   - `server.ts` coordinator and swarm synthesis fallbacks.
   - `triggers/action.ts` visible trigger action replies.

6. Migrate WhatsApp, EVM, music, personality, form, and experience wrappers after the Discord/helper tests establish the pattern.

7. Add a classification note near remaining `TEXT_SMALL` calls:

   - `structured_extraction`
   - `classifier`
   - `internal_summary`
   - `user_visible_reply`

   This makes future audits cheap and avoids rewriting model-control outputs by accident.

## Acceptance criteria

- A shared helper exists for character-voice rewriting of visible operational replies.
- Representative Discord action handlers call the helper before sending visible success/failure/parse/permission/not-found prose.
- Existing deterministic fallback text remains available if rewrite fails.
- Required facts are preserved exactly, including channel mentions, usernames, message IDs, emoji tokens, permission names, error strings, token amounts, addresses, assets, and chain names.
- Structured extraction/classifier calls still return parseable JSON or typed outputs and are not polluted by personality prose.
- Tests cover at least:
  - success rewrite,
  - parse failure rewrite,
  - permission failure rewrite,
  - not-found/no-results rewrite,
  - helper model failure fallback,
  - must-include token preservation fallback.
- Coordinator/task-agent canned fallbacks such as "I'll look into that." are no longer emitted directly when runtime context is available.
- Search/read result lists remain factual and only the intro/fallback wrapper is rewritten.

## Risks and guardrails

- Risk: character rewrite hides critical permission or safety details.
  - Guardrail: required-fact validation and deterministic fallback.

- Risk: extra small-model calls slow down action responses.
  - Guardrail: only rewrite user-visible text, cap tokens tightly, and allow per-action opt-out.

- Risk: wallet/EVM rewrite changes transaction-critical facts.
  - Guardrail: exact preservation checks for addresses, amounts, assets, chains, and warnings; consider disabling rewrite for unsigned transaction confirmation prompts.

- Risk: classifiers and extraction prompts start returning prose.
  - Guardrail: never send structured/control outputs through the rewrite helper.

- Risk: Discord action callbacks become inconsistent during migration.
  - Guardrail: migrate one cluster at a time with tests and keep current text as fallback.

## Notes and blockers

- Direct GitHub issue creation was not performed because this session does not have a confirmed GitHub issue target/action request beyond producing the local issue draft. The audited checkout remote is `https://github.com/milady-ai/milady.git`.
- The repository was already dirty before this issue draft was added; no source code was changed.
- This file is the paste-ready issue body.
