import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { AgentRuntime, createCharacter, ModelType } from "@elizaos/core";
import pluginSql from "@elizaos/plugin-sql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { miladyBrowserPlugin } from "../../../plugins/plugin-milady-browser/src/index";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { withTimeout } from "../../../test/helpers/test-utils";
import { startApiServer } from "../src/api/server";
import {
  type BrowserWorkspaceTab,
  closeBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
} from "../src/services/browser-workspace";

type LocalSiteFixture = {
  counterUrl: string;
  formUrl: string;
  welcomeUrl: string;
  tasksUrl: string;
  notesUrl: string;
  close: () => Promise<void>;
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildBrowserActionParams(
  params: Record<string, string | boolean>,
): string {
  const paramsXml = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
    .join("");

  return `<action><name>MANAGE_MILADY_BROWSER_WORKSPACE</name><params>${paramsXml}</params></action>`;
}

function buildBrowserActionResponse(params: Record<string, string | boolean>): {
  thought: string;
  actions: string;
  text: string;
  simple: boolean;
  params: string;
} {
  return {
    thought:
      "Use the Milady browser workspace action to manage the requested tab.",
    actions: "MANAGE_MILADY_BROWSER_WORKSPACE",
    text: "",
    simple: false,
    params: buildBrowserActionParams(params),
  };
}

function serializeBrowserActionResponse(response: {
  thought: string;
  actions: string;
  text: string;
  simple: boolean;
  params: string;
}): string {
  const fields = [
    `<thought>${escapeXml(response.thought)}</thought>`,
    `<actions>${escapeXml(response.actions)}</actions>`,
    `<text>${escapeXml(response.text)}</text>`,
    `<simple>${response.simple ? "true" : "false"}</simple>`,
    `<params>${response.params}</params>`,
  ].join("");

  return `<response>${fields}</response>`;
}

async function startLocalSiteFixture(): Promise<LocalSiteFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
	    const page =
	      url.pathname === "/tasks"
	        ? {
	            title: "Tasks Fixture",
	            body: "<h1>Tasks Fixture</h1><p>Agent task board</p>",
	          }
	        : url.pathname === "/welcome"
	          ? {
	              title: "Welcome Fixture",
	              body: `<h1>Welcome, ${url.searchParams.get("name") || "Anonymous"}</h1><p>Agent browser workspace welcome page</p>`,
	            }
	          : url.pathname === "/form"
	            ? {
	                title: "Browser Form Fixture",
	                body:
	                  '<h1>Browser Form Fixture</h1><form action="/welcome" method="get"><label>Agent name<input name="name" value="" /></label><label>Plan<select name="plan"><option value="basic">Basic</option><option value="pro">Pro</option></select></label><label><input type="checkbox" name="terms" value="yes" />Accept terms</label><button type="submit">Continue</button></form>',
	              }
	        : url.pathname === "/notes"
	          ? {
	              title: "Notes Fixture",
	              body: "<h1>Notes Fixture</h1><p>Agent notes page</p>",
            }
          : {
              title: "Counter Fixture",
              body: "<h1>Counter Fixture</h1><p>Agent browser workspace counter</p>",
            };

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>${page.title}</title></head><body>${page.body}</body></html>`,
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

	  return {
	    counterUrl: `${baseUrl}/counter`,
	    formUrl: `${baseUrl}/form`,
	    welcomeUrl: `${baseUrl}/welcome?name=Milady`,
	    tasksUrl: `${baseUrl}/tasks`,
	    notesUrl: `${baseUrl}/notes`,
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

async function findTabByUrl(
  url: string,
): Promise<BrowserWorkspaceTab | undefined> {
  const tabs = await listBrowserWorkspaceTabs();
  return tabs.find((tab) => tab.url === url);
}

describe("Browser workspace agent chat E2E", () => {
  let runtime: AgentRuntime;
  let apiServer: { port: number; close: () => Promise<void> };
  let siteFixture: LocalSiteFixture;
  let previousPgliteDataDir: string | undefined;
  let pgliteDir = "";
  let plannerTurn = 0;
  let plannerScenario: "form" | "tabs" = "tabs";

  beforeAll(async () => {
    previousPgliteDataDir = process.env.PGLITE_DATA_DIR;
    pgliteDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-browser-agent-"));
    process.env.PGLITE_DATA_DIR = pgliteDir;

    siteFixture = await startLocalSiteFixture();
    runtime = new AgentRuntime({
      character: createCharacter({
        name: "BrowserAgent",
        system:
          "You control the Milady browser workspace for end-to-end tests.",
      }),
      plugins: [miladyBrowserPlugin],
      logLevel: "error",
      enableAutonomy: false,
    });

    await runtime.registerPlugin(pluginSql);
    if (runtime.adapter && !(await runtime.adapter.isReady())) {
      await runtime.adapter.init();
    }
    await runtime.initialize();

    runtime.setSetting("CONTINUE_AFTER_ACTIONS", "false");
    runtime.setSetting("USE_MULTI_STEP", "false");
    vi.spyOn(runtime, "isCheckShouldRespondEnabled").mockReturnValue(false);
    runtime.registerModel(
      ModelType.ACTION_PLANNER,
      async () => {
        if (plannerScenario === "form") {
          return serializeBrowserActionResponse(
            buildBrowserActionResponse({
              operation: "batch",
              stepsJson: JSON.stringify([
                {
                  subaction: "open",
                  show: true,
                  url: siteFixture.formUrl,
                },
                {
                  subaction: "find",
                  findBy: "label",
                  action: "fill",
                  text: "Agent name",
                  value: "Milady",
                },
                {
                  subaction: "select",
                  findBy: "label",
                  text: "Plan",
                  value: "pro",
                },
                {
                  subaction: "check",
                  findBy: "label",
                  text: "Accept terms",
                },
                {
                  subaction: "find",
                  findBy: "role",
                  role: "button",
                  name: "Continue",
                  action: "click",
                },
                {
                  subaction: "get",
                  selector: "h1",
                  getMode: "text",
                },
              ]),
            }),
          );
        }

        switch (plannerTurn++) {
          case 0:
            return serializeBrowserActionResponse(
              buildBrowserActionResponse({
                operation: "open",
                show: true,
                url: siteFixture.counterUrl,
              }),
            );
          case 1:
            return serializeBrowserActionResponse(
              buildBrowserActionResponse({
                operation: "open",
                show: false,
                url: siteFixture.tasksUrl,
              }),
            );
          case 2: {
            const tasksTab = await findTabByUrl(siteFixture.tasksUrl);
            if (!tasksTab) {
              throw new Error("Tasks tab was not opened before the show step.");
            }
            return serializeBrowserActionResponse(
              buildBrowserActionResponse({
                id: tasksTab.id,
                operation: "show",
              }),
            );
          }
          case 3: {
            const visibleTab = (await listBrowserWorkspaceTabs()).find(
              (tab) => tab.visible,
            );
            if (!visibleTab) {
              throw new Error("No visible tab was available for navigation.");
            }
            return serializeBrowserActionResponse(
              buildBrowserActionResponse({
                id: visibleTab.id,
                operation: "navigate",
                url: siteFixture.notesUrl,
              }),
            );
          }
          case 4:
            return serializeBrowserActionResponse(
              buildBrowserActionResponse({
                operation: "list",
              }),
            );
          case 5: {
            const counterTab = await findTabByUrl(siteFixture.counterUrl);
            if (!counterTab) {
              throw new Error("Counter tab was not available for closing.");
            }
            return serializeBrowserActionResponse(
              buildBrowserActionResponse({
                id: counterTab.id,
                operation: "close",
              }),
            );
          }
          default:
            throw new Error(`Unexpected planner turn ${plannerTurn - 1}.`);
        }
      },
      "browser-workspace-test",
    );

    apiServer = await startApiServer({ port: 0, runtime });
  }, 180_000);

  beforeEach(async () => {
    plannerTurn = 0;
    plannerScenario = "tabs";
    const tabs = await listBrowserWorkspaceTabs();
    await Promise.all(tabs.map((tab) => closeBrowserWorkspaceTab(tab.id)));
  });

  afterAll(async () => {
    if (apiServer) {
      await apiServer.close();
    }
    if (runtime) {
      await withTimeout(runtime.stop(), 60_000, "runtime.stop()");
    }
    if (siteFixture) {
      await siteFixture.close();
    }
    if (pgliteDir) {
      fs.rmSync(pgliteDir, { recursive: true, force: true });
    }
    if (previousPgliteDataDir === undefined) {
      delete process.env.PGLITE_DATA_DIR;
    } else {
      process.env.PGLITE_DATA_DIR = previousPgliteDataDir;
    }
  });

  it("uses the real chat API and runtime to open, switch, navigate, list, and close browser tabs", async () => {
    const { conversationId } = await createConversation(apiServer.port, {
      includeGreeting: false,
      title: "Browser agent chat",
    });

    const openCounter = await postConversationMessage(
      apiServer.port,
      conversationId,
      {
        text: "Open the counter fixture in the Milady browser workspace and keep it visible.",
      },
    );
    expect(openCounter.status).toBe(200);
    expect(openCounter.data.text).toEqual(
      expect.stringContaining("Opened visible browser tab"),
    );
    expect(await listBrowserWorkspaceTabs()).toEqual([
      expect.objectContaining({
        url: siteFixture.counterUrl,
        visible: true,
      }),
    ]);

    const openTasks = await postConversationMessage(
      apiServer.port,
      conversationId,
      {
        text: "Open the tasks board in a background tab.",
      },
    );
    expect(openTasks.status).toBe(200);
    expect(openTasks.data.text).toEqual(
      expect.stringContaining("Opened background browser tab"),
    );
    let tabs = await listBrowserWorkspaceTabs();
    expect(tabs).toHaveLength(2);
    expect(
      tabs.find((tab) => tab.url === siteFixture.counterUrl)?.visible,
    ).toBe(true);
    expect(tabs.find((tab) => tab.url === siteFixture.tasksUrl)?.visible).toBe(
      false,
    );

    const showTasks = await postConversationMessage(
      apiServer.port,
      conversationId,
      {
        text: "Bring the tasks board tab to the front.",
      },
    );
    expect(showTasks.status).toBe(200);
    expect(showTasks.data.text).toEqual(
      expect.stringContaining("Showing browser tab"),
    );
    tabs = await listBrowserWorkspaceTabs();
    expect(
      tabs.find((tab) => tab.url === siteFixture.counterUrl)?.visible,
    ).toBe(false);
    expect(tabs.find((tab) => tab.url === siteFixture.tasksUrl)?.visible).toBe(
      true,
    );

    const navigateVisible = await postConversationMessage(
      apiServer.port,
      conversationId,
      {
        text: "Navigate the visible tab to the notes page.",
      },
    );
    expect(navigateVisible.status).toBe(200);
    expect(navigateVisible.data.text).toEqual(
      expect.stringContaining("Navigated"),
    );
    tabs = await listBrowserWorkspaceTabs();
    expect(tabs.find((tab) => tab.visible)?.url).toBe(siteFixture.notesUrl);

    const listTabs = await postConversationMessage(
      apiServer.port,
      conversationId,
      {
        text: "List the browser workspace tabs.",
      },
    );
    expect(listTabs.status).toBe(200);
    expect(listTabs.data.text).toEqual(
      expect.stringContaining(siteFixture.counterUrl),
    );
    expect(listTabs.data.text).toEqual(
      expect.stringContaining(siteFixture.notesUrl),
    );

    const closeCounter = await postConversationMessage(
      apiServer.port,
      conversationId,
      {
        text: "Close the counter tab.",
      },
    );
    expect(closeCounter.status).toBe(200);
    expect(closeCounter.data.text).toEqual(
      expect.stringContaining("Closed browser tab"),
    );
    tabs = await listBrowserWorkspaceTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.url).toBe(siteFixture.notesUrl);
    expect(tabs[0]?.visible).toBe(true);
  });

  it("uses the real chat API and runtime to complete a richer browser task through one main browser action", async () => {
    plannerScenario = "form";
    const { conversationId } = await createConversation(apiServer.port, {
      includeGreeting: false,
      title: "Browser agent form task",
    });

    const response = await postConversationMessage(apiServer.port, conversationId, {
      text: "Open the form, fill the name, choose the pro plan, accept terms, submit it, and tell me the heading.",
    });

    expect(response.status).toBe(200);
    expect(response.data.text).toEqual(
      expect.stringContaining("Completed 6 browser subactions"),
    );
    expect(response.data.text).toEqual(
      expect.stringContaining("Welcome, Milady"),
    );

    const tabs = await listBrowserWorkspaceTabs();
    expect(tabs).toHaveLength(1);
    const submittedUrl = new URL(tabs[0]?.url ?? "");
    expect(`${submittedUrl.origin}${submittedUrl.pathname}`).toBe(
      `${new URL(siteFixture.welcomeUrl).origin}${new URL(siteFixture.welcomeUrl).pathname}`,
    );
    expect(submittedUrl.searchParams.get("name")).toBe("Milady");
    expect(submittedUrl.searchParams.get("plan")).toBe("pro");
    expect(submittedUrl.searchParams.get("terms")).toBe("yes");
    expect(tabs[0]?.visible).toBe(true);
  });
});
