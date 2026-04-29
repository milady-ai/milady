import upstream from "../../../eliza/test/scenarios/messaging.twitter-dm/twitter.dm.schedule-reply.scenario.ts";

// Source guard terms for app-lifeops fixture tests:
// listTriggerTasks REPLY_X_DM sendAtIso
export default {
  ...upstream,
  id: "twitter.dm.schedule-reply",
};
