import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Workbench page", () => {
  test("renders summary cards and tasks", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/workbench");

    await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
    await expect(page.getByText("Open Goals")).toBeVisible();
    await expect(page.getByText("Open Todos")).toBeVisible();
    await expect(page.getByText("Ship native integrations")).toBeVisible();
    await expect(page.getByText("Add command palette keyboard flow")).toBeVisible();
  });

  test("can mark a todo complete", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/workbench");

    const checkbox = page.locator("div:has-text('Add command palette keyboard flow') input[type='checkbox']").first();
    await checkbox.check();

    await expect(checkbox).toBeChecked();
  });

  test("supports goal create/edit and todo quick-add flows", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/workbench");

    // Create goal
    await page.getByPlaceholder("Goal name").fill("Stabilize share ingestion");
    await page.getByPlaceholder("Goal description").fill("Handle deep links and file share payloads.");
    await page.getByPlaceholder("Tags (comma separated)").fill("share, native");
    await page.getByRole("button", { name: "Add Goal" }).click();
    await expect(page.getByText("Stabilize share ingestion")).toBeVisible();

    // Edit goal
    const goalsPanel = page.locator("section", { hasText: /Goals \(/ }).first();
    const goalRow = goalsPanel.locator("div", { hasText: "Stabilize share ingestion" }).first();
    await goalRow.getByRole("button", { name: "edit" }).first().click();
    await page.getByPlaceholder("Goal description").fill("Desktop + mobile parity for share targets.");
    await page.getByRole("button", { name: "Save Goal" }).click();
    await expect(page.getByText("Desktop + mobile parity for share targets.")).toBeVisible();

    // Quick todo
    await page.getByPlaceholder("Todo name").fill("Verify share payload in chat");
    await page.getByPlaceholder("Todo description").fill("Confirm prompt enrichment and file chips.");
    await page.getByRole("button", { name: "Add Todo" }).click();
    await expect(page.getByText("Verify share payload in chat")).toBeVisible();
  });
});
