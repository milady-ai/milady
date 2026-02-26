/**
 * Tests for swarm-idle-watchdog.ts
 *
 * Covers idle detection, output-change reset, force-escalation after MAX_IDLE_CHECKS,
 * and LLM failure path.
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import type {
  SwarmCoordinatorContext,
  TaskContext,
} from "../services/swarm-coordinator.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseModel = jest.fn();

function createMockCtx(
  overrides: Partial<SwarmCoordinatorContext> = {},
): SwarmCoordinatorContext {
  return {
    runtime: {
      useModel: mockUseModel,
    } as unknown as SwarmCoordinatorContext["runtime"],
    ptyService: {
      getSessionOutput: jest.fn().mockResolvedValue("$ idle output"),
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
    sessionId: "idle-session",
    agentType: "claude",
    label: "idle-agent",
    originalTask: "Work on feature",
    workdir: "/workspace",
    status: "active",
    decisions: [],
    autoResolvedCount: 0,
    registeredAt: Date.now(),
    lastActivityAt: Date.now() - 5 * 60 * 1000, // 5 min ago (past threshold)
    idleCheckCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { scanIdleSessions, handleIdleCheck, MAX_IDLE_CHECKS } = await import(
  "../services/swarm-idle-watchdog.js"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("swarm-idle-watchdog", () => {
  let ctx: SwarmCoordinatorContext;
  let taskCtx: TaskContext;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockCtx();
    taskCtx = createMockTaskCtx();
    ctx.tasks.set(taskCtx.sessionId, taskCtx);
  });

  // =========================================================================
  // scanIdleSessions — idle detection
  // =========================================================================
  describe("scanIdleSessions", () => {
    it("fires idle check after threshold", async () => {
      // Output hasn't changed (same as last seen)
      ctx.lastSeenOutput.set("idle-session", "$ idle output");

      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "ignore",
          reasoning: "Still working",
        }),
      );

      await scanIdleSessions(ctx);

      expect(taskCtx.idleCheckCount).toBe(1);
      expect(mockUseModel).toHaveBeenCalled();
    });

    it("resets idle counter when output changes", async () => {
      // Last seen is different from current output → fresh data
      ctx.lastSeenOutput.set("idle-session", "$ old output");
      taskCtx.idleCheckCount = 2;

      await scanIdleSessions(ctx);

      // Should reset to 0 and NOT call LLM
      expect(taskCtx.idleCheckCount).toBe(0);
      expect(mockUseModel).not.toHaveBeenCalled();
    });

    it("skips sessions that are not idle", async () => {
      taskCtx.lastActivityAt = Date.now(); // Active right now

      await scanIdleSessions(ctx);

      expect(mockUseModel).not.toHaveBeenCalled();
      expect(taskCtx.idleCheckCount).toBe(0);
    });

    it("skips completed sessions", async () => {
      taskCtx.status = "completed";

      await scanIdleSessions(ctx);

      expect(mockUseModel).not.toHaveBeenCalled();
    });

    it("skips sessions with in-flight decisions", async () => {
      ctx.lastSeenOutput.set("idle-session", "$ idle output");
      ctx.inFlightDecisions.add("idle-session");

      await scanIdleSessions(ctx);

      expect(mockUseModel).not.toHaveBeenCalled();
    });

    it("force-escalates after MAX_IDLE_CHECKS", async () => {
      ctx.lastSeenOutput.set("idle-session", "$ idle output");
      taskCtx.idleCheckCount = MAX_IDLE_CHECKS; // Next scan will exceed

      await scanIdleSessions(ctx);

      // Should escalate without calling LLM
      expect(mockUseModel).not.toHaveBeenCalled();
      expect(taskCtx.decisions).toHaveLength(1);
      expect(taskCtx.decisions[0].decision).toBe("escalate");
      expect(taskCtx.decisions[0].reasoning).toContain("Force-escalated");
      expect(ctx.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "escalation" }),
      );
      expect(ctx.sendChatMessage).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleIdleCheck — LLM assessment
  // =========================================================================
  describe("handleIdleCheck", () => {
    it("LLM respond sends nudge", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "respond",
          response: "continue",
          reasoning: "Agent seems stuck",
        }),
      );

      await handleIdleCheck(ctx, taskCtx, 5);

      const pty = ctx.ptyService as unknown as {
        sendToSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.sendToSession).toHaveBeenCalledWith(
        "idle-session",
        "continue",
      );
      expect(taskCtx.decisions).toHaveLength(1);
      expect(taskCtx.decisions[0].decision).toBe("respond");
    });

    it("LLM complete stops session", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "complete",
          reasoning: "Task objectives met",
        }),
      );

      await handleIdleCheck(ctx, taskCtx, 5);

      const pty = ctx.ptyService as unknown as {
        stopSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.stopSession).toHaveBeenCalledWith("idle-session");
    });

    it("LLM escalate broadcasts escalation", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "escalate",
          reasoning: "Something wrong",
        }),
      );

      await handleIdleCheck(ctx, taskCtx, 5);

      expect(ctx.sendChatMessage).toHaveBeenCalledWith(
        expect.stringContaining("needs your attention"),
        "coding-agent",
      );
    });

    it("LLM ignore logs but takes no action", async () => {
      mockUseModel.mockResolvedValueOnce(
        JSON.stringify({
          action: "ignore",
          reasoning: "Still compiling",
        }),
      );

      await handleIdleCheck(ctx, taskCtx, 5);

      const pty = ctx.ptyService as unknown as {
        sendToSession: ReturnType<typeof jest.fn>;
        stopSession: ReturnType<typeof jest.fn>;
      };
      expect(pty.sendToSession).not.toHaveBeenCalled();
      expect(pty.stopSession).not.toHaveBeenCalled();
      expect(ctx.log).toHaveBeenCalledWith(
        expect.stringContaining("still working"),
      );
    });

    it("LLM failure path escalates with chat message", async () => {
      mockUseModel.mockResolvedValueOnce("not valid json");

      await handleIdleCheck(ctx, taskCtx, 5);

      expect(ctx.sendChatMessage).toHaveBeenCalledWith(
        expect.stringContaining("couldn't determine status"),
        "coding-agent",
      );
      // Should not record a decision (early return)
      expect(taskCtx.decisions).toHaveLength(0);
    });

    it("cleans up in-flight set even on error", async () => {
      mockUseModel.mockRejectedValueOnce(new Error("LLM down"));

      await handleIdleCheck(ctx, taskCtx, 5);

      expect(ctx.inFlightDecisions.has("idle-session")).toBe(false);
    });
  });
});
