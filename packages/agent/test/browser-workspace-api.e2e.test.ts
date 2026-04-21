import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { manageMiladyBrowserWorkspaceAction } from "../../../plugins/plugin-milady-browser/src/action";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";
import {
  type BrowserWorkspaceTab,
  closeBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
} from "../src/services/browser-workspace";

type LocalSiteFixture = {
  counterUrl: string;
  formUrl: string;
  tasksUrl: string;
  close: () => Promise<void>;
};

type BrowserWorkspaceSnapshotPayload = {
  mode?: string;
  tabs?: BrowserWorkspaceTab[];
};

function inferLabel(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "") || "Milady Browser";
}

async function startLocalSiteFixture(): Promise<LocalSiteFixture> {
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
        }),
      );
      return;
    }
    const html =
      url.pathname === "/tasks"
        ? `<!doctype html>
            <html lang="en">
              <head><meta charset="utf-8" /><title>Tasks Fixture</title></head>
              <body><h1>Tasks Fixture</h1><p>Agent task board</p></body>
            </html>`
        : url.pathname === "/welcome"
          ? `<!doctype html>
              <html lang="en">
                <head><meta charset="utf-8" /><title>Welcome Fixture</title></head>
                <body>
                  <h1>Welcome, ${url.searchParams.get("name") || "Anonymous"}</h1>
                  <a href="/tasks">Open tasks</a>
                </body>
              </html>`
          : url.pathname === "/form"
            ? `<!doctype html>
                <html lang="en">
                  <head><meta charset="utf-8" /><title>Browser Form Fixture</title></head>
                  <body>
	                    <h1>Browser Form Fixture</h1>
	                    <form action="/welcome" method="get">
	                      <label>Agent name<input name="name" value="" /></label>
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
                          srcdoc='<!doctype html><html lang="en"><body><label>Frame name<input name="frameName" value="" /></label><button type="button" data-testid="frame-button">Frame Continue</button></body></html>'
                        ></iframe>
	                    </form>
	                    <a href="/tasks">Open tasks</a>
	                  </body>
	                </html>`
            : `<!doctype html>
                <html lang="en">
                  <head><meta charset="utf-8" /><title>Counter Fixture</title></head>
                  <body><h1>Counter Fixture</h1><p>Agent browser workspace test page</p></body>
                </html>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const primaryBase = `http://127.0.0.1:${address.port}`;

  return {
    counterUrl: `${primaryBase}/counter`,
    formUrl: `${primaryBase}/form`,
    tasksUrl: `${primaryBase}/tasks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function readSnapshot(
  data: Record<string, unknown>,
): BrowserWorkspaceSnapshotPayload {
  return {
    mode: typeof data.mode === "string" ? data.mode : undefined,
    tabs: Array.isArray(data.tabs) ? (data.tabs as BrowserWorkspaceTab[]) : [],
  };
}

describe("Browser workspace API E2E", () => {
  let apiServer: { port: number; close: () => Promise<void> };
  let siteFixture: LocalSiteFixture;

  beforeAll(async () => {
    siteFixture = await startLocalSiteFixture();
    apiServer = await startApiServer({ port: 0 });
  }, 30_000);

  beforeEach(async () => {
    const tabs = await listBrowserWorkspaceTabs();
    await Promise.all(tabs.map((tab) => closeBrowserWorkspaceTab(tab.id)));
  });

  afterAll(async () => {
    await apiServer.close();
    await siteFixture.close();
  });

  it("opens, shows, navigates, and closes tabs through the real browser workspace API", async () => {
    const openFirst = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/tabs",
      {
        show: true,
        title: "Counter Fixture",
        url: siteFixture.counterUrl,
      },
    );
    expect(openFirst.status).toBe(200);

    const firstTab = openFirst.data.tab as BrowserWorkspaceTab;
    expect(firstTab.url).toBe(siteFixture.counterUrl);
    expect(firstTab.visible).toBe(true);

    const openSecond = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/tabs",
      {
        show: false,
        title: "Tasks Fixture",
        url: siteFixture.tasksUrl,
      },
    );
    expect(openSecond.status).toBe(200);

    const secondTab = openSecond.data.tab as BrowserWorkspaceTab;
    expect(secondTab.visible).toBe(false);

    const initialSnapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(initialSnapshot.mode).toBe("web");
    expect(initialSnapshot.tabs).toHaveLength(2);
    expect(initialSnapshot.tabs?.[0]?.url).toBe(siteFixture.counterUrl);
    expect(initialSnapshot.tabs?.[1]?.url).toBe(siteFixture.tasksUrl);

    const showSecond = await req(
      apiServer.port,
      "POST",
      `/api/browser-workspace/tabs/${encodeURIComponent(secondTab.id)}/show`,
    );
    expect(showSecond.status).toBe(200);
    expect((showSecond.data.tab as BrowserWorkspaceTab).visible).toBe(true);

    const navigateSecond = await req(
      apiServer.port,
      "POST",
      `/api/browser-workspace/tabs/${encodeURIComponent(secondTab.id)}/navigate`,
      { url: siteFixture.counterUrl },
    );
    expect(navigateSecond.status).toBe(200);
    expect((navigateSecond.data.tab as BrowserWorkspaceTab).url).toBe(
      siteFixture.counterUrl,
    );

    const afterShowSnapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(
      afterShowSnapshot.tabs?.find((tab) => tab.id === firstTab.id)?.visible,
    ).toBe(false);
    expect(
      afterShowSnapshot.tabs?.find((tab) => tab.id === secondTab.id)?.visible,
    ).toBe(true);

    const closeFirst = await req(
      apiServer.port,
      "DELETE",
      `/api/browser-workspace/tabs/${encodeURIComponent(firstTab.id)}`,
    );
    expect(closeFirst.status).toBe(200);
    expect(closeFirst.data.closed).toBe(true);

    const finalSnapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(finalSnapshot.tabs).toHaveLength(1);
    expect(finalSnapshot.tabs?.[0]?.id).toBe(secondTab.id);
    expect(finalSnapshot.tabs?.[0]?.url).toBe(siteFixture.counterUrl);
  });

  it("shares browser workspace state between the plugin action and the real API routes", async () => {
    const callback = vi.fn();

    const openResult = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: `Open ${siteFixture.counterUrl} in the browser workspace`,
        },
      } as never,
      undefined,
      {
        parameters: {
          show: true,
        },
      },
      callback,
    );

    expect(openResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Opened visible browser tab"),
    });

    const snapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.tabs?.[0]?.url).toBe(siteFixture.counterUrl);
    expect(snapshot.tabs?.[0]?.title).toBe(inferLabel(siteFixture.counterUrl));

    const listResult = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: "List browser tabs",
        },
      } as never,
      undefined,
      undefined,
      vi.fn(),
    );

    expect(listResult).toMatchObject({
      success: true,
      text: expect.stringContaining(siteFixture.counterUrl),
    });
  });

  it("runs browser subactions through the real command route", async () => {
    const open = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "open",
      show: true,
      url: siteFixture.formUrl,
    });
    expect(open.status).toBe(200);
    expect((open.data.tab as BrowserWorkspaceTab).url).toBe(siteFixture.formUrl);

    const inspect = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/command",
      {
        subaction: "inspect",
      },
    );
    expect(inspect.status).toBe(200);
    expect(inspect.data.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: "input[name=\"name\"]" }),
        expect.objectContaining({ selector: "button[type=\"submit\"]" }),
      ]),
    );

    const batch = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/command",
      {
        subaction: "batch",
        steps: [
          {
            subaction: "fill",
            selector: "input[name=\"name\"]",
            value: "Milady",
          },
          {
            subaction: "click",
            selector: "button[type=\"submit\"]",
          },
          {
            subaction: "get",
            selector: "h1",
            getMode: "text",
          },
        ],
      },
    );
    expect(batch.status).toBe(200);
    expect(batch.data.subaction).toBe("batch");
    expect(batch.data.value).toBe("Welcome, Milady");
  });

  it("supports semantic browser subactions through the real command route", async () => {
    const open = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "open",
      show: true,
      url: siteFixture.formUrl,
    });
    expect(open.status).toBe(200);

    const fill = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "find",
      findBy: "label",
      action: "fill",
      text: "Agent name",
      value: "Milady",
    });
    expect(fill.status).toBe(200);
    expect(fill.data.value).toEqual(expect.objectContaining({ value: "Milady" }));

    const select = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "select",
      findBy: "label",
      text: "Plan",
      value: "pro",
    });
    expect(select.status).toBe(200);
    expect(select.data.value).toEqual(expect.objectContaining({ value: "pro" }));

    const check = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "check",
      findBy: "label",
      text: "Accept terms",
    });
    expect(check.status).toBe(200);
    expect(check.data.value).toEqual(expect.objectContaining({ checked: true }));

    const snapshot = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/command",
      {
        subaction: "snapshot",
      },
    );
    expect(snapshot.status).toBe(200);
    expect(snapshot.data.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: "input[name=\"name\"]" }),
        expect.objectContaining({ selector: "select[name=\"plan\"]" }),
      ]),
    );

    const checked = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "get",
      findBy: "label",
      text: "Accept terms",
      getMode: "checked",
    });
    expect(checked.status).toBe(200);
    expect(checked.data.value).toBe(true);

    const click = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "click",
      selector: 'role=button[name="Continue"]',
    });
    expect(click.status).toBe(200);

    const heading = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "get",
      selector: "text=Welcome, Milady",
      getMode: "text",
    });
    expect(heading.status).toBe(200);
    expect(heading.data.value).toBe("Welcome, Milady");
  });

  it("supports snapshot element refs and timed waits through the real command route", async () => {
    const open = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "open",
      show: true,
      url: siteFixture.formUrl,
    });
    expect(open.status).toBe(200);

    const snapshot = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "snapshot",
    });
    expect(snapshot.status).toBe(200);

    const elements = Array.isArray(snapshot.data.elements) ? snapshot.data.elements : [];
    const nameRef = elements.find((element) =>
      String(element.selector).includes('input[name="name"]'),
    )?.ref;
    const planRef = elements.find((element) =>
      String(element.selector).includes('select[name="plan"]'),
    )?.ref;
    const termsRef = elements.find(
      (element) =>
        String(element.type) === "checkbox" ||
        String(element.selector).includes('input[name="terms"]'),
    )?.ref;
    const continueRef = elements.find((element) =>
      String(element.selector).includes('button[type="submit"]'),
    )?.ref;

    expect(nameRef).toEqual(expect.stringMatching(/^@e\d+$/));
    expect(planRef).toEqual(expect.stringMatching(/^@e\d+$/));
    expect(termsRef).toEqual(expect.stringMatching(/^@e\d+$/));
    expect(continueRef).toEqual(expect.stringMatching(/^@e\d+$/));

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "fill",
        selector: nameRef,
        value: "Milady",
      }),
    ).toMatchObject({ status: 200 });

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "select",
        selector: planRef,
        value: "pro",
      }),
    ).toMatchObject({ status: 200 });

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "check",
        selector: termsRef,
      }),
    ).toMatchObject({ status: 200 });

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "click",
        selector: continueRef,
      }),
    ).toMatchObject({ status: 200 });

    const heading = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "get",
      selector: "h1",
      getMode: "text",
    });
    expect(heading.status).toBe(200);
    expect(heading.data.value).toBe("Welcome, Milady");

    const startedAt = Date.now();
    const wait = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "wait",
      ms: 30,
    });
    expect(wait.status).toBe(200);
    expect(wait.data.value).toEqual({ waitedMs: 30 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
  });

  it("supports clipboard, upload, drag, frame, tab, and window subactions through the real command route", async () => {
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "open",
        show: true,
        url: siteFixture.formUrl,
      }),
    ).toMatchObject({ status: 200 });

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "clipboard",
        clipboardAction: "write",
        value: "API clipboard",
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "clipboard",
        clipboardAction: "paste",
        selector: 'input[name="name"]',
      }),
    ).toMatchObject({ status: 200 });
    const pasted = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "get",
      selector: 'input[name="name"]',
      getMode: "value",
    });
    expect(pasted.data.value).toBe("API clipboard");

    const upload = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "upload",
      selector: 'input[name="attachment"]',
      files: ["/tmp/api-a.txt"],
    });
    expect(upload.status).toBe(200);
    expect(upload.data.value).toEqual(
      expect.objectContaining({ files: ["api-a.txt"] }),
    );

    const drag = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "drag",
      selector: '[data-testid="drag-source"]',
      value: '[data-testid="drop-target"]',
    });
    expect(drag.status).toBe(200);

    const frame = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "frame",
      frameAction: "select",
      selector: 'iframe[title="Embedded Frame"]',
    });
    expect(frame.status).toBe(200);

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "fill",
        selector: 'input[name="frameName"]',
        value: "API Frame",
      }),
    ).toMatchObject({ status: 200 });
    const frameValue = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "get",
      selector: 'input[name="frameName"]',
      getMode: "value",
    });
    expect(frameValue.data.value).toBe("API Frame");

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "frame",
        frameAction: "main",
      }),
    ).toMatchObject({ status: 200 });

    const newTab = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "tab",
      tabAction: "new",
      show: false,
      url: siteFixture.tasksUrl,
    });
    expect(newTab.status).toBe(200);

    const tabs = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "tab",
      tabAction: "list",
    });
    expect(tabs.data.tabs).toHaveLength(2);

    const win = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "window",
      url: siteFixture.formUrl,
    });
    expect(win.status).toBe(200);
    expect(win.data.tab.visible).toBe(true);
  });

  it("supports settings, cookies/storage, network, dialog, console/errors, diff, trace/profile, state, and pdf through the real command route", async () => {
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "open",
        show: true,
        url: siteFixture.formUrl,
      }),
    ).toMatchObject({ status: 200 });

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "set",
        setAction: "viewport",
        width: 820,
        height: 640,
        scale: 2,
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "set",
        setAction: "headers",
        headers: { "x-milady-api": "yes" },
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "set",
        setAction: "credentials",
        username: "api",
        password: "browser",
      }),
    ).toMatchObject({ status: 200 });

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "cookies",
        cookieAction: "set",
        name: "session",
        value: "api-cookie",
      }),
    ).toMatchObject({ status: 200 });
    const cookies = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "cookies",
    });
    expect(cookies.data.value).toEqual(
      expect.objectContaining({ session: "api-cookie" }),
    );

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "storage",
        storageArea: "local",
        storageAction: "set",
        entryKey: "draft",
        value: "api remember",
      }),
    ).toMatchObject({ status: 200 });
    const stored = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "storage",
      storageArea: "local",
      entryKey: "draft",
    });
    expect(stored.data.value).toBe("api remember");

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "network",
        networkAction: "route",
        url: "**/mocked",
        responseBody: "api mocked",
        responseStatus: 202,
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "network",
        networkAction: "harstart",
      }),
    ).toMatchObject({ status: 200 });

    const mocked = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "eval",
      script: 'fetch("http://127.0.0.1/mocked").then((response) => response.text())',
    });
    expect(mocked.status).toBe(200);
    expect(mocked.data.value).toBe("api mocked");

    const echoed = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "eval",
      script: `fetch(${JSON.stringify(siteFixture.tasksUrl.replace("/tasks", "/echo"))}).then((response) => response.json())`,
    });
    expect(echoed.status).toBe(200);
    expect(echoed.data.value).toEqual(
      expect.objectContaining({
        authorization: expect.stringContaining("Basic "),
        headers: expect.objectContaining({ "x-milady-api": "yes" }),
      }),
    );

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "eval",
        script: 'console.log("api-log"); confirm("Ship it?"); "ok"',
      }),
    ).toMatchObject({ status: 200 });
    const dialog = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "dialog",
      dialogAction: "status",
    });
    expect(dialog.status).toBe(200);
    expect(dialog.data.value).toEqual(
      expect.objectContaining({ message: "Ship it?", type: "confirm" }),
    );

    const consoleEntries = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "console",
    });
    expect(consoleEntries.data.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("api-log") }),
      ]),
    );

    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "eval",
        script: 'throw new Error("api-boom")',
      }),
    ).toMatchObject({ status: 500 });
    const errors = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "errors",
    });
    expect(errors.data.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("api-boom") }),
      ]),
    );

    const diff = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "diff",
      diffAction: "snapshot",
    });
    expect(diff.status).toBe(200);
    expect(diff.data.value).toEqual(expect.objectContaining({ changed: true }));

    const screenshot = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "screenshot",
    });
    expect(screenshot.status).toBe(200);
    const screenshotDiff = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/command",
      {
        subaction: "diff",
        diffAction: "screenshot",
      },
    );
    expect(screenshotDiff.status).toBe(200);

    const traceFile = path.join(os.tmpdir(), `milady-api-trace-${Date.now()}.json`);
    const trace = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "trace",
      traceAction: "start",
    });
    expect(trace.status).toBe(200);
    const stoppedTrace = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "trace",
      traceAction: "stop",
      filePath: traceFile,
    });
    expect(stoppedTrace.status).toBe(200);
    expect(fs.existsSync(traceFile)).toBe(true);

    const profileFile = path.join(os.tmpdir(), `milady-api-profile-${Date.now()}.json`);
    expect(
      await req(apiServer.port, "POST", "/api/browser-workspace/command", {
        subaction: "profiler",
        profilerAction: "start",
      }),
    ).toMatchObject({ status: 200 });
    const profile = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "profiler",
      profilerAction: "stop",
      filePath: profileFile,
    });
    expect(profile.status).toBe(200);
    expect(fs.existsSync(profileFile)).toBe(true);

    const stateFile = path.join(os.tmpdir(), `milady-api-state-${Date.now()}.json`);
    const savedState = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "state",
      stateAction: "save",
      filePath: stateFile,
    });
    expect(savedState.status).toBe(200);
    expect(fs.existsSync(stateFile)).toBe(true);

    const pdfFile = path.join(os.tmpdir(), `milady-api-${Date.now()}.pdf`);
    const pdf = await req(apiServer.port, "POST", "/api/browser-workspace/command", {
      subaction: "pdf",
      filePath: pdfFile,
    });
    expect(pdf.status).toBe(200);
    expect(fs.existsSync(pdfFile)).toBe(true);
  });
});
