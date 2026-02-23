// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentWeb } from "../../plugins/agent/src/web";

describe("AgentWeb Electron API fallback", () => {
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

  it("queries local API when running on capacitor-electron without injected base", async () => {
    window.__MILADY_API_BASE__ = undefined;
    mockProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        state: "starting",
        agentName: "Milady",
        port: 2138,
        startedAt: Date.now(),
        error: null,
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const agent = new AgentWeb();
    await agent.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:2138/api/status",
      expect.any(Object),
    );
  });
});
