// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPersistedConnectionMode } from "../state/persistence";

const { fetchMock, mockClient } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  mockClient: {
    setBaseUrl: vi.fn(),
    setToken: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  client: mockClient,
}));

import { applyLaunchConnectionFromUrl } from "./browser-launch";

function setUrl(path: string): void {
  window.history.replaceState({}, "", path);
}

describe("applyLaunchConnectionFromUrl", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockClient.setBaseUrl.mockReset();
    mockClient.setToken.mockReset();
    sessionStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    setUrl("/");
  });

  it("exchanges a managed cloud launch session and strips launch params", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            connection: {
              apiBase: "https://agent-123.containers.elizacloud.ai",
              token: "managed-backend-token",
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    setUrl(
      "/?cloudLaunchSession=session-123&cloudLaunchBase=https%3A%2F%2Felizacloud.ai",
    );

    await expect(applyLaunchConnectionFromUrl()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://elizacloud.ai/api/v1/milady/launch-sessions/session-123",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      }),
    );
    expect(mockClient.setBaseUrl).toHaveBeenCalledWith(
      "https://agent-123.containers.elizacloud.ai",
    );
    expect(mockClient.setToken).toHaveBeenCalledWith("managed-backend-token");
    expect(loadPersistedConnectionMode()).toEqual({
      runMode: "cloud",
      cloudApiBase: "https://agent-123.containers.elizacloud.ai",
      cloudAuthToken: "managed-backend-token",
    });
    expect(window.location.search).toBe("");
  });

  it("falls back to the legacy eliza launch-session path when milady path is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              connection: {
                apiBase: "https://agent-legacy.containers.elizacloud.ai",
                token: "legacy-token",
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    setUrl(
      "/?cloudLaunchSession=session-legacy&cloudLaunchBase=https%3A%2F%2Felizacloud.ai",
    );

    await expect(applyLaunchConnectionFromUrl()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://elizacloud.ai/api/v1/milady/launch-sessions/session-legacy",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://elizacloud.ai/api/v1/eliza/launch-sessions/session-legacy",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    expect(mockClient.setBaseUrl).toHaveBeenCalledWith(
      "https://agent-legacy.containers.elizacloud.ai",
    );
    expect(mockClient.setToken).toHaveBeenCalledWith("legacy-token");
    expect(loadPersistedConnectionMode()).toEqual({
      runMode: "cloud",
      cloudApiBase: "https://agent-legacy.containers.elizacloud.ai",
      cloudAuthToken: "legacy-token",
    });
  });

  it("falls back to direct launch params and strips them after applying", async () => {
    setUrl(
      "/?apiBase=https%3A%2F%2Fagent-456.containers.elizacloud.ai&token=backend-token",
    );

    await expect(applyLaunchConnectionFromUrl()).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClient.setBaseUrl).toHaveBeenCalledWith(
      "https://agent-456.containers.elizacloud.ai",
    );
    expect(mockClient.setToken).toHaveBeenCalledWith("backend-token");
    expect(loadPersistedConnectionMode()).toEqual({
      runMode: "remote",
      remoteApiBase: "https://agent-456.containers.elizacloud.ai",
      remoteAccessToken: "backend-token",
    });
    expect(window.location.search).toBe("");
  });

  it("returns false when no launch params are present", async () => {
    await expect(applyLaunchConnectionFromUrl()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClient.setBaseUrl).not.toHaveBeenCalled();
    expect(mockClient.setToken).not.toHaveBeenCalled();
  });
});
