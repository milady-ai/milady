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
});
