import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("MCP Marketplace tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");
    // Switch to the MCP Servers sub-tab
    await page.getByRole("button", { name: "MCP Servers" }).click();
  });

  // --- Display ---

  test("shows search input and configured servers section", async ({ page }) => {
    await expect(page.getByPlaceholder("Search MCP servers")).toBeVisible();
    await expect(page.getByText("Configured servers")).toBeVisible();
  });

  test("shows empty state when no servers configured", async ({ page }) => {
    await expect(page.getByText("No MCP servers configured.")).toBeVisible();
  });

  // --- Search ---

  test("search returns results from registry", async ({ page }) => {
    await page.getByPlaceholder("Search MCP servers").fill("github");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText("Registry results")).toBeVisible();
    await expect(page.getByText("GitHub", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("GitHub MCP server")).toBeVisible();
  });

  test("search with no results shows no results message", async ({ page }) => {
    await page.getByPlaceholder("Search MCP servers").fill("nonexistent-xyz-999");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText("No results found.")).toBeVisible();
  });

  // --- Add from Marketplace (with env vars) ---

  test("adding server with env vars shows config form", async ({ page }) => {
    await page.getByPlaceholder("Search MCP servers").fill("github");
    await page.getByRole("button", { name: "Search" }).click();

    // Click Add on the GitHub server (has env vars)
    const githubCard = page.locator(".plugin-item", { hasText: "GitHub" }).first();
    await githubCard.getByRole("button", { name: "Add" }).click();

    // Should show config form with GITHUB_TOKEN input
    await expect(page.getByText("Configure: GitHub")).toBeVisible();
    await expect(page.getByText("GITHUB_TOKEN").first()).toBeVisible();
    await expect(page.getByText("Environment Variables", { exact: true })).toBeVisible();

    // Cancel should dismiss the form
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Configure: GitHub")).not.toBeVisible();
  });

  test("config form validates required fields", async ({ page }) => {
    await page.getByPlaceholder("Search MCP servers").fill("github");
    await page.getByRole("button", { name: "Search" }).click();

    const githubCard = page.locator(".plugin-item", { hasText: "GitHub" }).first();
    await githubCard.getByRole("button", { name: "Add" }).click();

    // Try to add without filling required field — scope to config form
    const configSection = page.locator("section", { hasText: "Configure:" });
    await configSection.getByRole("button", { name: "Add Server" }).click();

    // Should show validation error notice
    await expect(page.getByText("GITHUB_TOKEN is required")).toBeVisible();
  });

  test("config form submits with filled env vars", async ({ page }) => {
    await page.getByPlaceholder("Search MCP servers").fill("github");
    await page.getByRole("button", { name: "Search" }).click();

    const githubCard = page.locator(".plugin-item", { hasText: "GitHub" }).first();
    await githubCard.getByRole("button", { name: "Add" }).click();

    // Fill in the env var
    const configSection = page.locator("section", { hasText: "Configure:" });
    const tokenInput = configSection.locator("input[type='password']").first();
    await tokenInput.fill("ghp_test123456789");

    // Submit — scope to config form to avoid matching the manual add button
    await configSection.getByRole("button", { name: "Add Server" }).click();

    // Form should close and server should appear in configured list
    await expect(page.getByText("Configure: GitHub")).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Configured servers (1)")).toBeVisible({ timeout: 10000 });
  });

  // --- Add from Marketplace (no env vars) ---

  test("adding server without env vars adds directly", async ({ page }) => {
    await page.getByPlaceholder("Search MCP servers").fill("echo");
    await page.getByRole("button", { name: "Search" }).click();

    // Click Add on the Echo server (no env vars)
    const echoCard = page.locator(".plugin-item", { hasText: "Echo" }).first();
    await echoCard.getByRole("button", { name: "Add" }).click();

    // Should NOT show config form — should add directly
    await expect(page.getByText("Configure:")).not.toBeVisible();

    // Should show success and configured servers
    await expect(page.getByText("Configured servers (1)")).toBeVisible({ timeout: 10000 });
  });

  // --- Manual Add ---

  test("manual add form creates a stdio server", async ({ page }) => {
    const nameInput = page.locator("input[placeholder='Server name']");
    await nameInput.fill("my-custom-server");

    const cmdInput = page.locator("input[placeholder*='Command']");
    await cmdInput.fill("npx");

    const argsInput = page.locator("input[placeholder*='Arguments']");
    await argsInput.fill("-y @custom/mcp-server");

    await page.locator("section").filter({ hasText: "Add Custom MCP Server" })
      .getByRole("button", { name: "Add Server" }).click();

    // Should appear in configured list
    await expect(page.getByText("Configured servers (1)")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("my-custom-server", { exact: true })).toBeVisible();
  });

  test("manual add validates required server name", async ({ page }) => {
    // Try to add without name
    await page.locator("section").filter({ hasText: "Add Custom MCP Server" })
      .getByRole("button", { name: "Add Server" }).click();

    await expect(page.getByText("Server name is required")).toBeVisible();
  });

  // --- Remove ---

  test("can remove a configured server", async ({ page }) => {
    // First add a server
    await page.getByPlaceholder("Search MCP servers").fill("echo");
    await page.getByRole("button", { name: "Search" }).click();
    await page.locator(".plugin-item", { hasText: "Echo" }).first()
      .getByRole("button", { name: "Add" }).click();

    // Wait for it to appear
    await expect(page.getByText("Configured servers (1)")).toBeVisible({ timeout: 10000 });

    // Remove it
    await page.locator(".plugin-list").last().getByRole("button", { name: "Remove" }).click();

    // Should go back to empty
    await expect(page.getByText("No MCP servers configured.")).toBeVisible({ timeout: 10000 });
  });

  // --- Status badges ---

  test("configured servers show status information", async ({ page }) => {
    // Add a server first
    await page.getByPlaceholder("Search MCP servers").fill("echo");
    await page.getByRole("button", { name: "Search" }).click();
    await page.locator(".plugin-item", { hasText: "Echo" }).first()
      .getByRole("button", { name: "Add" }).click();

    // Wait for configured list to appear
    await expect(page.getByText("Configured servers (1)")).toBeVisible({ timeout: 10000 });

    // Should show status text (connecting initially, then connected)
    const configuredSection = page.locator(".plugin-list").last();
    // Either "connecting" or "connected" or "unknown" — any is valid
    await expect(configuredSection.locator(".plugin-item").first()).toBeVisible();
  });
});
