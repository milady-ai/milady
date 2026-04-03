import { describe, expect, it, vi } from "vitest";

import {
  applyRestoredConnection,
  deriveSessionConnectionMode,
} from "./startup-phase-restore";

describe("deriveSessionConnectionMode", () => {
  it("returns null when there is no explicit session api base", () => {
    expect(
      deriveSessionConnectionMode({
        sessionApiBase: "",
        sessionApiToken: null,
      }),
    ).toBeNull();
  });

  it("normalizes an explicit session api base into a remote restore target", () => {
    expect(
      deriveSessionConnectionMode({
        sessionApiBase: "https://remote.example/api/",
        sessionApiToken: "remote-token",
      }),
    ).toEqual({
      runMode: "remote",
      remoteApiBase: "https://remote.example/api",
      remoteAccessToken: "remote-token",
    });
  });
});

describe("applyRestoredConnection", () => {
  it("clears stale session state before restoring a local runtime", async () => {
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };
    const startLocalRuntime = vi.fn(async () => {});

    await applyRestoredConnection({
      restoredConnection: { runMode: "local" },
      clientRef,
      startLocalRuntime,
    });

    expect(clientRef.setToken).toHaveBeenCalledWith(null);
    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(null);
    expect(startLocalRuntime).toHaveBeenCalledTimes(1);
  });

  it("clears stale tokens when restoring a remote target without an access token", async () => {
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };

    await applyRestoredConnection({
      restoredConnection: {
        runMode: "remote",
        remoteApiBase: "https://remote.example/api",
      },
      clientRef,
    });

    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(
      "https://remote.example/api",
    );
    expect(clientRef.setToken).toHaveBeenCalledWith(null);
  });
});
