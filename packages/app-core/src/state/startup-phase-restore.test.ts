import fs from "node:fs";

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
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
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
      restoredActiveServer: {
        id: "remote:https://remote.example/api",
        kind: "remote",
        label: "remote.example",
        apiBase: "https://remote.example/api",
      },
      clientRef,
    });

    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(
      "https://remote.example/api",
    );
    expect(clientRef.setToken).toHaveBeenCalledWith(null);
  });

  it("does not keep a redundant dynamic import for onboarding bootstrap helpers", () => {
    const source = fs.readFileSync(
      new URL("./startup-phase-restore.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain('await import("./onboarding-bootstrap")');
  });
});
