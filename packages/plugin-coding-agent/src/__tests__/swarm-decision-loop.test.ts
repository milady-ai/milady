/**
 * Tests for swarm-decision-loop.ts
 *
 * Covers handleBlocked (auto-resolved, LLM respond/escalate/complete, MAX_AUTO_RESPONSES),
 * executeDecision (respond text, respond keys, complete stops session),
 * and handleTurnComplete (LLM complete → stop, continue → no stop, failure fallback).
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import type {
  SwarmCoordinatorContext,
  TaskContext,
} from "../services/swarm-coordinator.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the LLM model call via runtime.useModel
const mockUseModel = jest.fn();

function createMockCtx(
  overrides: Partial<SwarmCoordinatorContext> = {},
): SwarmCoordinatorContext {
  return {
    runtime: {
      useModel: mockUseModel,
    } as unknown as SwarmCoordinatorContext["runtime"],
    ptyService: {
      getSessionOutput: jest.fn().mockResolvedValue("$ some output"),
      sendToSession: jest.fn().mockResolvedValue(undefined),
      sendKeysToSession: jest.fn().mockResolvedValue(undefined),
      stopSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as SwarmCoordinatorContext["ptyService"],
    tasks: new Map(),
    inFlightDecisions: new Set(),
    pendingDecisions: new Map(),
    lastSeenOutput: new Map(),
    lastToolNotification: new Map(),
    broadcast: jest.fn(),
    sendChatMessage: jest.fn(),
    log: jest.fn(),
    getSupervisionLevel: jest.fn().mockReturnValue("autonomous"),
    ...overrides,
  };
}

function createMockTaskCtx(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    sessionId: "test-session",
    agentType: "claude",
    label: "test-agent",
    originalTask: "Fix the bug",
    workdir: "/workspace",
    status: "active",
    decisions: [],
    autoResolvedCount: 0,
    registeredAt: Date.now(),
    lastActivityAt: Date.now(),
    idleCheckCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

const { handleBlocked, executeDecision, handleTurnComplete } = await import(
  "../services/swarm-decision-loop.js"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("swarm-decision-loop", () => {
  let ctx: SwarmCoordinatorContext;
  let taskCtx: TaskContext;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockCtx();
    taskCtx = createMockTaskCtx();
    ctx.tasks.set(taskCtx.sessionId, taskCtx);
  });

  // =========================================================================
  // handleBlocked
  // =========================================================================
  describe("handleBlocked", () => {
    it("handles auto-resolved events without calling LLM", async () => {
      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Allow write?" },
        autoResponded: true,
      });

      expect(taskCtx.autoResolvedCount).toBe(1);
      expect(taskCtx.decisions).toHaveLength(1);
      expect(taskCtx.decisions[0].decision).toBe("auto_resolved");
      expect(mockUseModel).not.toHaveBeenCalled();
      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "blocked_auto_resolved" }),
      );
    });

    it("calls LLM and executes respond decision in autonomous mode", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "respond",
          response: "y",
          reasoning: "Safe to approve",
        }),
      );

      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Continue? (Y/n)" },
        autoResponded: false,
      });

      expect(mockUseModel).toHaveBeenCalled();
      expect(taskCtx.decisions).toHaveLength(1);
      expect(taskCtx.decisions[0].decision).toBe("respond");
      // Should have sent the response
      const pty = ctx.ptyService as unknown as {
        sendToSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.sendToSession).toHaveBeenCalledWith("test-session", "y");
    });

    it("escalates when LLM returns escalate", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "escalate",
          reasoning: "Requires human judgment",
        }),
      );

      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Design choice?" },
        autoResponded: false,
      });

      expect(taskCtx.decisions[0].decision).toBe("escalate");
      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "coordination_decision" }),
      );
    });

    it("LLM complete triggers completion flow", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "complete",
          reasoning: "Task is done",
        }),
      );

      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Ready" },
        autoResponded: false,
      });

      expect(taskCtx.decisions[0].decision).toBe("complete");
      const pty = ctx.ptyService as unknown as {
        stopSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.stopSession).toHaveBeenCalledWith("test-session");
    });

    it("escalates after MAX_AUTO_RESPONSES consecutive auto-responses", async () => {
      taskCtx.autoResolvedCount = 10; // MAX_AUTO_RESPONSES

      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Another prompt" },
        autoResponded: false,
      });

      expect(taskCtx.decisions).toHaveLength(1);
      expect(taskCtx.decisions[0].decision).toBe("escalate");
      expect(taskCtx.decisions[0].reasoning).toContain("10");
      expect(mockUseModel).not.toHaveBeenCalled();
    });

    it("escalates when LLM returns invalid response", async () => {
      mockUseModel.mockResolvedValueOnce("not json");

      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Some prompt" },
        autoResponded: false,
      });

      expect(taskCtx.decisions[0].decision).toBe("escalate");
      expect(taskCtx.decisions[0].reasoning).toContain("invalid");
    });

    it("decays autoResolvedCount by 1 on LLM decision (not reset to 0)", async () => {
      taskCtx.autoResolvedCount = 5;

      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "respond",
          response: "y",
          reasoning: "Approve",
        }),
      );

      await handleBlocked(ctx, "test-session", taskCtx, {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      expect(taskCtx.autoResolvedCount).toBe(4);
    });
  });

  // =========================================================================
  // executeDecision
  // =========================================================================
  describe("executeDecision", () => {
    it("sends text response for respond action", async () => {
      await executeDecision(ctx, "test-session", {
        action: "respond",
        response: "y",
        reasoning: "Approve",
      });

      const pty = ctx.ptyService as unknown as {
        sendToSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.sendToSession).toHaveBeenCalledWith("test-session", "y");
    });

    it("sends keys for respond action with useKeys", async () => {
      await executeDecision(ctx, "test-session", {
        action: "respond",
        useKeys: true,
        keys: ["down", "enter"],
        reasoning: "Select option",
      });

      const pty = ctx.ptyService as unknown as {
        sendKeysToSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.sendKeysToSession).toHaveBeenCalledWith("test-session", [
        "down",
        "enter",
      ]);
    });

    it("stops session on complete", async () => {
      await executeDecision(ctx, "test-session", {
        action: "complete",
        reasoning: "Task finished",
      });

      expect(taskCtx.status).toBe("completed");
      const pty = ctx.ptyService as unknown as {
        stopSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.stopSession).toHaveBeenCalledWith("test-session");
      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "task_complete" }),
      );
    });

    it("broadcasts escalation on escalate", async () => {
      await executeDecision(ctx, "test-session", {
        action: "escalate",
        reasoning: "Needs human",
      });

      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "escalation" }),
      );
    });
  });

  // =========================================================================
  // handleTurnComplete
  // =========================================================================
  describe("handleTurnComplete", () => {
    it("LLM complete → stops session", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "complete",
          reasoning: "All objectives met",
        }),
      );

      await handleTurnComplete(ctx, "test-session", taskCtx, {
        response: "Created PR #42",
      });

      expect(taskCtx.status).toBe("completed");
      const pty = ctx.ptyService as unknown as {
        stopSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.stopSession).toHaveBeenCalledWith("test-session");
    });

    it("LLM respond → sends follow-up, does not stop", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "respond",
          response: "Now run the tests",
          reasoning: "Tests not run yet",
        }),
      );

      await handleTurnComplete(ctx, "test-session", taskCtx, {
        response: "Wrote the code",
      });

      const pty = ctx.ptyService as unknown as {
        sendToSession: ReturnType<typeof jest.fn>;
        stopSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.sendToSession).toHaveBeenCalledWith(
        "test-session",
        "Now run the tests",
      );
      expect(pty.stopSession).not.toHaveBeenCalled();
      expect(taskCtx.status).toBe("active");
    });

    it("LLM failure → falls back to complete", async () => {
      mockUseModel.mockResolvedValueOnce("garbage");

      await handleTurnComplete(ctx, "test-session", taskCtx, {
        response: "Done",
      });

      // Should fall back to complete
      expect(taskCtx.decisions).toHaveLength(1);
      expect(taskCtx.decisions[0].decision).toBe("complete");
      expect(taskCtx.decisions[0].reasoning).toContain("invalid response");
    });

    it("skips assessment when in-flight decision exists", async () => {
      ctx.inFlightDecisions.add("test-session");

      await handleTurnComplete(ctx, "test-session", taskCtx, {
        response: "Done",
      });

      expect(mockUseModel).not.toHaveBeenCalled();
      expect(taskCtx.decisions).toHaveLength(0);
    });
  });
});
