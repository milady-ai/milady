import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.push.multi-device-meeting-ladder",
  title: "Send a multi-device reminder ladder before important meetings",
  domain: "executive-assistant",
  tags: ["executive-assistant", "push", "reminders", "transcript-derived"],
  description:
    "Transcript-derived case: remind on desktop and phone at one hour, ten minutes, and start time.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Multi-Device Meeting Ladder",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-reminder-ladder",
      room: "main",
      text: "For important meetings, remind me an hour before, ten minutes before, and right when they start on both my Mac and my phone.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["PUBLISH_DEVICE_INTENT", "CALENDAR_ACTION"],
        description: "multi-device meeting reminder ladder",
        includesAny: ["hour", "ten minutes", "mac", "phone", "meeting"],
      }),
      responseIncludesAny: ["hour", "ten minutes", "Mac", "phone", "meeting"],
    },
  ],
  finalChecks: [
    {
      type: "pushSent",
      channel: ["desktop", "mobile"],
    },
    {
      type: "pushEscalationOrder",
      channelOrder: ["desktop", "mobile"],
    },
    {
      type: "pushAcknowledgedSync",
      expected: true,
    },
    {
      type: "custom",
      name: "ea-multi-device-meeting-ladder-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["PUBLISH_DEVICE_INTENT", "CALENDAR_ACTION"],
        description: "multi-device meeting reminder ladder",
        includesAny: ["hour", "ten minutes", "mac", "phone", "meeting"],
      }),
    },
  ],
});
