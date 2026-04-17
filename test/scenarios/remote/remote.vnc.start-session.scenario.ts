import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.vnc.start-session",
  title: "Start a remote VNC session on user request",
  domain: "remote",
  tags: ["remote", "vnc", "happy-path", "not-yet-implemented"],
  description:
    "User asks agent to open a remote-help session; agent opens a VNC/Tailscale channel and returns connection info. Requires T9a remote-control data plane.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Remote VNC Start Session",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "start-vnc",
      room: "main",
      text: "Start a remote session so a friend can help me fix my laptop.",
      responseIncludesAny: ["session", "remote", "VNC", "connect", "link"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-vnc-start-session-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote-control data plane: VNC/Tailscale session lifecycle + share link generation).",
    },
  ],
});
