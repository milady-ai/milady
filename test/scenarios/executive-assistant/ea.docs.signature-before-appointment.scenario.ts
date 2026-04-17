import { scenario } from "@elizaos/scenario-schema";

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
      responseIncludesAny: ["sign", "docs", "appointment", "before", "clinic"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-signature-before-appointment-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: document-request tracking tied to appointment timing is not yet fully wired into LifeOps.",
    },
  ],
});
