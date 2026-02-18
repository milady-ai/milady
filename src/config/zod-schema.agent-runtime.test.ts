import { describe, expect, it } from "vitest";
import { HeartbeatSchema } from "./zod-schema.agent-runtime";

describe("HeartbeatSchema", () => {
  it("accepts heartbeat action allow/deny lists", () => {
    const parsed = HeartbeatSchema.parse({
      every: "20m",
      allowActions: ["home_timeline", "notifications_list"],
      denyActions: ["post_tweet_v3"],
    });

    expect(parsed?.allowActions).toEqual([
      "home_timeline",
      "notifications_list",
    ]);
    expect(parsed?.denyActions).toEqual(["post_tweet_v3"]);
  });

  it("rejects overlap between allowActions and denyActions", () => {
    const result = HeartbeatSchema.safeParse({
      every: "20m",
      allowActions: ["post_tweet_v3"],
      denyActions: ["post_tweet_v3"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["denyActions"]);
    }
  });
});
