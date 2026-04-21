import * as fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  __resetBrowserWorkspaceStateForTests,
  closeBrowserWorkspaceTab,
  evaluateBrowserWorkspaceTab,
  executeBrowserWorkspaceCommand,
  getBrowserWorkspaceMode,
  getBrowserWorkspaceSnapshot,
  isBrowserWorkspaceBridgeConfigured,
  listBrowserWorkspaceTabs,
  openBrowserWorkspaceTab,
  resolveBrowserWorkspaceBridgeConfig,
} from "./browser-workspace";

const originalFetch = globalThis.fetch;

type BrowserFixture = {
  formUrl: string;
  tasksUrl: string;
  close: () => Promise<void>;
};

async function startBrowserFixture(): Promise<BrowserFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/echo") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          authorization: req.headers.authorization ?? null,
          headers: req.headers,
          method: req.method ?? "GET",
          url: url.toString(),
          userAgent: req.headers["user-agent"] ?? null,
        }),
      );
      return;
    }

    if (url.pathname === "/tasks") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Tasks Fixture</title></head>
          <body>
            <h1>Tasks Fixture</h1>
            <p>Agent task board</p>
          </body>
        </html>`);
      return;
    }

    if (url.pathname === "/welcome") {
      const name = url.searchParams.get("name") || "Anonymous";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Welcome Fixture</title></head>
          <body>
            <h1>Welcome, ${name}</h1>
            <a href="/tasks">Open tasks</a>
          </body>
        </html>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
	      <html lang="en">
	        <head><meta charset="utf-8" /><title>Browser Form Fixture</title></head>
	        <body>
	          <h1>Browser Form Fixture</h1>
	          <form action="/welcome" method="get">
	            <label>
	              Agent name
	              <input name="name" value="" />
	            </label>
	            <label>
	              Plan
	              <select name="plan">
	                <option value="basic">Basic</option>
	                <option value="pro">Pro</option>
	              </select>
	            </label>
	            <label>
	              <input type="checkbox" name="terms" value="yes" />
	              Accept terms
	            </label>
              <input type="file" name="attachment" />
	            <button type="submit">Continue</button>
	            <button type="button" data-testid="secondary-action">Secondary</button>
              <div data-testid="drag-source" draggable="true">Drag Source</div>
              <div data-testid="drop-target">Drop Target</div>
              <iframe
                title="Embedded Frame"
                srcdoc='<!doctype html><html lang="en"><body><h2>Frame Fixture</h2><label>Frame name<input name="frameName" value="" /></label><button type="button" data-testid="frame-button">Frame Continue</button></body></html>'
              ></iframe>
	          </form>
	          <a href="/tasks">Open tasks</a>
	        </body>
	      </html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    formUrl: `${baseUrl}/form`,
    tasksUrl: `${baseUrl}/tasks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

