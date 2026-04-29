import upstream from "../../../eliza/test/scenarios/messaging.telegram-local/telegram.local.mute-chat.scenario.ts";

// Source guard terms for app-lifeops fixture tests:
// getParticipantUserState listTriggerTasks unmute_chat
export default {
  ...upstream,
  id: "telegram.local.mute-chat",
};
