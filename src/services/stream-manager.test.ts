import { describe, expect, it } from "vitest";
import { streamManager } from "./stream-manager";

describe("streamManager", () => {
  it("is idle by default and rejects frames when stopped", () => {
    const health = streamManager.getHealth();
    expect(health.running).toBe(false);
    expect(health.ffmpegAlive).toBe(false);
    expect(streamManager.getUptime()).toBe(0);
    expect(streamManager.writeFrame(Buffer.from("frame"))).toBe(false);
  });
});
