import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserWorkspaceRouteContext } from "../../src/api/browser-workspace-routes";
import { handleBrowserWorkspaceRoutes } from "../../src/api/browser-workspace-routes";
import * as browserWorkspaceService from "../../src/services/browser-workspace";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function installBrowserWorkspaceRouteSpies(): void {
  vi.spyOn(
    browserWorkspaceService,
    "closeBrowserWorkspaceTab",
  ).mockResolvedValue(true);
  vi.spyOn(
    browserWorkspaceService,
    "executeBrowserWorkspaceCommand",
  ).mockResolvedValue({
    mode: "web",
    subaction: "inspect",
    elements: [
      {
        selector: 'button[type="submit"]',
        tag: "button",
        text: "Continue",
        type: "submit",
        name: null,
        href: null,
        value: null,
      },
    ],
    value: { title: "Fixture", url: "http://127.0.0.1:4010/form" },
  });
  vi.spyOn(
    browserWorkspaceService,
    "evaluateBrowserWorkspaceTab",
  ).mockResolvedValue({
    ok: true,
  });
  vi.spyOn(
    browserWorkspaceService,
    "getBrowserWorkspaceSnapshot",
  ).mockResolvedValue({
    mode: "web",
    tabs: [
      {
        id: "btab_1",
        title: "Milady Browser",
        url: "https://example.com",
        partition: "persist:milady-browser",
        visible: false,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        lastFocusedAt: null,
      },
    ],
  });
  vi.spyOn(
    browserWorkspaceService,
    "getBrowserWorkspaceUnavailableMessage",
  ).mockReturnValue("Milady browser workspace desktop bridge is unavailable.");
  vi.spyOn(
    browserWorkspaceService,
    "hideBrowserWorkspaceTab",
  ).mockImplementation(async (id: string) => ({
    id,
    title: "Milady Browser",
    url: "https://example.com",
    partition: "persist:milady-browser",
    visible: false,
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    lastFocusedAt: null,
  }));
  vi.spyOn(
    browserWorkspaceService,
    "listBrowserWorkspaceTabs",
  ).mockResolvedValue([
    {
      id: "btab_1",
      title: "Milady Browser",
      url: "https://example.com",
      partition: "persist:milady-browser",
      visible: false,
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
      lastFocusedAt: null,
    },
  ]);
  vi.spyOn(
    browserWorkspaceService,
    "navigateBrowserWorkspaceTab",
  ).mockImplementation(async ({ id, url }: { id: string; url: string }) => ({
    id,
    title: "Milady Browser",
    url,
    partition: "persist:milady-browser",
    visible: false,
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    lastFocusedAt: null,
  }));
  vi.spyOn(
    browserWorkspaceService,
    "openBrowserWorkspaceTab",
  ).mockImplementation(async (body: Record<string, unknown>) => ({
    id: "btab_2",
    title: (body.title as string) ?? "Milady Browser",
    url: (body.url as string) ?? "about:blank",
    partition: "persist:milady-browser",
    visible: Boolean(body.show),
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    lastFocusedAt: null,
  }));
  vi.spyOn(
    browserWorkspaceService,
    "showBrowserWorkspaceTab",
  ).mockImplementation(async (id: string) => ({
    id,
    title: "Milady Browser",
    url: "https://example.com",
    partition: "persist:milady-browser",
    visible: true,
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    lastFocusedAt: "2026-04-05T00:00:00.000Z",
  }));
  vi.spyOn(
    browserWorkspaceService,
    "snapshotBrowserWorkspaceTab",
  ).mockResolvedValue({
    data: "ZmFrZQ==",
  });
}

function buildCtx(
  method: string,
  pathname: string,
  body?: Record<string, unknown>,
): BrowserWorkspaceRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => body ?? null),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("browser-workspace-routes", () => {
  it("returns a browser workspace snapshot from /api/browser-workspace", async () => {
    installBrowserWorkspaceRouteSpies();
    const ctx = buildCtx("GET", "/api/browser-workspace");

    const handled = await handleBrowserWorkspaceRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      mode: "web",
      tabs: [{ id: "btab_1" }],
    });
  });

  it("executes browser commands from /api/browser-workspace/command", async () => {
    installBrowserWorkspaceRouteSpies();
    const ctx = buildCtx("POST", "/api/browser-workspace/command", {
      subaction: "inspect",
      id: "btab_1",
    });

    const handled = await handleBrowserWorkspaceRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      subaction: "inspect",
      elements: [
        expect.objectContaining({ selector: 'button[type="submit"]' }),
      ],
    });
  });

  it("lists tabs from /api/browser-workspace/tabs", async () => {
    installBrowserWorkspaceRouteSpies();
    const ctx = buildCtx("GET", "/api/browser-workspace/tabs");

    const handled = await handleBrowserWorkspaceRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      tabs: [{ id: "btab_1" }],
    });
  });

  it("opens tabs with POST /api/browser-workspace/tabs", async () => {
    installBrowserWorkspaceRouteSpies();
    const ctx = buildCtx("POST", "/api/browser-workspace/tabs", {
      url: "https://example.com",
      show: true,
    });

    const handled = await handleBrowserWorkspaceRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      tab: { id: "btab_2", visible: true },
    });
  });

  it("validates navigate requests", async () => {
    installBrowserWorkspaceRouteSpies();
    const ctx = buildCtx(
      "POST",
      "/api/browser-workspace/tabs/btab_1/navigate",
      {},
    );

    const handled = await handleBrowserWorkspaceRoutes(ctx);

    expect(handled).toBe(true);
    const [_, payload, status] = (ctx.json as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(status).toBe(400);
    expect(payload).toEqual({ error: "url is required" });
  });

  it("closes tabs with DELETE /api/browser-workspace/tabs/:id", async () => {
    installBrowserWorkspaceRouteSpies();
    const ctx = buildCtx("DELETE", "/api/browser-workspace/tabs/btab_1");

    const handled = await handleBrowserWorkspaceRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toEqual({ closed: true });
  });
});
