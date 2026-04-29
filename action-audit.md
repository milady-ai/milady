# Action Audit

Scanned **147** actions across **124** files.
**High:** 0 · **Medium:** 4 · **Low:** 16

## Violations (14)

| Action | Severity | Rule | Detail | File |
| --- | --- | --- | --- | --- |
| `CLEAR_LOGS` | medium | `thin-description` | Action CLEAR_LOGS description is only ~59 chars (min 60) — small models will mis-classify | `eliza/packages/agent/src/actions/logs.ts` |
| `LIST_REMOTE_SESSIONS` | medium | `thin-description` | Action LIST_REMOTE_SESSIONS description is only ~46 chars (min 60) — small models will mis-classify | `eliza/apps/app-lifeops/src/actions/list-remote-sessions.ts` |
| `REVOKE_REMOTE_SESSION` | medium | `thin-description` | Action REVOKE_REMOTE_SESSION description is only ~46 chars (min 60) — small models will mis-classify | `eliza/apps/app-lifeops/src/actions/revoke-remote-session.ts` |
| `SCRATCHPAD_READ` | medium | `thin-description` | Action SCRATCHPAD_READ description is only ~30 chars (min 60) — small models will mis-classify | `eliza/packages/agent/src/actions/scratchpad.ts` |
| `CHAT_THREAD_CONTROL` | low | `missing-examples` | Action CHAT_THREAD_CONTROL has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/chat-thread-control.ts` |
| `CHAT_THREAD_CONTROL` | low | `missing-parameters` | Action CHAT_THREAD_CONTROL declares no parameters block | `eliza/apps/app-lifeops/src/actions/chat-thread-control.ts` |
| `CROSS_PLATFORM_GATEWAY` | low | `missing-examples` | Action CROSS_PLATFORM_GATEWAY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/cross-platform-gateway.ts` |
| `CROSS_PLATFORM_GATEWAY` | low | `missing-parameters` | Action CROSS_PLATFORM_GATEWAY declares no parameters block | `eliza/apps/app-lifeops/src/actions/cross-platform-gateway.ts` |
| `EMAIL_UNSUBSCRIBE` | low | `missing-parameters` | Action EMAIL_UNSUBSCRIBE declares no parameters block | `eliza/apps/app-lifeops/src/actions/email-unsubscribe.ts` |
| `FETCH_BROWSER_ACTIVITY` | low | `missing-examples` | Action FETCH_BROWSER_ACTIVITY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `FETCH_BROWSER_ACTIVITY` | low | `missing-parameters` | Action FETCH_BROWSER_ACTIVITY declares no parameters block | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `MANAGE_TASKS` | low | `missing-examples` | Action MANAGE_TASKS has no examples — planner will only see description/similes | `eliza/packages/agent/src/actions/manage-tasks.ts` |
| `MANAGE_TASKS` | low | `missing-parameters` | Action MANAGE_TASKS declares no parameters block | `eliza/packages/agent/src/actions/manage-tasks.ts` |
| `PAYMENTS` | low | `missing-parameters` | Action PAYMENTS declares no parameters block | `eliza/apps/app-lifeops/src/actions/payments.ts` |
| `REGISTER_BROWSER_SESSION` | low | `missing-examples` | Action REGISTER_BROWSER_SESSION has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `REGISTER_BROWSER_SESSION` | low | `missing-parameters` | Action REGISTER_BROWSER_SESSION declares no parameters block | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `SCHEDULE_X_DM_REPLY` | low | `missing-examples` | Action SCHEDULE_X_DM_REPLY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/schedule-x-dm-reply.ts` |
| `SCHEDULE_X_DM_REPLY` | low | `missing-parameters` | Action SCHEDULE_X_DM_REPLY declares no parameters block | `eliza/apps/app-lifeops/src/actions/schedule-x-dm-reply.ts` |
| `SEARCH_ACROSS_CHANNELS` | low | `missing-examples` | Action SEARCH_ACROSS_CHANNELS has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/search-across-channels.ts` |
| `SUBSCRIPTIONS` | low | `missing-parameters` | Action SUBSCRIPTIONS declares no parameters block | `eliza/apps/app-lifeops/src/actions/subscriptions.ts` |

## Clean (133)

