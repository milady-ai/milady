import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "selfcontrol.override-requires-auth",
  title: "Early unblock override requires pairing code or password",
  domain: "selfcontrol",
  tags: ["lifeops", "selfcontrol", "not-yet-implemented", "permission-denied"],
  description:
    "User asks for an early unblock. Agent must require a pairing code / password before lifting the block. Blocked on T9a (remote / pairing auth).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "SelfControl Override Auth",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-early-unblock",
      room: "main",
      text: "Unblock X for me — I just need it for a minute.",
      forbiddenActions: ["BLOCK_WEBSITES"],
      responseIncludesAny: [
        /pairing/i,
        /password/i,
        /code/i,
        /auth/i,
        /verify/i,
        /cannot/i,
        /can't/i,
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "override-requires-auth-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote / pairing-token flow required to gate early-unblock overrides).",
    },
  ],
});
