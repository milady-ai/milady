import { describe, expect, it, vi } from "vitest";

import { applyRestoredConnection } from "./startup-phase-restore";

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