| Action | File |
| --- | --- |
| `ADD_AUTOFILL_WHITELIST` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `AGENT_INBOX` | `eliza/packages/agent/src/actions/agent-inbox.ts` |
| `AGENT_SEND_MESSAGE` | `eliza/packages/agent/src/actions/send-message.ts` |
| `ANALYZE_IMAGE` | `eliza/packages/agent/src/actions/media.ts` |
| `ANNOTATE_TRAJECTORY` | `eliza/packages/agent/src/actions/trajectories.ts` |
| `APPROVE_REQUEST` | `eliza/apps/app-lifeops/src/actions/approval.ts` |
| `ARCHIVE_CODING_TASK` | `eliza/packages/agent/src/actions/tasks-coding.ts` |
| `BLOCK_APPS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `BLOCK_UNTIL_TASK_COMPLETE` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/blockUntilTaskComplete.ts` |
| `BLOCK_WEBSITES` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `BOOK_TRAVEL` | `eliza/apps/app-lifeops/src/actions/book-travel.ts` |
| `BROWSER_SESSION` | `eliza/packages/agent/src/actions/browser-session.ts` |
| `CALENDAR_ACTION` | `eliza/apps/app-lifeops/src/actions/calendar.ts` |
| `CALENDLY` | `eliza/apps/app-lifeops/src/actions/calendly.ts` |
| `CALL_EXTERNAL` | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `CALL_USER` | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `CHECK_AVAILABILITY` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `COMPUTE_TRAVEL_BUFFER` | `eliza/apps/app-lifeops/src/travel-time/action.ts` |
| `CONFIGURE_PLUGIN` | `eliza/packages/agent/src/actions/configure-plugin.ts` |
| `CREATE_WORKFLOW` | `eliza/packages/agent/src/actions/workflow/create-workflow.ts` |
| `DELETE_WORKFLOW` | `eliza/packages/agent/src/actions/workflow/delete-workflow.ts` |
| `DESCRIBE_REGISTERED_ACTIONS` | `eliza/packages/agent/src/actions/runtime.ts` |
| `DISCONNECT_CONNECTOR` | `eliza/packages/agent/src/actions/connector-control.ts` |
| `DOSSIER` | `eliza/apps/app-lifeops/src/actions/dossier.ts` |
| `EDIT_MEMORY` | `eliza/packages/agent/src/actions/memories.ts` |
| `EJECT_PLUGIN` | `eliza/packages/agent/src/actions/eject-plugin.ts` |
| `EXECUTE_DATABASE_QUERY` | `eliza/packages/agent/src/actions/database.ts` |
| `EXPORT_LOGS` | `eliza/packages/agent/src/actions/logs.ts` |
| `EXPORT_TRAJECTORY_DATASET` | `eliza/packages/agent/src/actions/trajectories.ts` |
| `EXTRACT_PAGE` | `eliza/packages/agent/src/actions/extract-page.ts` |
| `FORGET_MEMORY` | `eliza/packages/agent/src/actions/memories.ts` |
| `GENERATE_AUDIO` | `eliza/packages/agent/src/actions/media.ts` |
| `GENERATE_DOSSIER` | `eliza/apps/app-lifeops/src/dossier/action.ts` |
| `GENERATE_IMAGE` | `eliza/packages/agent/src/actions/media.ts` |
| `GENERATE_VIDEO` | `eliza/packages/agent/src/actions/media.ts` |
| `GET_ACTIVITY_REPORT` | `eliza/apps/app-lifeops/src/actions/activity-report.ts` |
| `GET_APP_BLOCK_STATUS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `GET_RELATIONSHIP_ACTIVITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `GET_RUNTIME_STATUS` | `eliza/packages/agent/src/actions/runtime.ts` |
| `GET_SELF_STATUS` | `eliza/packages/agent/src/actions/get-self-status.ts` |
| `GET_TABLE_DATA` | `eliza/packages/agent/src/actions/database.ts` |
| `GET_TIME_ON_APP` | `eliza/apps/app-lifeops/src/actions/activity-report.ts` |
| `GET_TIME_ON_SITE` | `eliza/apps/app-lifeops/src/actions/activity-report.ts` |
| `GET_WEBSITE_BLOCK_STATUS` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `GMAIL_ACTION` | `eliza/apps/app-lifeops/src/actions/gmail.ts` |
| `GO_LIVE` | `eliza/packages/agent/src/actions/stream-control.ts` |
| `GO_OFFLINE` | `eliza/packages/agent/src/actions/stream-control.ts` |
| `HEALTH` | `eliza/apps/app-lifeops/src/actions/health.ts` |
| `INBOX` | `eliza/apps/app-lifeops/src/actions/inbox.ts` |
| `INBOX_TRIAGE_GMAIL` | `eliza/apps/app-lifeops/src/actions/inbox-triage.ts` |
| `INSTALL_PLUGIN` | `eliza/packages/agent/src/actions/install-plugin.ts` |
| `INTENT_SYNC` | `eliza/apps/app-lifeops/src/actions/intent-sync.ts` |
| `LIFE` | `eliza/apps/app-lifeops/src/actions/life.ts` |
| `LIFEOPS_COMPUTER_USE` | `eliza/apps/app-lifeops/src/actions/computer-use.ts` |
| `LIFEOPS_CONNECTOR` | `eliza/apps/app-lifeops/src/actions/lifeops-connector.ts` |
| `LIFEOPS_MUTATE` | `eliza/apps/app-lifeops/src/actions/lifeops-mutate.ts` |
| `LINK_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `LIST_ACTIVE_BLOCKS` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/listActiveBlocks.ts` |
| `LIST_AUTOFILL_WHITELIST` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `LIST_CONNECTORS` | `eliza/packages/agent/src/actions/connector-control.ts` |
| `LIST_DATABASE_TABLES` | `eliza/packages/agent/src/actions/database.ts` |
| `LIST_EJECTED_PLUGINS` | `eliza/packages/agent/src/actions/list-ejected.ts` |
| `LIST_INSTALLED_PLUGINS` | `eliza/packages/agent/src/actions/list-installed-plugins.ts` |
| `LIST_OVERDUE_FOLLOWUPS` | `eliza/apps/app-lifeops/src/followup/actions/listOverdueFollowups.ts` |
| `LOG_LEVEL` | `eliza/packages/agent/src/actions/log-level.ts` |
| `MARK_FOLLOWUP_DONE` | `eliza/apps/app-lifeops/src/followup/actions/markFollowupDone.ts` |
| `OWNER_APP_BLOCK` | `eliza/apps/app-lifeops/src/actions/owner-app-block.ts` |
| `OWNER_CALENDAR` | `eliza/apps/app-lifeops/src/actions/owner-calendar.ts` |
| `OWNER_INBOX` | `eliza/apps/app-lifeops/src/actions/owner-inbox.ts` |
| `OWNER_RELATIONSHIP` | `eliza/apps/app-lifeops/src/actions/relationships.ts` |
| `OWNER_REMOTE_DESKTOP` | `eliza/apps/app-lifeops/src/actions/owner-remote-desktop.ts` |
| `OWNER_SCHEDULE` | `eliza/apps/app-lifeops/src/actions/owner-schedule.ts` |
| `OWNER_SCREEN_TIME` | `eliza/apps/app-lifeops/src/actions/owner-screen-time.ts` |
| `OWNER_SEND_MESSAGE` | `eliza/apps/app-lifeops/src/actions/cross-channel-send.ts` |
| `OWNER_WEBSITE_BLOCK` | `eliza/apps/app-lifeops/src/actions/owner-website-block.ts` |
| `PASSWORD_MANAGER` | `eliza/apps/app-lifeops/src/actions/password-manager.ts` |
| `PROMOTE_TASK_TO_WORKFLOW` | `eliza/packages/agent/src/actions/workflow/promote-task-to-workflow.ts` |
| `PROPOSE_MEETING_TIMES` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `PUBLISH_DEVICE_INTENT` | `eliza/apps/app-lifeops/src/actions/device-bus.ts` |
| `QUERY_LOGS` | `eliza/packages/agent/src/actions/logs.ts` |
| `QUERY_TRAJECTORIES` | `eliza/packages/agent/src/actions/trajectories.ts` |
| `READ_CHANNEL` | `eliza/packages/agent/src/actions/read-channel.ts` |
| `READ_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `READ_MESSAGES` | `eliza/packages/agent/src/actions/read-messages.ts` |
| `RECALL_MEMORY_FILTERED` | `eliza/packages/agent/src/actions/memories.ts` |
| `REINJECT_PLUGIN` | `eliza/packages/agent/src/actions/reinject-plugin.ts` |
| `REJECT_REQUEST` | `eliza/apps/app-lifeops/src/actions/approval.ts` |
| `RELEASE_BLOCK` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/releaseBlock.ts` |
| `RELOAD_RUNTIME_CONFIG` | `eliza/packages/agent/src/actions/runtime.ts` |
| `REMOTE_DESKTOP` | `eliza/apps/app-lifeops/src/actions/remote-desktop.ts` |
| `REOPEN_CODING_TASK` | `eliza/packages/agent/src/actions/tasks-coding.ts` |
| `REQUEST_FIELD_FILL` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `REQUEST_WEBSITE_BLOCKING_PERMISSION` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `RESOLVE_MERGE_CANDIDATE` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `RESTART_AGENT` | `eliza/packages/agent/src/actions/restart.ts` |
| `RESTART_RUNTIME` | `eliza/packages/agent/src/actions/runtime.ts` |
| `RUN_MORNING_CHECKIN` | `eliza/apps/app-lifeops/src/actions/checkin.ts` |
| `RUN_NIGHT_CHECKIN` | `eliza/apps/app-lifeops/src/actions/checkin.ts` |
| `SAVE_CONNECTOR_CONFIG` | `eliza/packages/agent/src/actions/connector-control.ts` |
| `SCHEDULING` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `SCRATCHPAD_ADD` | `eliza/packages/agent/src/actions/scratchpad.ts` |
| `SCRATCHPAD_DELETE` | `eliza/packages/agent/src/actions/scratchpad.ts` |
| `SCRATCHPAD_REPLACE` | `eliza/packages/agent/src/actions/scratchpad.ts` |
| `SCRATCHPAD_SEARCH` | `eliza/packages/agent/src/actions/scratchpad.ts` |
| `SCREEN_TIME` | `eliza/apps/app-lifeops/src/actions/screen-time.ts` |
| `SEARCH_CONVERSATIONS` | `eliza/packages/agent/src/actions/search-conversations.ts` |
| `SEARCH_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `SEARCH_VECTORS` | `eliza/packages/agent/src/actions/database.ts` |
| `SEND_ADMIN_MESSAGE` | `eliza/packages/agent/src/actions/send-admin-message.ts` |
| `SET_FOLLOWUP_THRESHOLD` | `eliza/apps/app-lifeops/src/followup/actions/setFollowupThreshold.ts` |
| `SET_USER_NAME` | `eliza/packages/agent/src/actions/set-user-name.ts` |
| `SHELL_COMMAND` | `eliza/packages/agent/src/actions/terminal.ts` |
| `SKILL_COMMAND` | `eliza/packages/agent/src/actions/skill-command.ts` |
| `START_REMOTE_SESSION` | `eliza/apps/app-lifeops/src/actions/start-remote-session.ts` |
| `SYNC_PLUGIN` | `eliza/packages/agent/src/actions/sync-plugin.ts` |
| `TOGGLE_AUTO_TRAINING` | `eliza/packages/agent/src/actions/settings-actions.ts` |
| `TOGGLE_CAPABILITY` | `eliza/packages/agent/src/actions/settings-actions.ts` |
| `TOGGLE_CONNECTOR` | `eliza/packages/agent/src/actions/connector-control.ts` |
| `TOGGLE_LIFEOPS_FEATURE` | `eliza/apps/app-lifeops/src/actions/feature-toggle.ts` |
| `TOGGLE_PLUGIN` | `eliza/packages/agent/src/actions/toggle-plugin.ts` |
| `TOGGLE_WORKFLOW_ACTIVE` | `eliza/packages/agent/src/actions/workflow/toggle-workflow-active.ts` |
| `TWILIO_VOICE_CALL` | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `UNBLOCK_APPS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `UNBLOCK_WEBSITES` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `UNINSTALL_PLUGIN` | `eliza/packages/agent/src/actions/uninstall-plugin.ts` |
| `UPDATE_AI_PROVIDER` | `eliza/packages/agent/src/actions/settings-actions.ts` |
| `UPDATE_IDENTITY` | `eliza/packages/agent/src/actions/settings-actions.ts` |
| `UPDATE_MEETING_PREFERENCES` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `UPDATE_OWNER_NAME` | `eliza/packages/agent/src/actions/update-owner-name.ts` |
| `UPDATE_OWNER_PROFILE` | `eliza/apps/app-lifeops/src/actions/update-owner-profile.ts` |
| `UPDATE_PLUGIN` | `eliza/packages/agent/src/actions/update-plugin.ts` |
| `WEB_SEARCH` | `eliza/packages/agent/src/actions/web-search.ts` |
| `X_READ` | `eliza/apps/app-lifeops/src/actions/x-read.ts` |
