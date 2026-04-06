import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMessages } from "./analyzer";
import {
  buildActivityProfile,
  refreshCurrentState,
  setScreenContextSamplerForTesting,
} from "./service";
import { LifeOpsScreenContextSampler } from "../lifeops/screen-context";
import { LifeOpsService } from "../lifeops/service";

const NOW = new Date("2026-04-06T07:00:00Z");
const OWNER_ID = "owner-1";
const tempDirs: string[] = [];

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

function createRuntime(
  rooms: Record<string, string>,
  memories: Array<{ entityId: string; roomId: string; createdAt: number }>,
): IAgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  return {
    agentId: "agent-1",
    getRoomsForParticipant: vi.fn().mockResolvedValue(Object.keys(rooms)),
    getRoom: vi.fn().mockImplementation(async (roomId: string) => {
      const source = rooms[roomId];
      return source ? { id: roomId, source } : null;
    }),
    getMemoriesByRoomIds: vi.fn().mockImplementation(async ({ roomIds }) =>
      memories.filter((memory) => roomIds.includes(memory.roomId)),
    ),
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) return [];
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  } as unknown as IAgentRuntime;
}

async function createJpeg(text: string): Promise<Buffer> {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="40" y="96" font-family="Arial, sans-serif" font-size="42" fill="#111111">${text}</text>
    </svg>
  `;
  return await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

describe("refreshCurrentState", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        void fs.rm(dir, { recursive: true, force: true });
      }
    }
    setScreenContextSamplerForTesting(null);
  });

  it("treats a busy screen frame as a live desktop activity signal", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "activity-screen-"));
    tempDirs.push(dir);
    const framePath = path.join(dir, "frame.jpg");
    await fs.writeFile(framePath, await createJpeg("Inbox Calendar Meeting"));

    setScreenContextSamplerForTesting(
      new LifeOpsScreenContextSampler({
        framePath,
        ocr: {
          extractText: async () => "Inbox Calendar Meeting",
        },
      }),
    );

    const runtime = createRuntime({}, []);
    const profile = analyzeMessages([], new Map(), OWNER_ID, "UTC", 7, NOW);
    const refreshed = await refreshCurrentState(
      runtime,
      OWNER_ID,
      profile,
      NOW,
    );

    expect(refreshed.screenContextFocus).toBe("work");
    expect(refreshed.screenContextAvailable).toBe(true);
    expect(refreshed.isCurrentlyActive).toBe(true);
    expect(refreshed.hasOpenActivityCycle).toBe(true);
    expect(refreshed.effectiveDayKey).toBe("2026-04-06");
  });

  it("treats recent client_chat traffic as a live app session", async () => {
    const runtime = createRuntime(
      { "room-app": "client_chat" },
      [
        {
          entityId: "agent-1",
          roomId: "room-app",
          createdAt: NOW.getTime() - 2 * 60 * 1000,
        },
      ],
    );
    const profile = analyzeMessages([], new Map(), OWNER_ID, "UTC", 7, NOW);

    const refreshed = await refreshCurrentState(
      runtime,
      OWNER_ID,
      profile,
      NOW,
    );

    expect(refreshed.lastSeenPlatform).toBe("client_chat");
    expect(refreshed.isCurrentlyActive).toBe(true);
    expect(refreshed.hasOpenActivityCycle).toBe(true);
    expect(refreshed.effectiveDayKey).toBe("2026-04-06");
  });

  it("does not keep a stale client_chat session open forever", async () => {
    const runtime = createRuntime(
      { "room-app": "client_chat" },
      [
        {
          entityId: "agent-1",
          roomId: "room-app",
          createdAt: NOW.getTime() - 4 * 60 * 60 * 1000,
        },
      ],
    );
    const profile = analyzeMessages([], new Map(), OWNER_ID, "UTC", 7, NOW);

    const refreshed = await refreshCurrentState(
      runtime,
      OWNER_ID,
      profile,
      NOW,
    );

    expect(refreshed.lastSeenPlatform).toBe("client_chat");
    expect(refreshed.isCurrentlyActive).toBe(false);
    expect(refreshed.hasOpenActivityCycle).toBe(false);
    expect(refreshed.effectiveDayKey).toBe("2026-04-06");
  });

  it("uses persisted LifeOps activity signals when building and refreshing the profile", async () => {
    const runtime = createRuntime({}, []);
    const service = new LifeOpsService(runtime);
    await service.captureActivitySignal({
      source: "desktop_power",
      platform: "desktop_app",
      state: "active",
      observedAt: new Date(NOW.getTime() - 2 * 60 * 1000).toISOString(),
      idleState: "active",
      idleTimeSeconds: 0,
      onBattery: false,
    });

    const built = await buildActivityProfile(runtime, OWNER_ID, "UTC", NOW);
    expect(built.lastSeenPlatform).toBe("desktop_app");
    expect(built.isCurrentlyActive).toBe(true);
    expect(built.hasOpenActivityCycle).toBe(true);

    const staleBase = analyzeMessages([], new Map(), OWNER_ID, "UTC", 7, NOW);
    const refreshed = await refreshCurrentState(runtime, OWNER_ID, staleBase, NOW);
    expect(refreshed.lastSeenPlatform).toBe("desktop_app");
    expect(refreshed.isCurrentlyActive).toBe(true);
    expect(refreshed.hasOpenActivityCycle).toBe(true);
  });

  it("uses persisted mobile device activity signals when building and refreshing the profile", async () => {
    const runtime = createRuntime({}, []);
    const service = new LifeOpsService(runtime);
    await service.captureActivitySignal({
      source: "mobile_device",
      platform: "ios",
      state: "active",
      observedAt: new Date(NOW.getTime() - 90 * 1000).toISOString(),
      idleState: "active",
      idleTimeSeconds: null,
      onBattery: true,
      metadata: {
        reason: "unlock",
      },
    });

    const built = await buildActivityProfile(runtime, OWNER_ID, "UTC", NOW);
    expect(built.lastSeenPlatform).toBe("ios");
    expect(built.isCurrentlyActive).toBe(true);
    expect(built.hasOpenActivityCycle).toBe(true);

    const staleBase = analyzeMessages([], new Map(), OWNER_ID, "UTC", 7, NOW);
    const refreshed = await refreshCurrentState(runtime, OWNER_ID, staleBase, NOW);
    expect(refreshed.lastSeenPlatform).toBe("ios");
    expect(refreshed.isCurrentlyActive).toBe(true);
    expect(refreshed.hasOpenActivityCycle).toBe(true);
  });

  it("uses persisted mobile health sleep signals when building and refreshing the profile", async () => {
    const runtime = createRuntime({}, []);
    const service = new LifeOpsService(runtime);
    await service.captureActivitySignal({
      source: "mobile_health",
      platform: "ios",
      state: "sleeping",
      observedAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
      idleState: null,
      idleTimeSeconds: null,
      onBattery: false,
      health: {
        source: "healthkit",
        permissions: {
          sleep: true,
          biometrics: true,
        },
        sleep: {
          available: true,
          isSleeping: true,
          asleepAt: new Date(NOW.getTime() - 7 * 60 * 60 * 1000).toISOString(),
          awakeAt: null,
          durationMinutes: 420,
          stage: "asleep",
        },
        biometrics: {
          sampleAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
          heartRateBpm: 54,
          restingHeartRateBpm: 49,
          heartRateVariabilityMs: 71,
          respiratoryRate: 13.5,
          bloodOxygenPercent: 98,
        },
        warnings: [],
      },
      metadata: {
        reason: "sleeping",
      },
    });

    const built = await buildActivityProfile(runtime, OWNER_ID, "UTC", NOW);
    expect(built.hasSleepData).toBe(true);
    expect(built.isCurrentlySleeping).toBe(true);
    expect(built.lastSleepSignalAt).toBe(NOW.getTime() - 7 * 60 * 60 * 1000);
    expect(built.effectiveDayKey).toBe("2026-04-06");
    expect(built.typicalSleepDurationMinutes).toBe(420);

    const staleBase = analyzeMessages([], new Map(), OWNER_ID, "UTC", 7, NOW);
    const refreshed = await refreshCurrentState(runtime, OWNER_ID, staleBase, NOW);
    expect(refreshed.isCurrentlyActive).toBe(false);
    expect(refreshed.hasOpenActivityCycle).toBe(false);
    expect(refreshed.effectiveDayKey).toBe("2026-04-06");
  });
});
