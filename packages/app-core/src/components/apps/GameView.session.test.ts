import { describe, expect, it } from "vitest";
import { buildDisconnectedSessionState } from "./GameView";

describe("buildDisconnectedSessionState", () => {
  it("disables controls and messaging when a live session becomes unavailable", () => {
    expect(
      buildDisconnectedSessionState({
        sessionId: "agent-3",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "connecting",
        displayName: "Scout",
        canSendCommands: true,
        controls: ["pause"],
        summary: "Connecting session...",
        goalLabel: "Scout the ruins",
        suggestedPrompts: ["scan nearby ruins"],
        telemetry: { goalsPaused: false },
      }),
    ).toEqual(
      expect.objectContaining({
        sessionId: "agent-3",
        status: "disconnected",
        canSendCommands: false,
        controls: [],
        goalLabel: null,
        suggestedPrompts: [],
        telemetry: null,
        summary: "Session unavailable: Scout",
      }),
    );
  });
});
