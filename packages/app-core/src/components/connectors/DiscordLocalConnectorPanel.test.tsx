// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseApp } = vi.hoisted(() => ({
  mockClient: {
    getDiscordLocalStatus: vi.fn(),
    authorizeDiscordLocal: vi.fn(),
    disconnectDiscordLocal: vi.fn(),
    listDiscordLocalGuilds: vi.fn(),
    listDiscordLocalChannels: vi.fn(),
    saveDiscordLocalSubscriptions: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { DiscordLocalConnectorPanel } from "./DiscordLocalConnectorPanel";

function translate(
  key: string,
  vars?: { defaultValue?: string; count?: number },
) {
  if (typeof vars?.count === "number" && vars?.defaultValue) {
    return vars.defaultValue.replace("{{count}}", String(vars.count));
  }
  return vars?.defaultValue ?? key;
}

describe("DiscordLocalConnectorPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockClient.getDiscordLocalStatus.mockReset().mockResolvedValue({
      available: true,
      connected: true,
      authenticated: false,
      currentUser: null,
      subscribedChannelIds: [],
      configuredChannelIds: [],
      scopes: ["rpc", "identify", "rpc.notifications.read"],
      lastError: null,
      ipcPath: "/tmp/discord-ipc-0",
    });
    mockClient.authorizeDiscordLocal.mockReset().mockResolvedValue({
      available: true,
      connected: true,
      authenticated: true,
      currentUser: {
        id: "user-1",
        username: "shaw",
        global_name: "Shaw",
        avatar: null,
      },
      subscribedChannelIds: [],
      configuredChannelIds: [],
      scopes: ["rpc", "identify", "rpc.notifications.read"],
      lastError: null,
      ipcPath: "/tmp/discord-ipc-0",
    });
    mockClient.disconnectDiscordLocal
      .mockReset()
      .mockResolvedValue({ ok: true });
    mockClient.listDiscordLocalGuilds.mockReset().mockResolvedValue({
      guilds: [{ id: "guild-1", name: "Milady HQ" }],
      count: 1,
    });
    mockClient.listDiscordLocalChannels.mockReset().mockResolvedValue({
      channels: [
        { id: "channel-1", guild_id: "guild-1", type: 0, name: "general" },
      ],
      count: 1,
    });
    mockClient.saveDiscordLocalSubscriptions.mockReset().mockResolvedValue({
      subscribedChannelIds: ["channel-1"],
    });
    mockClient.onWsEvent.mockReset().mockReturnValue(() => {});
    mockUseApp.mockReset().mockReturnValue({ t: translate });
  });

  it("authorizes against the local Discord desktop app", async () => {
    render(<DiscordLocalConnectorPanel />);

    const authorize = await screen.findByRole("button", {
      name: "Authorize Discord desktop",
    });
    fireEvent.click(authorize);

    await waitFor(() =>
      expect(mockClient.authorizeDiscordLocal).toHaveBeenCalledOnce(),
    );
    await waitFor(() =>
      expect(mockClient.listDiscordLocalGuilds).toHaveBeenCalledOnce(),
    );
  });

  it("saves selected channel subscriptions", async () => {
    mockClient.getDiscordLocalStatus.mockResolvedValue({
      available: true,
      connected: true,
      authenticated: true,
      currentUser: {
        id: "user-1",
        username: "shaw",
        global_name: "Shaw",
        avatar: null,
      },
      subscribedChannelIds: [],
      configuredChannelIds: [],
      scopes: ["rpc", "identify", "rpc.notifications.read"],
      lastError: null,
      ipcPath: "/tmp/discord-ipc-0",
    });

    render(<DiscordLocalConnectorPanel />);

    await waitFor(() =>
      expect(mockClient.listDiscordLocalGuilds).toHaveBeenCalledOnce(),
    );
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    fireEvent.click(
      screen.getByRole("button", { name: "Save channel subscriptions" }),
    );

    await waitFor(() =>
      expect(mockClient.saveDiscordLocalSubscriptions).toHaveBeenCalledWith([
        "channel-1",
      ]),
    );
  });
});