describe("browser-workspace service", () => {
  let fixture: BrowserFixture;

  beforeAll(async () => {
    fixture = await startBrowserFixture();
  });

  beforeEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    await __resetBrowserWorkspaceStateForTests();
    const tabs = await listBrowserWorkspaceTabs({} as NodeJS.ProcessEnv);
    await Promise.all(
      tabs.map((tab) =>
        closeBrowserWorkspaceTab(tab.id, {} as NodeJS.ProcessEnv),
      ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await __resetBrowserWorkspaceStateForTests();
    await fixture.close();
  });

  it("detects when the desktop bridge is unavailable", () => {
    expect(
      resolveBrowserWorkspaceBridgeConfig({
        MILADY_BROWSER_WORKSPACE_URL: "",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      isBrowserWorkspaceBridgeConfigured({
        MILADY_BROWSER_WORKSPACE_URL: "",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(getBrowserWorkspaceMode({} as NodeJS.ProcessEnv)).toBe("web");
  });

  it("falls back to an in-process web workspace when no bridge config is present", async () => {
    expect(await listBrowserWorkspaceTabs({} as NodeJS.ProcessEnv)).toEqual([]);

    const tab = await openBrowserWorkspaceTab(
      { show: true, url: "about:blank" },
      {} as NodeJS.ProcessEnv,
    );

    expect(tab.id).toMatch(/^btab_\d+$/);

    await expect(
      evaluateBrowserWorkspaceTab(
        { id: tab.id, script: "document.title" },
        {} as NodeJS.ProcessEnv,
      ),
    ).rejects.toThrow(
      "Milady browser workspace eval is only available in the desktop app.",
    );

    await expect(
      getBrowserWorkspaceSnapshot({} as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      mode: "web",
      tabs: [{ id: tab.id, visible: true }],
    });
  });

  it("serialises concurrent web-mode tab mutations without corruption", async () => {
    const env = {} as NodeJS.ProcessEnv;

    const opens = Array.from({ length: 10 }, (_, i) =>
      openBrowserWorkspaceTab(
        { show: false, url: `http://127.0.0.1:9999/${i}` },
        env,
      ),
    );
    const tabs = await Promise.all(opens);

    const ids = new Set(tabs.map((t) => t.id));
    expect(ids.size).toBe(10);

    const snapshot = await getBrowserWorkspaceSnapshot(env);
    for (const tab of tabs) {
      expect(snapshot.tabs.some((t) => t.id === tab.id)).toBe(true);
    }
  });

  it("sends bearer auth when opening a tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tab: {
          id: "btab_1",
          title: "Milady Browser",
          url: "https://example.com",
          partition: "persist:milady-browser",
          visible: false,
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T00:00:00.000Z",
          lastFocusedAt: null,
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const tab = await openBrowserWorkspaceTab({ url: "https://example.com" }, {
      MILADY_BROWSER_WORKSPACE_URL: "http://127.0.0.1:31340",
      MILADY_BROWSER_WORKSPACE_TOKEN: "secret",
    } as NodeJS.ProcessEnv);

    expect(tab.id).toBe("btab_1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
  });

  it("executes real browser subactions in web mode against fixture pages", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(open.tab?.url).toBe(fixture.formUrl);
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    const inspect = await executeBrowserWorkspaceCommand(
      {
        subaction: "inspect",
        id: tabId,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(inspect.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: 'input[name="name"]' }),
        expect.objectContaining({ selector: 'button[type="submit"]' }),
      ]),
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        id: tabId,
        selector: 'input[name="name"]',
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "click",
        id: tabId,
        selector: 'button[type="submit"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    const heading = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        selector: "h1",
        getMode: "text",
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(heading.value).toBe("Welcome, Milady");
  });

  it("runs batch subactions against an explicit tab target", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    const result = await executeBrowserWorkspaceCommand(
      {
        subaction: "batch",
        steps: [
          {
            subaction: "fill",
            id: tabId,
            selector: 'input[name="name"]',
            value: "BrowserAgent",
          },
          {
            subaction: "click",
            id: tabId,
            selector: 'button[type="submit"]',
          },
          {
            subaction: "get",
            id: tabId,
            selector: "h1",
            getMode: "text",
          },
        ],
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(result.subaction).toBe("batch");
    expect(result.steps).toHaveLength(3);
    expect(result.value).toBe("Welcome, BrowserAgent");
  });

  it("supports semantic find, select, check, snapshot, and richer get modes", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    const fillName = await executeBrowserWorkspaceCommand(
      {
        subaction: "find",
        id: tabId,
        findBy: "label",
        action: "fill",
        text: "Agent name",
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fillName.value).toEqual(
      expect.objectContaining({ value: "Milady" }),
    );

    const selectPlan = await executeBrowserWorkspaceCommand(
      {
        subaction: "select",
        id: tabId,
        findBy: "label",
        text: "Plan",
        value: "pro",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(selectPlan.value).toEqual(expect.objectContaining({ value: "pro" }));

    const checkTerms = await executeBrowserWorkspaceCommand(
      {
        subaction: "check",
        id: tabId,
        findBy: "label",
        text: "Accept terms",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(checkTerms.value).toEqual(
      expect.objectContaining({ checked: true }),
    );

    const snapshot = await executeBrowserWorkspaceCommand(
      {
        subaction: "snapshot",
        id: tabId,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(snapshot.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: 'input[name="name"]' }),
        expect.objectContaining({ selector: 'select[name="plan"]' }),
      ]),
    );

    const styles = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        findBy: "testid",
        text: "secondary-action",
        getMode: "styles",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(styles.value).toEqual(
      expect.objectContaining({ display: expect.any(String) }),
    );

    const checked = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        findBy: "label",
        text: "Accept terms",
        getMode: "checked",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(checked.value).toBe(true);
  });

  it("accepts semantic selector shorthand that real browser planners commonly emit", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    const fill = await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        id: tabId,
        selector: "label=Agent name",
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fill.value).toEqual(expect.objectContaining({ value: "Milady" }));

    const select = await executeBrowserWorkspaceCommand(
      {
        subaction: "select",
        id: tabId,
        selector: "label=Plan",
        value: "pro",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(select.value).toEqual(expect.objectContaining({ value: "pro" }));

    const check = await executeBrowserWorkspaceCommand(
      {
        subaction: "check",
        id: tabId,
        selector: "label=Accept terms",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(check.value).toEqual(expect.objectContaining({ checked: true }));

    const click = await executeBrowserWorkspaceCommand(
      {
        subaction: "click",
        id: tabId,
        selector: 'role=button[name="Continue"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(click.tab?.url).toContain("/welcome");

    const heading = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        selector: "text=Welcome, Milady",
        getMode: "text",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(heading.value).toBe("Welcome, Milady");
  });

  it("supports agent-browser-style snapshot refs for follow-up browser commands", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    const snapshot = await executeBrowserWorkspaceCommand(
      {
        subaction: "snapshot",
        id: tabId,
      },
      {} as NodeJS.ProcessEnv,
    );

    const nameRef = snapshot.elements?.find((element) =>
      element.selector.includes('input[name="name"]'),
    )?.ref;
    const planRef = snapshot.elements?.find((element) =>
      element.selector.includes('select[name="plan"]'),
    )?.ref;
    const termsRef = snapshot.elements?.find(
      (element) =>
        element.type === "checkbox" ||
        element.selector.includes('input[name="terms"]'),
    )?.ref;
    const continueRef = snapshot.elements?.find((element) =>
      element.selector.includes('button[type="submit"]'),
    )?.ref;

    expect(nameRef).toMatch(/^@e\d+$/);
    expect(planRef).toMatch(/^@e\d+$/);
    expect(termsRef).toMatch(/^@e\d+$/);
    expect(continueRef).toMatch(/^@e\d+$/);

    await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        id: tabId,
        selector: nameRef,
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "select",
        id: tabId,
        selector: planRef,
        value: "pro",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "check",
        id: tabId,
        selector: termsRef,
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "click",
        id: tabId,
        selector: continueRef,
      },
      {} as NodeJS.ProcessEnv,
    );

    const heading = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        selector: "h1",
        getMode: "text",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(heading.value).toBe("Welcome, Milady");
  });

  it("supports timed waits without a selector condition", async () => {
    const startedAt = Date.now();
    const wait = await executeBrowserWorkspaceCommand(
      {
        subaction: "wait",
        timeoutMs: 30,
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(wait.value).toEqual({ waitedMs: 30 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
  });

  it("supports clipboard, upload, drag, frame, tab, and window browser parity helpers", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    await executeBrowserWorkspaceCommand(
      {
        subaction: "clipboard",
        id: tabId,
        clipboardAction: "write",
        value: "Milady clipboard",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "clipboard",
        id: tabId,
        clipboardAction: "paste",
        selector: 'input[name="name"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    const pasted = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        selector: 'input[name="name"]',
        getMode: "value",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(pasted.value).toBe("Milady clipboard");
    await executeBrowserWorkspaceCommand(
      {
        subaction: "clipboard",
        clipboardAction: "copy",
        selector: 'input[name="name"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    const copied = await executeBrowserWorkspaceCommand(
      {
        subaction: "clipboard",
        clipboardAction: "read",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(copied.value).toBe("Milady clipboard");

    const mouseMove = await executeBrowserWorkspaceCommand(
      {
        subaction: "mouse",
        mouseAction: "move",
        x: 48,
        y: 96,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(mouseMove.value).toEqual(expect.objectContaining({ x: 48, y: 96 }));
    const mouseDown = await executeBrowserWorkspaceCommand(
      {
        subaction: "mouse",
        mouseAction: "down",
        button: "left",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(mouseDown.value).toEqual(
      expect.objectContaining({ buttons: ["left"] }),
    );
    const mouseUp = await executeBrowserWorkspaceCommand(
      {
        subaction: "mouse",
        mouseAction: "up",
        button: "left",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(mouseUp.value).toEqual(expect.objectContaining({ buttons: [] }));
    const wheel = await executeBrowserWorkspaceCommand(
      {
        subaction: "mouse",
        mouseAction: "wheel",
        deltaY: 120,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(wheel.value).toEqual(expect.objectContaining({ axis: "y" }));

    const upload = await executeBrowserWorkspaceCommand(
      {
        subaction: "upload",
        id: tabId,
        selector: 'input[name="attachment"]',
        files: ["/tmp/demo-a.txt", "/tmp/demo-b.txt"],
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(upload.value).toEqual(
      expect.objectContaining({ files: ["demo-a.txt", "demo-b.txt"] }),
    );

    const drag = await executeBrowserWorkspaceCommand(
      {
        subaction: "drag",
        id: tabId,
        selector: '[data-testid="drag-source"]',
        value: '[data-testid="drop-target"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(drag.value).toEqual(
      expect.objectContaining({
        source: '[data-testid="drag-source"]',
        target: '[data-testid="drop-target"]',
      }),
    );

    const frame = await executeBrowserWorkspaceCommand(
      {
        subaction: "frame",
        id: tabId,
        frameAction: "select",
        selector: 'iframe[title="Embedded Frame"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(frame.value).toEqual(
      expect.objectContaining({ frame: expect.stringContaining("iframe") }),
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        id: tabId,
        selector: 'input[name="frameName"]',
        value: "Inside Frame",
      },
      {} as NodeJS.ProcessEnv,
    );
    const frameValue = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        id: tabId,
        selector: 'input[name="frameName"]',
        getMode: "value",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(frameValue.value).toBe("Inside Frame");

    await executeBrowserWorkspaceCommand(
      {
        subaction: "frame",
        id: tabId,
        frameAction: "main",
      },
      {} as NodeJS.ProcessEnv,
    );

    const newTab = await executeBrowserWorkspaceCommand(
      {
        subaction: "tab",
        tabAction: "new",
        show: false,
        url: fixture.tasksUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(newTab.tab?.url).toBe(fixture.tasksUrl);

    const tabs = await executeBrowserWorkspaceCommand(
      {
        subaction: "tab",
        tabAction: "list",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(tabs.tabs).toHaveLength(2);

    const switched = await executeBrowserWorkspaceCommand(
      {
        subaction: "tab",
        tabAction: "switch",
        index: 1,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(switched.tab?.url).toBe(fixture.tasksUrl);

    const win = await executeBrowserWorkspaceCommand(
      {
        subaction: "window",
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(win.tab?.visible).toBe(true);

    const closed = await executeBrowserWorkspaceCommand(
      {
        subaction: "tab",
        tabAction: "close",
        id: newTab.tab?.id,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(closed.closed).toBe(true);
  });

  it("supports settings, cookies/storage, network, dialog, console/errors, diff, trace/profile, state, and pdf helpers", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    const tabId = open.tab?.id ?? "";
    expect(tabId).toMatch(/^btab_\d+$/);

    const settings = await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        id: tabId,
        setAction: "viewport",
        width: 900,
        height: 700,
        scale: 2,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(settings.value).toEqual(
      expect.objectContaining({
        viewport: expect.objectContaining({
          width: 900,
          height: 700,
          scale: 2,
        }),
      }),
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        id: tabId,
        setAction: "headers",
        headers: { "x-milady-test": "yes" },
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        id: tabId,
        setAction: "credentials",
        username: "milady",
        password: "browser",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        id: tabId,
        setAction: "media",
        media: "dark",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        setAction: "device",
        device: "iPhone 14",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        id: tabId,
        setAction: "geo",
        latitude: 37.78,
        longitude: -122.41,
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        setAction: "offline",
        offline: true,
      },
      {} as NodeJS.ProcessEnv,
    );
    await expect(
      executeBrowserWorkspaceCommand(
        {
          subaction: "eval",
          script: `fetch(${JSON.stringify(fixture.tasksUrl.replace("/tasks", "/echo"))}).then((response) => response.text())`,
        },
        {} as NodeJS.ProcessEnv,
      ),
    ).rejects.toThrow("offline");
    await executeBrowserWorkspaceCommand(
      {
        subaction: "set",
        setAction: "offline",
        offline: false,
      },
      {} as NodeJS.ProcessEnv,
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "cookies",
        id: tabId,
        cookieAction: "set",
        name: "session",
        value: "abc123",
      },
      {} as NodeJS.ProcessEnv,
    );
    const cookies = await executeBrowserWorkspaceCommand(
      {
        subaction: "cookies",
        id: tabId,
        cookieAction: "get",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(cookies.value).toEqual(
      expect.objectContaining({ session: "abc123" }),
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "storage",
        storageArea: "session",
        storageAction: "set",
        entryKey: "session-note",
        value: "remember session",
      },
      {} as NodeJS.ProcessEnv,
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "storage",
        id: tabId,
        storageArea: "local",
        storageAction: "set",
        entryKey: "draft",
        value: "remember me",
      },
      {} as NodeJS.ProcessEnv,
    );
    const localStorageValue = await executeBrowserWorkspaceCommand(
      {
        subaction: "storage",
        id: tabId,
        storageArea: "local",
        entryKey: "draft",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(localStorageValue.value).toBe("remember me");
    const sessionStorageValue = await executeBrowserWorkspaceCommand(
      {
        subaction: "storage",
        storageArea: "session",
        entryKey: "session-note",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(sessionStorageValue.value).toBe("remember session");

    await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        id: tabId,
        networkAction: "route",
        url: "**/mocked",
        responseBody: "mocked response",
        responseStatus: 201,
        responseHeaders: { "content-type": "text/plain" },
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        id: tabId,
        networkAction: "harstart",
      },
      {} as NodeJS.ProcessEnv,
    );
    const mocked = await executeBrowserWorkspaceCommand(
      {
        subaction: "eval",
        id: tabId,
        script:
          'fetch("http://127.0.0.1/mocked").then((response) => response.text())',
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(mocked.value).toBe("mocked response");

    const echoed = await executeBrowserWorkspaceCommand(
      {
        subaction: "eval",
        id: tabId,
        script: `fetch(${JSON.stringify(fixture.tasksUrl.replace("/tasks", "/echo"))}).then((response) => response.json())`,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(echoed.value).toEqual(
      expect.objectContaining({
        authorization: expect.stringContaining("Basic "),
        headers: expect.objectContaining({ "x-milady-test": "yes" }),
      }),
    );

    const requests = await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        id: tabId,
        networkAction: "requests",
      },
      {} as NodeJS.ProcessEnv,
    );
    const requestList = requests.value as Array<{
      id: string;
      status: number | null;
    }>;
    expect(requestList.some((entry) => entry.status === 201)).toBe(true);

    const requestDetail = await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        id: tabId,
        networkAction: "request",
        requestId: requestList[0]?.id,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(requestDetail.value).toEqual(
      expect.objectContaining({ id: requestList[0]?.id }),
    );
    const filteredRequests = await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        networkAction: "requests",
        status: "201",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(filteredRequests.value).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 201 })]),
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        networkAction: "unroute",
        url: "**/mocked",
      },
      {} as NodeJS.ProcessEnv,
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "eval",
        id: tabId,
        script: 'console.log("browser-log"); "ok"',
      },
      {} as NodeJS.ProcessEnv,
    );
    const consoleEntries = await executeBrowserWorkspaceCommand(
      {
        subaction: "console",
        id: tabId,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(consoleEntries.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("browser-log"),
        }),
      ]),
    );
    const clearedConsole = await executeBrowserWorkspaceCommand(
      {
        subaction: "console",
        consoleAction: "clear",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(clearedConsole.value).toEqual([]);

    await expect(
      executeBrowserWorkspaceCommand(
        {
          subaction: "eval",
          id: tabId,
          script: 'throw new Error("browser-boom")',
        },
        {} as NodeJS.ProcessEnv,
      ),
    ).rejects.toThrow("browser-boom");

    const errors = await executeBrowserWorkspaceCommand(
      {
        subaction: "errors",
        id: tabId,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(errors.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("browser-boom"),
        }),
      ]),
    );
    const clearedErrors = await executeBrowserWorkspaceCommand(
      {
        subaction: "errors",
        consoleAction: "clear",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(clearedErrors.value).toEqual([]);

    await executeBrowserWorkspaceCommand(
      {
        subaction: "eval",
        id: tabId,
        script: 'confirm("Proceed?")',
      },
      {} as NodeJS.ProcessEnv,
    );
    const dialog = await executeBrowserWorkspaceCommand(
      {
        subaction: "dialog",
        id: tabId,
        dialogAction: "status",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(dialog.value).toEqual(
      expect.objectContaining({
        message: "Proceed?",
        open: true,
        type: "confirm",
      }),
    );
    const accepted = await executeBrowserWorkspaceCommand(
      {
        subaction: "dialog",
        id: tabId,
        dialogAction: "accept",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(accepted.value).toEqual(expect.objectContaining({ accepted: true }));
    await executeBrowserWorkspaceCommand(
      {
        subaction: "eval",
        script: 'prompt("Name?", "Milady")',
      },
      {} as NodeJS.ProcessEnv,
    );
    const dismissed = await executeBrowserWorkspaceCommand(
      {
        subaction: "dialog",
        dialogAction: "dismiss",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(dismissed.value).toEqual(
      expect.objectContaining({ accepted: false }),
    );

    const highlight = await executeBrowserWorkspaceCommand(
      {
        subaction: "highlight",
        selector: '[data-testid="secondary-action"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(highlight.value).toEqual(
      expect.objectContaining({ selector: '[data-testid="secondary-action"]' }),
    );

    const firstDiff = await executeBrowserWorkspaceCommand(
      {
        subaction: "diff",
        id: tabId,
        diffAction: "snapshot",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(firstDiff.value).toEqual(expect.objectContaining({ changed: true }));

    await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        id: tabId,
        selector: 'input[name="name"]',
        value: "Diff Me",
      },
      {} as NodeJS.ProcessEnv,
    );
    const secondDiff = await executeBrowserWorkspaceCommand(
      {
        subaction: "diff",
        id: tabId,
        diffAction: "snapshot",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(secondDiff.value).toEqual(
      expect.objectContaining({ changed: true }),
    );
    const urlDiff = await executeBrowserWorkspaceCommand(
      {
        subaction: "diff",
        diffAction: "url",
        url: fixture.formUrl,
        secondaryUrl: fixture.tasksUrl,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(urlDiff.value).toEqual(expect.objectContaining({ changed: true }));

    await executeBrowserWorkspaceCommand(
      {
        subaction: "screenshot",
        id: tabId,
      },
      {} as NodeJS.ProcessEnv,
    );
    const screenshotDiff = await executeBrowserWorkspaceCommand(
      {
        subaction: "diff",
        id: tabId,
        diffAction: "screenshot",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(screenshotDiff.value).toEqual(
      expect.objectContaining({ changed: false }),
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "trace",
        id: tabId,
        traceAction: "start",
      },
      {} as NodeJS.ProcessEnv,
    );
    const traceFile = path.join(
      os.tmpdir(),
      `milady-browser-trace-${Date.now()}.json`,
    );
    const trace = await executeBrowserWorkspaceCommand(
      {
        subaction: "trace",
        id: tabId,
        traceAction: "stop",
        filePath: traceFile,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fs.existsSync(traceFile)).toBe(true);
    expect(trace.value).toEqual(expect.objectContaining({ path: traceFile }));

    await executeBrowserWorkspaceCommand(
      {
        subaction: "profiler",
        id: tabId,
        profilerAction: "start",
      },
      {} as NodeJS.ProcessEnv,
    );
    const profileFile = path.join(
      os.tmpdir(),
      `milady-browser-profile-${Date.now()}.json`,
    );
    const profile = await executeBrowserWorkspaceCommand(
      {
        subaction: "profiler",
        id: tabId,
        profilerAction: "stop",
        filePath: profileFile,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fs.existsSync(profileFile)).toBe(true);
    expect(profile.value).toEqual(
      expect.objectContaining({ path: profileFile }),
    );

    const stateFile = path.join(
      os.tmpdir(),
      `milady-browser-state-${Date.now()}.json`,
    );
    const savedState = await executeBrowserWorkspaceCommand(
      {
        subaction: "state",
        id: tabId,
        stateAction: "save",
        filePath: stateFile,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(savedState.value).toEqual(
      expect.objectContaining({ path: stateFile }),
    );
    expect(fs.existsSync(stateFile)).toBe(true);

    await executeBrowserWorkspaceCommand(
      {
        subaction: "storage",
        id: tabId,
        storageArea: "local",
        storageAction: "clear",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "cookies",
        cookieAction: "clear",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "state",
        id: tabId,
        stateAction: "load",
        filePath: stateFile,
      },
      {} as NodeJS.ProcessEnv,
    );
    const restoredStorage = await executeBrowserWorkspaceCommand(
      {
        subaction: "storage",
        id: tabId,
        storageArea: "local",
        entryKey: "draft",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(restoredStorage.value).toBe("remember me");
    const restoredCookies = await executeBrowserWorkspaceCommand(
      {
        subaction: "cookies",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(restoredCookies.value).toEqual(
      expect.objectContaining({ session: "abc123" }),
    );

    const pdfFile = path.join(os.tmpdir(), `milady-browser-${Date.now()}.pdf`);
    const pdf = await executeBrowserWorkspaceCommand(
      {
        subaction: "pdf",
        filePath: pdfFile,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(pdf.value).toEqual(expect.objectContaining({ path: pdfFile }));
    expect(fs.existsSync(pdfFile)).toBe(true);

    const harFile = path.join(
      os.tmpdir(),
      `milady-browser-har-${Date.now()}.json`,
    );
    const har = await executeBrowserWorkspaceCommand(
      {
        subaction: "network",
        networkAction: "harstop",
        filePath: harFile,
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fs.existsSync(harFile)).toBe(true);
    expect(har.value).toEqual(expect.objectContaining({ path: harFile }));
  });
});
