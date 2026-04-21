import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import { manageMiladyBrowserWorkspaceAction } from "../../../plugins/plugin-milady-browser/src/action";
import {
  closeBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
} from "../src/services/browser-workspace";

const LIVE_TESTS_ENABLED =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";

try {
  const { config } = await import("dotenv");
  config({ path: path.resolve(import.meta.dirname, "..", "..", "..", ".env") });
  config({ path: path.resolve(import.meta.dirname, "..", "..", "..", "..", ".env") });
} catch {
  // dotenv is optional for live tests.
}

type LivePlanner = {
  complete: (prompt: string) => Promise<string>;
  name: string;
};

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch?.[1]?.trim() || trimmed;
}

async function detectLivePlanner(): Promise<LivePlanner | null> {
  if (process.env.GROQ_API_KEY?.trim()) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY.trim(),
      baseURL: "https://api.groq.com/openai/v1",
    });
    return {
      name: "groq",
      complete: async (prompt) => {
        const completion = await client.chat.completions.create({
          model: process.env.GROQ_SMALL_MODEL?.trim() || "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: "json_object" },
        });
        return completion.choices[0]?.message?.content ?? "";
      },
    };
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
    return {
      name: "openai",
      complete: async (prompt) => {
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_SMALL_MODEL?.trim() || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: "json_object" },
        });
        return completion.choices[0]?.message?.content ?? "";
      },
    };
  }

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
    return {
      name: "anthropic",
      complete: async (prompt) => {
        const message = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1200,
          system:
            "Return valid JSON only. No markdown, no code fences, no explanation.",
          messages: [{ role: "user", content: prompt }],
        });
        return message.content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join("");
      },
    };
  }

  return null;
}

const livePlanner = await detectLivePlanner();

type BrowserPlan = {
  steps?: Array<Record<string, unknown>>;
  subaction?: string;
};

type LocalSiteFixture = {
  formUrl: string;
  welcomeUrl: string;
  close: () => Promise<void>;
};

async function startLocalSiteFixture(): Promise<LocalSiteFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/welcome") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Welcome Fixture</title></head>
          <body>
            <h1>Welcome, ${url.searchParams.get("name") || "Anonymous"}</h1>
            <p>Browser live validation complete.</p>
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
	            <label>Agent name <input name="name" value="" /></label>
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
	            <button type="submit">Continue</button>
	          </form>
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
    welcomeUrl: `${baseUrl}/welcome?name=Milady`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

describeIf(LIVE_TESTS_ENABLED || !livePlanner)(
  "Browser workspace live planner validation",
  () => {
    let siteFixture: LocalSiteFixture;

    beforeAll(async () => {
      siteFixture = await startLocalSiteFixture();
    });

    afterAll(async () => {
      if (siteFixture) {
        await siteFixture.close();
      }
    });

    it(
      "uses a real LLM to plan a browser batch and executes it end to end",
      async () => {
        const tabs = await listBrowserWorkspaceTabs();
        await Promise.all(tabs.map((tab) => closeBrowserWorkspaceTab(tab.id)));

        const prompt = [
          "Return only JSON.",
          'Plan one browser batch for the Milady browser workspace using exactly this supported schema: {"subaction":"batch","steps":[...]}',
          `Target URL: ${siteFixture.formUrl}`,
          'Use exactly 6 steps in this order.',
          'Step 1 must be {"subaction":"open","url":"<target-url>","show":true}.',
          'Step 2 must fill the Agent name field using {"subaction":"find","findBy":"label","text":"Agent name","action":"fill","value":"Milady"}.',
          'Step 3 must choose the plan using {"subaction":"select","findBy":"label","text":"Plan","value":"pro"}.',
          'Step 4 must check terms using {"subaction":"check","findBy":"label","text":"Accept terms"}.',
          'Step 5 must click Continue using {"subaction":"find","findBy":"role","role":"button","name":"Continue","action":"click"}.',
          'Step 6 must read the heading using {"subaction":"get","selector":"h1","getMode":"text"}.',
          'Do not use read, goto, visible, option, label, by, or Playwright-style selector syntax.',
        ].join(" ");

        const rawPlan = await livePlanner.complete(prompt);
        const plan = JSON.parse(stripJsonFence(rawPlan)) as BrowserPlan;

        expect(plan.subaction).toBe("batch");
        expect(Array.isArray(plan.steps)).toBe(true);
        expect(plan.steps?.length).toBeGreaterThanOrEqual(6);

        const callback = vi.fn();
        const result = await manageMiladyBrowserWorkspaceAction.handler(
          {} as never,
          {
            content: {
              text: "Run the planned live browser batch.",
            },
          } as never,
          undefined,
          {
            parameters: {
              subaction: "batch",
              steps: plan.steps,
            },
          },
          callback,
        );

        expect(result).toMatchObject({
          success: true,
          text: expect.stringContaining(siteFixture.welcomeUrl),
        });

        const remainingTabs = await listBrowserWorkspaceTabs();
        expect(remainingTabs).toHaveLength(1);
        const submittedUrl = new URL(remainingTabs[0]?.url ?? "");
        expect(`${submittedUrl.origin}${submittedUrl.pathname}`).toBe(
          `${new URL(siteFixture.welcomeUrl).origin}${new URL(siteFixture.welcomeUrl).pathname}`,
        );
        expect(submittedUrl.searchParams.get("name")).toBe("Milady");
        expect(submittedUrl.searchParams.get("plan")).toBe("pro");
        expect(submittedUrl.searchParams.get("terms")).toBe("yes");
      },
      60_000,
    );
  },
);
