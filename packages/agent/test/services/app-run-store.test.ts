import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readAppRunStore,
  resolveAppRunStoreFilePath,
  writeAppRunStore,
} from "../../src/services/app-run-store";

describe("app run store migration", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { force: true, recursive: true });
      }
    }
  });

  it("migrates legacy v1 runs into the v2 store shape", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-run-store-"));
    tempDirs.push(stateDir);

    const legacyFilePath = path.join(stateDir, "apps", "runs.v1.json");
    fs.mkdirSync(path.dirname(legacyFilePath), { recursive: true });
    fs.writeFileSync(
      legacyFilePath,
      JSON.stringify(
        {
          version: 1,
          updatedAt: "2026-04-06T00:00:00.000Z",
          runs: [
            {
              runId: "run-1",
              appName: "@elizaos/app-hyperscape",
              displayName: "Hyperscape",
              pluginName: "@hyperscape/plugin-hyperscape",
              launchType: "connect",
              launchUrl: "https://example.invalid/hyperscape",
              viewer: {
                url: "https://example.invalid/hyperscape",
                embedParams: { embedded: "true" },
                postMessageAuth: true,
                sandbox: "allow-scripts",
              },
              session: {
                sessionId: "session-1",
                appName: "@elizaos/app-hyperscape",
                mode: "spectate-and-steer",
                status: "running",
                displayName: "Hyperscape",
                agentId: "agent-1",
                characterId: "character-1",
                canSendCommands: true,
                controls: ["pause"],
                summary: "Holding the line.",
              },
              status: "running",
              summary: "Holding the line.",
              startedAt: "2026-04-05T23:59:00.000Z",
              updatedAt: "2026-04-06T00:00:00.000Z",
              lastHeartbeatAt: "2026-04-06T00:00:00.000Z",
              supportsBackground: true,
              viewerAttachment: "attached",
              health: {
                state: "healthy",
                message: "Holding the line.",
              },
            },
          ],
        },
        null,
        2,
      ),
    );

    const runs = readAppRunStore(stateDir);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual(
      expect.objectContaining({
        runId: "run-1",
        characterId: "character-1",
        agentId: "agent-1",
        chatAvailability: "available",
        controlAvailability: "available",
        supportsViewerDetach: true,
        recentEvents: [],
        awaySummary: expect.objectContaining({
          eventCount: 0,
          message: "Holding the line.",
          since: "2026-04-05T23:59:00.000Z",
          until: "2026-04-06T00:00:00.000Z",
        }),
        healthDetails: expect.objectContaining({
          checkedAt: "2026-04-06T00:00:00.000Z",
          runtime: expect.objectContaining({
            state: "healthy",
            message: "Holding the line.",
          }),
          chat: expect.objectContaining({
            state: "healthy",
          }),
          control: expect.objectContaining({
            state: "healthy",
          }),
        }),
      }),
    );

    const currentFilePath = resolveAppRunStoreFilePath(stateDir);
    expect(fs.existsSync(currentFilePath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(currentFilePath, "utf-8")) as {
      version?: number;
      runs?: Array<{ runId?: string }>;
    };
    expect(persisted.version).toBe(2);
    expect(persisted.runs?.[0]?.runId).toBe("run-1");
  });

  it("writes v2 runs in descending update order", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-run-store-"));
    tempDirs.push(stateDir);

    writeAppRunStore(
      [
        {
          runId: "run-older",
          appName: "@elizaos/app-babylon",
          displayName: "Babylon",
          pluginName: "@elizaos/app-babylon",
          launchType: "url",
          launchUrl: "https://example.invalid/babylon",
          viewer: null,
          session: null,
          characterId: null,
          agentId: null,
          status: "launching",
          summary: "Launching.",
          startedAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:01.000Z",
          lastHeartbeatAt: null,
          supportsBackground: true,
          supportsViewerDetach: true,
          chatAvailability: "unknown",
          controlAvailability: "unknown",
          viewerAttachment: "unavailable",
          recentEvents: [],
          awaySummary: null,
          health: {
            state: "degraded",
            message: "Launching.",
          },
          healthDetails: {
            checkedAt: "2026-04-06T00:00:01.000Z",
            auth: { state: "unknown", message: "Launching." },
            runtime: { state: "degraded", message: "Launching." },
            viewer: { state: "unknown", message: null },
            chat: { state: "unknown", message: null },
            control: { state: "unknown", message: null },
            message: "Launching.",
          },
        },
        {
          runId: "run-newer",
          appName: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          pluginName: "@hyperscape/plugin-hyperscape",
          launchType: "connect",
          launchUrl: "https://example.invalid/hyperscape",
          viewer: null,
          session: null,
          characterId: null,
          agentId: null,
          status: "running",
          summary: "Running.",
          startedAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:02.000Z",
          lastHeartbeatAt: "2026-04-06T00:00:02.000Z",
          supportsBackground: true,
          supportsViewerDetach: true,
          chatAvailability: "unknown",
          controlAvailability: "unknown",
          viewerAttachment: "unavailable",
          recentEvents: [],
          awaySummary: null,
          health: {
            state: "healthy",
            message: "Running.",
          },
          healthDetails: {
            checkedAt: "2026-04-06T00:00:02.000Z",
            auth: { state: "unknown", message: "Running." },
            runtime: { state: "healthy", message: "Running." },
            viewer: { state: "unknown", message: null },
            chat: { state: "unknown", message: null },
            control: { state: "unknown", message: null },
            message: "Running.",
          },
        },
      ],
      stateDir,
    );

    const currentFilePath = resolveAppRunStoreFilePath(stateDir);
    const persisted = JSON.parse(fs.readFileSync(currentFilePath, "utf-8")) as {
      version?: number;
      runs?: Array<{ runId?: string; updatedAt?: string }>;
    };

    expect(persisted.version).toBe(2);
    expect(persisted.runs?.map((run) => run.runId)).toEqual([
      "run-newer",
      "run-older",
    ]);
  });
});
