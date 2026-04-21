// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteBlockerWeb } from "../../plugins/websiteblocker/src/web";

type WebsiteBlockerWindow = Window & {
  __MILADY_API_BASE__?: string;
  __MILADY_API_TOKEN__?: string;
};

describe("WebsiteBlockerWeb", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    delete (window as WebsiteBlockerWindow).__MILADY_API_BASE__;
    delete (window as WebsiteBlockerWindow).__MILADY_API_TOKEN__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the runtime open-settings route and returns the actual result", async () => {
    (window as WebsiteBlockerWindow).__MILADY_API_BASE__ =
      "http://127.0.0.1:3000";
    (window as WebsiteBlockerWindow).__MILADY_API_TOKEN__ = "token-123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ opened: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const plugin = new WebsiteBlockerWeb();
    await expect(plugin.openSettings()).resolves.toEqual({ opened: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/permissions/website-blocking/open-settings",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
        },
      },
    );
  });

  it("fails instead of reporting success when the runtime rejects open-settings", async () => {
    (window as WebsiteBlockerWindow).__MILADY_API_BASE__ =
      "http://127.0.0.1:3000";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "denied" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const plugin = new WebsiteBlockerWeb();
    await expect(plugin.openSettings()).rejects.toThrow("Request failed (500)");
  });

  it("reads the API token from session storage when the global token is absent", async () => {
    (window as WebsiteBlockerWindow).__MILADY_API_BASE__ =
      "http://127.0.0.1:3000";
    window.sessionStorage.setItem("milady_api_token", "session-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          available: true,
          active: false,
          hostsFilePath: null,
          endsAt: null,
          websites: [],
          canUnblockEarly: true,
          requiresElevation: false,
          engine: "hosts-file",
          platform: "darwin",
          supportsElevationPrompt: false,
          elevationPromptMethod: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const plugin = new WebsiteBlockerWeb();
    await expect(plugin.getStatus()).resolves.toMatchObject({
      available: true,
      engine: "hosts-file",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/website-blocker",
      {
        headers: {
          Authorization: "Bearer session-token",
        },
      },
    );
  });
});
