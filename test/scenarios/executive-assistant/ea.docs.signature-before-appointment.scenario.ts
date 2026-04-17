import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.docs.signature-before-appointment",
  title: "Chase signature forms before an appointment",
  domain: "executive-assistant",
  tags: ["executive-assistant", "docs", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant reminds the user to sign forms before a clinic or office appointment.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Signature Before Appointment",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "signature-before-appointment",
      room: "main",
      text: "The clinic sent docs for me to sign before the appointment. Keep me on top of that.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["PUBLISH_DEVICE_INTENT", "LIFE", "CALENDAR_ACTION"],
        description: "signature reminder scheduling",
        includesAny: ["sign", "appointment", "clinic", "docs"],
      }),
      responseIncludesAny: ["sign", "docs", "appointment", "before", "clinic"],
    },
  ],
  finalChecks: [
    {
      type: "pushSent",
      channel: ["desktop", "mobile"],
    },
    {
      type: "custom",
      name: "ea-signature-before-appointment-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["PUBLISH_DEVICE_INTENT", "LIFE", "CALENDAR_ACTION"],
        description: "signature reminder scheduling",
        includesAny: ["sign", "appointment", "clinic", "docs"],
      }),
    },
  ],
});
