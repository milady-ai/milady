import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const roleMocks = vi.hoisted(() => ({
  checkSenderRole: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: roleMocks.checkSenderRole,
}));

import { websiteBlockerProvider } from "./provider";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
  startSelfControlBlock,
} from "./selfcontrol";

let tempDir = "";
let hostsFilePath = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-"));
  hostsFilePath = path.join(tempDir, "hosts");
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
  roleMocks.checkSenderRole.mockReset().mockResolvedValue({
    entityId: "user-1",
    role: "ADMIN",
    isOwner: false,
    isAdmin: true,
    canManageRoles: true,
  });
});

afterEach(() => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  vi.restoreAllMocks();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("websiteBlockerProvider", () => {
  it("returns an empty provider result for non-admin users", async () => {
    roleMocks.checkSenderRole.mockResolvedValue({
      entityId: "user-2",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const result = await websiteBlockerProvider.get?.(
      {} as never,
      {
        entityId: "user-2",
        roomId: "room-1",
        content: { text: "hi" },
      } as never,
      {} as never,
    );

    expect(result).toEqual({
      text: "",
      values: {
        websiteBlockerAuthorized: false,
        selfControlAuthorized: false,
      },
      data: {
        websiteBlockerAuthorized: false,
        selfControlAuthorized: false,
      },
    });
  });

  it("returns blocker status for admin users", async () => {
    await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 30,
    });

    const result = await websiteBlockerProvider.get?.(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "status" },
      } as never,
      {} as never,
    );

    expect(result?.text).toContain("Local website blocking is available");
    expect(result?.values).toMatchObject({
      websiteBlockerAuthorized: true,
      websiteBlockerAvailable: true,
      websiteBlockerActive: true,
      websiteBlockerCanUnblockEarly: true,
      websiteBlockerSupportsElevationPrompt: expect.any(Boolean),
      websiteBlockerEngine: "hosts-file",
      websiteBlockerPlatform: process.platform,
      websiteBlockerHostsFilePath: hostsFilePath,
      selfControlAuthorized: true,
      selfControlAvailable: true,
      selfControlActive: true,
      selfControlCanUnblockEarly: true,
      selfControlSupportsElevationPrompt: expect.any(Boolean),
      selfControlHostsFilePath: hostsFilePath,
    });
    expect(result?.values).toHaveProperty(
      "websiteBlockerElevationPromptMethod",
    );
    expect(result?.values).toHaveProperty("selfControlElevationPromptMethod");
  });
});
