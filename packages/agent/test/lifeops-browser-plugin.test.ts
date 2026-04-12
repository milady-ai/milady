import { afterEach, describe, expect, it, vi } from "vitest";
import { manageLifeOpsBrowserAction } from "../../../plugins/plugin-lifeops-browser/src/action";
import { lifeOpsBrowserPlugin } from "../../../plugins/plugin-lifeops-browser/src/index";
import { lifeOpsBrowserProvider } from "../../../plugins/plugin-lifeops-browser/src/provider";
import { LifeOpsService } from "../src/lifeops/service";

vi.mock("@miladyai/agent/security/access", () => ({
  hasAdminAccess: vi.fn().mockResolvedValue(true),
}));

const runtime = { agentId: "agent-1" } as never;
const adminMessage = {
  entityId: "owner-1",
  content: { text: "what is in my browser" },
} as never;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("@miladyai/plugin-lifeops-browser", () => {
  it("exports a valid plugin shape", () => {
    expect(lifeOpsBrowserPlugin.name).toBe("@miladyai/plugin-lifeops-browser");
    expect(lifeOpsBrowserPlugin.actions).toContain(manageLifeOpsBrowserAction);
    expect(lifeOpsBrowserPlugin.providers).toContain(lifeOpsBrowserProvider);
    expect(lifeOpsBrowserPlugin.services).toHaveLength(1);
  });

  it("renders personal browser context through the provider", async () => {
    vi.spyOn(LifeOpsService.prototype, "getBrowserSettings").mockResolvedValue({
      enabled: true,
      trackingMode: "active_tabs",
      allowBrowserControl: true,
      requireConfirmationForAccountAffecting: true,
      incognitoEnabled: false,
      siteAccessMode: "all_sites",
      grantedOrigins: [],
      blockedOrigins: [],
      maxRememberedTabs: 10,
      pauseUntil: null,
    });
    vi.spyOn(
      LifeOpsService.prototype,
      "listBrowserCompanions",
    ).mockResolvedValue([
      {
        companionId: "companion-1",
        browser: "chrome",
        profileId: "default",
        profileLabel: "Default",
        connectionState: "connected",
        extensionVersion: "1.0.0",
        appVersion: null,
        lastSeenAt: "2026-04-11T01:00:00.000Z",
        lastError: null,
        permissions: {
          tabs: true,
          scripting: true,
          hostAccess: "all_sites",
          incognitoAccess: false,
          nativeMessaging: false,
        },
      },
    ]);
    vi.spyOn(LifeOpsService.prototype, "listBrowserTabs").mockResolvedValue([
      {
        browser: "chrome",
        companionId: "companion-1",
        profileId: "default",
        windowId: "window-1",
        tabId: "tab-1",
        url: "https://example.com",
        title: "Example",
        activeInWindow: true,
        focusedWindow: true,
        focusedActive: true,
        incognito: false,
        lastSeenAt: "2026-04-11T01:00:00.000Z",
        faviconUrl: null,
      },
    ]);
    vi.spyOn(
      LifeOpsService.prototype,
      "getCurrentBrowserPage",
    ).mockResolvedValue({
      tabKey: "chrome:default:window-1:tab-1",
      url: "https://example.com",
      title: "Example",
      selectionText: null,
      mainText: "Visible content",
      headings: ["Example"],
      links: [{ text: "Home", href: "https://example.com" }],
      forms: [],
      capturedAt: "2026-04-11T01:00:00.000Z",
    });
    vi.spyOn(LifeOpsService.prototype, "listBrowserSessions").mockResolvedValue(
      [
        {
          id: "session-1",
          title: "Read page",
          status: "queued",
          browser: "chrome",
          companionId: "companion-1",
          profileId: "default",
          windowId: "window-1",
          tabId: "tab-1",
          actions: [],
          createdAt: "2026-04-11T01:00:00.000Z",
          updatedAt: "2026-04-11T01:00:00.000Z",
          notes: null,
        },
      ],
    );

    const result = await lifeOpsBrowserProvider.get(
      runtime,
      adminMessage,
      {} as never,
    );

    expect(result.text).toContain("## LifeOps Browser");
    expect(result.text).toContain(
      "This is the user's personal browser companion",
    );
    expect(result.text).toContain("Current page: Example https://example.com");
    expect(result.values.lifeOpsBrowserEnabled).toBe(true);
    expect(result.values.lifeOpsBrowserCurrentUrl).toBe("https://example.com");
  });

  it("creates a browser session for a navigate command", async () => {
    const createBrowserSession = vi
      .spyOn(LifeOpsService.prototype, "createBrowserSession")
      .mockResolvedValue({
        id: "session-1",
        title: "Navigate current tab",
        status: "queued",
        browser: "chrome",
        companionId: "companion-1",
        profileId: "default",
        windowId: "window-1",
        tabId: "tab-1",
        actions: [
          {
            kind: "navigate",
            label: "Navigate current tab",
            browser: "chrome",
            windowId: "window-1",
            tabId: "tab-1",
            url: "https://example.com",
            selector: null,
            text: null,
            metadata: {},
            accountAffecting: false,
            requiresConfirmation: false,
          },
        ],
        createdAt: "2026-04-11T01:00:00.000Z",
        updatedAt: "2026-04-11T01:00:00.000Z",
        notes: null,
      });

    const result = await manageLifeOpsBrowserAction.handler(
      runtime,
      {
        entityId: "owner-1",
        content: { text: "Navigate to https://example.com" },
      } as never,
      undefined,
      {
        parameters: {
          command: "navigate",
          browser: "chrome",
          companionId: "companion-1",
          profileId: "default",
          windowId: "window-1",
          tabId: "tab-1",
          url: "https://example.com",
        },
      },
    );

    expect(createBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        browser: "chrome",
        companionId: "companion-1",
        profileId: "default",
        windowId: "window-1",
        tabId: "tab-1",
        actions: [
          expect.objectContaining({
            kind: "navigate",
            url: "https://example.com",
          }),
        ],
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining(
        'Created LifeOps Browser session "Navigate current tab"',
      ),
    });
  });
});
