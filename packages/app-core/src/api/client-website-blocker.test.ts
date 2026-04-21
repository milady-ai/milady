import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetWebsiteBlockerPlugin, mockPlugin, mockStatus, mockPermission } =
  vi.hoisted(() => ({
    mockGetWebsiteBlockerPlugin: vi.fn(),
    mockStatus: {
      available: true,
      active: true,
      hostsFilePath: null,
      endsAt: "2026-04-05T12:00:00.000Z",
      websites: ["x.com"],
      canUnblockEarly: true,
      requiresElevation: false,
      engine: "vpn-dns" as const,
      platform: "android",
      supportsElevationPrompt: true,
      elevationPromptMethod: "vpn-consent" as const,
      permissionStatus: "granted" as const,
      canRequestPermission: false,
    },
    mockPermission: {
      status: "granted" as const,
      canRequest: false,
    },
    mockPlugin: {
      getStatus: vi.fn(),
      startBlock: vi.fn(),
      stopBlock: vi.fn(),
      checkPermissions: vi.fn(),
      requestPermissions: vi.fn(),
      openSettings: vi.fn(),
    },
  }));

vi.mock("../bridge/native-plugins", () => ({
  getWebsiteBlockerPlugin: mockGetWebsiteBlockerPlugin,
}));

import { MiladyClient } from "./client";

describe("MiladyClient website blocker delegation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGetWebsiteBlockerPlugin.mockReset();
    mockPlugin.getStatus.mockReset();
    mockPlugin.startBlock.mockReset();
    mockPlugin.stopBlock.mockReset();
    mockPlugin.checkPermissions.mockReset();
    mockPlugin.requestPermissions.mockReset();
    mockPlugin.openSettings.mockReset();
  });

  it("uses the native website blocker plugin when available", async () => {
    mockGetWebsiteBlockerPlugin.mockReturnValue(mockPlugin);
    mockPlugin.getStatus.mockResolvedValue(mockStatus);
    mockPlugin.startBlock.mockResolvedValue({
      success: true,
      endsAt: mockStatus.endsAt,
      request: {
        websites: ["x.com"],
        durationMinutes: 60,
      },
    });
    mockPlugin.stopBlock.mockResolvedValue({
      success: true,
      removed: true,
      status: {
        active: false,
        endsAt: null,
        websites: [],
        canUnblockEarly: true,
        requiresElevation: false,
      },
    });
    mockPlugin.requestPermissions.mockResolvedValue(mockPermission);
    mockPlugin.openSettings.mockResolvedValue({ opened: true });

    const fetchSpy = vi.spyOn(MiladyClient.prototype, "fetch");
    const client = new MiladyClient("http://127.0.0.1:31337");

    await expect(client.getWebsiteBlockerStatus()).resolves.toEqual(mockStatus);
    await expect(
      client.startWebsiteBlock({
        websites: ["x.com"],
        durationMinutes: 60,
      }),
    ).resolves.toMatchObject({
      success: true,
    });
    await expect(client.stopWebsiteBlock()).resolves.toMatchObject({
      success: true,
    });
    await expect(
      client.getPermission("website-blocking"),
    ).resolves.toMatchObject({
      id: "website-blocking",
      status: "granted",
    });
    await expect(
      client.requestPermission("website-blocking"),
    ).resolves.toMatchObject({
      id: "website-blocking",
      status: "granted",
    });
    await client.openPermissionSettings("website-blocking");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPlugin.startBlock).toHaveBeenCalledWith({
      websites: ["x.com"],
      durationMinutes: 60,
    });
    expect(mockPlugin.openSettings).toHaveBeenCalledTimes(1);
  });

  it("merges the native website blocker permission into permission snapshots", async () => {
    mockGetWebsiteBlockerPlugin.mockReturnValue(mockPlugin);
    mockPlugin.getStatus.mockResolvedValue({
      ...mockStatus,
      permissionStatus: "not-determined",
      canRequestPermission: true,
      reason: "Android needs VPN consent.",
    });

    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({
        accessibility: {
          id: "accessibility",
          status: "granted",
          canRequest: false,
          lastChecked: 1,
        },
        "screen-recording": {
          id: "screen-recording",
          status: "not-applicable",
          canRequest: false,
          lastChecked: 1,
        },
        microphone: {
          id: "microphone",
          status: "granted",
          canRequest: false,
          lastChecked: 1,
        },
        camera: {
          id: "camera",
          status: "granted",
          canRequest: false,
          lastChecked: 1,
        },
        shell: {
          id: "shell",
          status: "not-applicable",
          canRequest: false,
          lastChecked: 1,
        },
        "website-blocking": {
          id: "website-blocking",
          status: "granted",
          canRequest: false,
          lastChecked: 1,
        },
      } as never);
    const client = new MiladyClient("http://127.0.0.1:31337");

    await expect(client.getPermissions()).resolves.toMatchObject({
      "website-blocking": {
        id: "website-blocking",
        status: "not-determined",
        canRequest: true,
        reason: "Android needs VPN consent.",
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/permissions");
  });
});
