import { scenario } from "@elizaos/scenario-schema";
import {
  attachFakeSubscriptionComputerUse,
  FakeSubscriptionComputerUseService,
} from "../../helpers/subscription-computer-use-fixture";

export default scenario({
  id: "subscriptions.cancel-google-play",
  title: "Cancel a Google Play subscription",
  domain: "browser.lifeops",
  tags: ["browser", "subscriptions", "happy-path"],
  description:
    "The agent should run the subscription cancellation flow through the browser executor, finish the flow, and return completion evidence.",
  isolation: "per-scenario",
  seed: [
    {
      type: "custom",
      name: "attach-fake-computeruse",
      apply: (ctx) => {
        const runtime = ctx.runtime as {
          getService?: (serviceType: string) => unknown;
        };
        attachFakeSubscriptionComputerUse(
          runtime,
          new FakeSubscriptionComputerUseService("google_play"),
        );
      },
    },
  ],
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cancel Google Play subscription",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "cancel-google-play",
      room: "main",
      text: "Cancel my Google Play subscription. I confirm the final cancellation step.",
      responseIncludesAny: ["Google Play", "completed", "cancellation"],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find(
          (action) => action.actionName === "SUBSCRIPTIONS",
        );
        if (!hit) {
          return "expected SUBSCRIPTIONS to run";
        }
        return undefined;
      },
    },
  ],
  finalChecks: [
    { type: "selectedAction", actionName: "SUBSCRIPTIONS" },
    { type: "browserTaskCompleted", expected: true },
    { type: "uploadedAssetExists", expected: true },
  ],
});
