// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { MiladyClient } from "../../src/api-client";

describe("MiladyClient Electron API fallback", () => {
  const originalFetch = globalThis.fetch;
  const originalBase = window.__MILADY_API_BASE__;
  let locationGetterSpy: ReturnType<typeof vi.spyOn> | null = null;

  const mockProtocol = (protocol: string): void => {
    locationGetterSpy?.mockRestore();
    locationGetterSpy = vi.spyOn(window, "location", "get").mockReturnValue({
      protocol,
      host: "",
    } as Location);
  };

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    window.__MILADY_API_BASE__ = originalBase;
    locationGetterSpy?.mockRestore();
    locationGetterSpy = null;
  });

  it("does not probe localhost on capacitor-electron protocol before API base is injected", async () => {
    window.__MILADY_API_BASE__ = undefined;
    mockProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "starting",
        agentName: "Milady",
        model: undefined,
        uptime: undefined,
        startedAt: undefined,
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    expect(client.apiAvailable).toBe(false);
    await expect(client.getStatus()).rejects.toThrow(
      "API not available (no HTTP origin)",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers injected API base over fallback", async () => {
    window.__MILADY_API_BASE__ = "http://localhost:9999";
    mockProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "running",
        agentName: "Milady",
        model: "test",
        uptime: 1,
        startedAt: Date.now(),
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await client.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9999/api/status",
      expect.any(Object),
    );
  });

  it("starts unavailable on capacitor-electron and switches to injected API base when injected later", async () => {
    window.__MILADY_API_BASE__ = undefined;
    mockProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "running",
        agentName: "Milady",
        model: "test",
        uptime: 1,
        startedAt: Date.now(),
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await expect(client.getStatus()).rejects.toThrow(
      "API not available (no HTTP origin)",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    window.__MILADY_API_BASE__ = "http://127.0.0.1:4444";
    await client.getStatus();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:4444/api/status",
      expect.any(Object),
    );
  });
});
