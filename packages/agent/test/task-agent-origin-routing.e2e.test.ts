/**
 * E2E coverage for task-agent status routing back to the originating chat.
 *
 * This test uses the real AgentRuntime, real PTYService, real SwarmCoordinator,
 * real API server bridge wiring, and real room/thread records in PGLite.
 *
 * We capture only the final connector send sink in-process because a live
 * Telegram/Discord connector is not required to validate the routing bug.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ChannelType, type AgentRuntime, type Content, type UUID } from "@elizaos/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PTYService } from "../../../plugins/plugin-agent-orchestrator/src/services/pty-service.js";
import type { SwarmCoordinator } from "../../../plugins/plugin-agent-orchestrator/src/services/swarm-coordinator.js";
import { startApiServer } from "../src/api/server";
import { installTaskProgressStreamer } from "../src/runtime/task-progress-streamer";
import { createTestRuntime } from "../../../test/helpers/pglite-runtime";

type OutboundMessage = {
  target: {
    source: string;
    roomId: UUID;
    channelId: string | UUID;
    serverId?: string | null;
  };
  content: Content;
};

function waitForOutbound(
  outbound: OutboundMessage[],
  predicate: (entry: OutboundMessage) => boolean,
  timeoutMs = 15_000,
): Promise<OutboundMessage> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const match = outbound.find(predicate);
      if (match) {
        clearInterval(timer);
        resolve(match);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for outbound connector message"));
      }
    }, 50);
  });
}

describe("Task agent origin routing", () => {
  let runtime: AgentRuntime;
  let cleanupRuntime: (() => Promise<void>) | null = null;
  let ptyService: PTYService;
  let coordinator: SwarmCoordinator;
  let server: { port: number; close: () => Promise<void> } | null = null;
  let workdir = "";
  let roomId: UUID;
  let worldId: UUID;
  let userId: UUID;
  const outbound: OutboundMessage[] = [];

  beforeAll(async () => {
    const setup = await createTestRuntime({
      characterName: "TaskAgentOriginRoutingE2E",
    });
    runtime = setup.runtime;
    cleanupRuntime = setup.cleanup;

    workdir = await mkdtemp(path.join(os.tmpdir(), "milady-task-routing-e2e-"));

    runtime.sendMessageToTarget = (async (target, content) => {
      outbound.push({
        target: {
          source: String(target.source),
          roomId: target.roomId as UUID,
          channelId: target.channelId,
          serverId:
            typeof target.serverId === "string" ? target.serverId : null,
        },
        content,
      });
      return [];
    }) as typeof runtime.sendMessageToTarget;

    ptyService = await PTYService.start(runtime);
    (runtime.services as Map<string, unknown[]>).set("PTY_SERVICE", [ptyService]);
    coordinator = ptyService.coordinator as SwarmCoordinator;
    installTaskProgressStreamer(runtime, ptyService);

    roomId = crypto.randomUUID() as UUID;
    worldId = crypto.randomUUID() as UUID;
    userId = crypto.randomUUID() as UUID;

    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId,
      userName: "Routing E2E User",
      source: "telegram",
      channelId: "telegram-routing-e2e",
      type: ChannelType.DM,
    });

    server = await startApiServer({ port: 0, runtime });
  }, 180_000);

  beforeEach(() => {
    outbound.length = 0;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    try {
      await ptyService?.stop();
    } catch {
      // Runtime cleanup below is the final fallback.
    }
    if (cleanupRuntime) {
      await cleanupRuntime();
    }
    if (workdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }, 180_000);

  it(
    "routes coordinator login issues back to the originating connector room",
    async () => {
      const taskThread = await coordinator.createTaskThread({
        title: "routing-login-e2e",
        originalRequest: "Handle a login-required task-agent interruption",
        roomId,
        worldId,
        ownerUserId: userId,
        acceptanceCriteria: [
          "Surface login-required interruptions back to the originating chat room.",
        ],
      });

      const sessionId = `routing-login-${Date.now()}`;
      await coordinator.registerTask(sessionId, {
        threadId: taskThread.id,
        agentType: "shell",
        label: "routing-login-shell",
        originalTask: "Wait for login to continue",
        workdir,
      });

      await coordinator.handleSessionEvent(sessionId, "login_required", {
        instructions: "Finish signing in to continue.",
        url: "https://example.com/login",
      });

      const delivered = await waitForOutbound(
        outbound,
        (entry) =>
          entry.target.roomId === roomId &&
          entry.target.source === "telegram" &&
          typeof entry.content.text === "string" &&
          entry.content.text.includes("needs a provider login"),
      );

      expect(delivered.target.channelId).toBe("telegram-routing-e2e");
      expect(delivered.content.source).toBe("coding-agent");
      expect(delivered.content.text).toContain("https://example.com/login");
    },
    60_000,
  );

  it(
    "routes PTY session-end issues back to the originating connector room",
    async () => {
      const taskThread = await coordinator.createTaskThread({
        title: "routing-session-end-e2e",
        originalRequest: "Handle a stopped task-agent session",
        roomId,
        worldId,
        ownerUserId: userId,
        acceptanceCriteria: [
          "Surface stopped task-agent sessions back to the originating chat room.",
        ],
      });

      const session = await ptyService.spawnSession({
        name: "routing-session-end-shell",
        agentType: "shell",
        workdir,
        metadata: {
          threadId: taskThread.id,
        },
      });

      ptyService.handleHookEvent(session.id, "session_end", {
        reason: "e2e_session_end",
      });

      const delivered = await waitForOutbound(
        outbound,
        (entry) =>
          entry.target.roomId === roomId &&
          entry.target.source === "telegram" &&
          entry.content.text === "task agent stopped before completion",
      );

      expect(delivered.target.channelId).toBe("telegram-routing-e2e");
      expect(delivered.content.source).toBe("telegram");

      await ptyService.stopSession(session.id, true).catch(() => {});
    },
    60_000,
  );
});
