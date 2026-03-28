import { describe, expect, it, vi } from "vitest";
import * as stackStatus from "./desktop-stack-status.mjs";

describe("desktop-stack-status", () => {
  it("fetchJsonOk parses JSON bodies", async () => {
    const fetchImpl = vi.fn(
      async () =>
        /** @type {Response} */ ({
          ok: true,
          status: 200,
          text: async () => '{"a":1}',
        }),
    );
    const r = await stackStatus.fetchJsonOk("http://x", fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.json).toEqual({ a: 1 });
  });

  it("gatherDesktopStackStatus uses env ports and fetch", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/dev/stack")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              schema: "milady.dev.stack/v1",
              desktop: {
                uiPort: 7777,
                rendererUrl: null,
                desktopApiBase: null,
              },
              cursorScreenshot: { available: false, path: null },
              desktopDevLog: { filePath: null, apiTailPath: null },
            }),
        };
      }
      if (String(url).endsWith("/api/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => "{}",
        };
      }
      if (String(url).endsWith("/api/status")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ state: "running" }),
        };
      }
      return {
        ok: false,
        status: 404,
        text: async () => "",
      };
    });

    const report = await stackStatus.gatherDesktopStackStatus(
      { MILADY_PORT: "9999", MILADY_API_PORT: "8888" },
      fetchImpl as unknown as typeof fetch,
      { isPortOpen: async () => true },
    );

    expect(report.uiPort).toBe(9999);
    expect(report.devStack?.desktop?.uiPort).toBe(7777);
    expect(report.apiPort).toBe(8888);
    expect(report.apiHealth.ok).toBe(true);
    expect(report.apiStatus.json).toEqual({ state: "running" });
  });

  it("falls back to /api/dev/stack uiPort when MILADY_PORT is unset", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/dev/stack")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              schema: "milady.dev.stack/v1",
              desktop: {
                uiPort: 7777,
                rendererUrl: "http://127.0.0.1:7777",
                desktopApiBase: "http://127.0.0.1:31337",
              },
            }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => "{}",
      };
    });

    const probedPorts: number[] = [];
    const report = await stackStatus.gatherDesktopStackStatus(
      { MILADY_API_PORT: "31337" },
      fetchImpl as unknown as typeof fetch,
      {
        isPortOpen: async (port) => {
          probedPorts.push(port);
          return true;
        },
      },
    );

    expect(report.uiPort).toBe(7777);
    expect(probedPorts).toEqual([31337, 7777]);
  });

  it("falls back through legacy ELIZA API aliases", async () => {
    const report = await stackStatus.gatherDesktopStackStatus(
      { ELIZA_API_PORT: "4555", ELIZA_PORT: "4999" },
      async () =>
        /** @type {Response} */ ({
          ok: false,
          status: 404,
          text: async () => "",
        }) as unknown as Response,
      { isPortOpen: async () => false },
    );

    expect(report.apiPort).toBe(4555);
    expect(report.uiPort).toBe(2138);
  });
});
