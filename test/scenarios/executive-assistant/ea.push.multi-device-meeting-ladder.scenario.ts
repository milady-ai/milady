import { scenario } from "@elizaos/scenario-schema";

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
      responseIncludesAny: ["hour", "ten minutes", "Mac", "phone", "meeting"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-multi-device-meeting-ladder-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: cross-device reminder ladders plus acknowledgement sync are not yet fully wired into the executive-assistant escalation stack.",
    },
  ],
});
