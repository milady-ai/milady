import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Share ingest", () => {
  test("ingests native share payload into chat draft", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("milaidy:share-target", {
        detail: {
          source: "e2e-share",
          title: "Design note",
          url: "https://example.com/design",
          files: [{ name: "notes.md", path: "/tmp/notes.md" }],
        },
      }));
    });

    const textarea = page.getByPlaceholder("Type a message...");
    await expect(textarea).toHaveValue(/Shared from e2e-share/);
    await expect(textarea).toHaveValue(/Design note/);
    await expect(page.getByText(/Share ingested/)).toBeVisible();
    await expect(page.getByText("notes.md")).toBeVisible();
  });

  test("ingests share with only text and no files", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("milaidy:share-target", {
        detail: {
          source: "e2e-text-only",
          text: "Check out this interesting paragraph about AI agents",
        },
      }));
    });

    const textarea = page.getByPlaceholder("Type a message...");
    await expect(textarea).toHaveValue(/Shared from e2e-text-only/);
    await expect(textarea).toHaveValue(/interesting paragraph/);
    await expect(page.getByText(/Share ingested/)).toBeVisible();
  });

  test("ingests share with only a URL", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("milaidy:share-target", {
        detail: {
          source: "e2e-url-only",
          url: "https://example.com/article",
        },
      }));
    });

    const textarea = page.getByPlaceholder("Type a message...");
    await expect(textarea).toHaveValue(/Shared from e2e-url-only/);
    await expect(page.getByText(/Share ingested/)).toBeVisible();
  });

  test("ingests share with multiple files", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("milaidy:share-target", {
        detail: {
          source: "e2e-multi-file",
          title: "Project assets",
          files: [
            { name: "readme.md", path: "/tmp/readme.md" },
            { name: "config.json", path: "/tmp/config.json" },
            { name: "logo.png", path: "/tmp/logo.png" },
          ],
        },
      }));
    });

    await expect(page.getByText(/Share ingested/)).toBeVisible();
    await expect(page.getByText("readme.md")).toBeVisible();
    await expect(page.getByText("config.json")).toBeVisible();
    await expect(page.getByText("logo.png")).toBeVisible();
  });

  test("share ingest API stores and returns items", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    // POST a share via the API mock
    const postResp = await page.evaluate(async () => {
      const resp = await fetch("/api/ingest/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "api-test",
          title: "API share",
          url: "https://example.com",
        }),
      });
      return resp.json();
    });

    expect(postResp.ok).toBe(true);
    expect(postResp.item.source).toBe("api-test");

    // GET the inbox
    const getResp = await page.evaluate(async () => {
      const resp = await fetch("/api/ingest/share");
      return resp.json();
    });

    expect(getResp.count).toBeGreaterThanOrEqual(1);

    // GET with consume=1 drains the inbox
    const consumeResp = await page.evaluate(async () => {
      const resp = await fetch("/api/ingest/share?consume=1");
      return resp.json();
    });

    expect(consumeResp.count).toBeGreaterThanOrEqual(1);

    // After consuming, inbox should be empty
    const emptyResp = await page.evaluate(async () => {
      const resp = await fetch("/api/ingest/share");
      return resp.json();
    });

    expect(emptyResp.count).toBe(0);
  });
});
