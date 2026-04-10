// @vitest-environment jsdom

import type {
  LifeOpsConnectorSide,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseGoogleLifeOpsConnector } = vi.hoisted(() => ({
  mockClient: {
    getLifeOpsCalendarFeed: vi.fn(),
    getLifeOpsGmailTriage: vi.fn(),
  },
  mockUseGoogleLifeOpsConnector: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("span", props, children),
}));

vi.mock("../../../../api", () => ({
  client: mockClient,
}));

vi.mock("../../../../hooks", () => ({
  useGoogleLifeOpsConnector: (options?: { side?: LifeOpsConnectorSide }) =>
    mockUseGoogleLifeOpsConnector(options),
}));

import { GoogleSidebarWidget } from "./lifeops";

function buildStatus(
  side: LifeOpsConnectorSide,
  overrides: Partial<LifeOpsGoogleConnectorStatus> = {},
): LifeOpsGoogleConnectorStatus {
  return {
    provider: "google",
    side,
    mode: "cloud_managed",
    defaultMode: "cloud_managed",
    availableModes: ["cloud_managed", "local"],
    executionTarget: "cloud",
    sourceOfTruth: "cloud_connection",
    configured: true,
    connected: false,
    reason: "disconnected",
    preferredByAgent: false,
    cloudConnectionId: null,
    identity: null,
    grantedCapabilities: [],
    grantedScopes: [],
    expiresAt: null,
    hasRefreshToken: false,
    grant: null,
    ...overrides,
  };
}

function buildController(
  side: LifeOpsConnectorSide,
  overrides: Record<string, unknown> = {},
) {
  return {
    activeMode: "cloud_managed",
    actionPending: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    error: null,
    loading: false,
    modeOptions: ["cloud_managed", "local"],
    refresh: vi.fn(),
    selectMode: vi.fn(),
    selectedMode: "cloud_managed",
    side,
    status: buildStatus(side),
    ...overrides,
  };
}

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }
      return flattenText(child);
    })
    .join(" ");
}

describe("GoogleSidebarWidget", () => {
  beforeEach(() => {
    mockClient.getLifeOpsCalendarFeed.mockReset();
    mockClient.getLifeOpsGmailTriage.mockReset();
    mockUseGoogleLifeOpsConnector.mockReset();
  });

  it("does not render when neither owner nor agent is connected", async () => {
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        buildController(options?.side === "agent" ? "agent" : "owner"),
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    expect(renderer.toJSON()).toBeNull();
    expect(mockClient.getLifeOpsCalendarFeed).not.toHaveBeenCalled();
    expect(mockClient.getLifeOpsGmailTriage).not.toHaveBeenCalled();
    expect(mockUseGoogleLifeOpsConnector).toHaveBeenCalledWith({
      pollWhileDisconnected: false,
      side: "owner",
      pollIntervalMs: 15000,
    });
    expect(mockUseGoogleLifeOpsConnector).toHaveBeenCalledWith({
      pollWhileDisconnected: false,
      side: "agent",
      pollIntervalMs: 15000,
    });
  });

  it("shows only connected accounts and fetches widget data for the preferred side", async () => {
    const ownerConnector = buildController("owner", {
      status: buildStatus("owner", {
        connected: true,
        reason: "connected",
        preferredByAgent: true,
        cloudConnectionId: "managed-owner",
        identity: {
          name: "Founder Example",
          email: "founder@example.com",
        },
        grantedCapabilities: [
          "google.basic_identity",
          "google.calendar.read",
          "google.gmail.triage",
        ],
        expiresAt: "2026-04-05T00:00:00.000Z",
        hasRefreshToken: true,
      }),
    });
    const agentConnector = buildController("agent", {
      status: buildStatus("agent", {
        connected: false,
        identity: {
          name: "Milady Agent",
          email: "agent@example.com",
        },
      }),
    });
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? agentConnector : ownerConnector,
    );
    mockClient.getLifeOpsCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        {
          id: "event-1",
          externalId: "external-event-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Founder sync",
          description: "",
          location: "HQ",
          status: "confirmed",
          startAt: "2026-04-04T18:00:00.000Z",
          endAt: "2026-04-04T18:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-04T17:00:00.000Z",
          updatedAt: "2026-04-04T17:00:00.000Z",
        },
      ],
      source: "synced",
      timeMin: "2026-04-04T00:00:00.000Z",
      timeMax: "2026-04-05T00:00:00.000Z",
      syncedAt: "2026-04-04T17:00:00.000Z",
    });
    mockClient.getLifeOpsGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          externalId: "gmail-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          threadId: "thread-1",
          subject: "Project sync",
          from: "Founder Example <founder@example.com>",
          fromEmail: "founder@example.com",
          replyTo: "founder@example.com",
          to: ["founder@example.com"],
          cc: [],
          snippet: "Can we review the product plan today?",
          receivedAt: "2026-04-04T17:30:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 95,
          triageReason: "direct reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: null,
          metadata: {},
          syncedAt: "2026-04-04T17:32:00.000Z",
          updatedAt: "2026-04-04T17:32:00.000Z",
        },
      ],
      source: "synced",
      syncedAt: "2026-04-04T17:32:00.000Z",
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    const text = flattenText(renderer.root);
    expect(text).toContain("Google");
    expect(text).toContain("Owner");
    expect(text).toContain("Founder Example");
    expect(text).toContain("founder@example.com");
    expect(text).toContain("Founder sync");
    expect(text).toContain("Project sync");
    expect(text).toContain("Calendar (Owner)");
    expect(text).toContain("Inbox (Owner)");
    expect(text).not.toContain("Agent");
    expect(text).not.toContain("Milady Agent");
    expect(renderer.root.findAllByType("button")).toHaveLength(0);

    expect(mockClient.getLifeOpsCalendarFeed).toHaveBeenCalledWith({
      mode: "cloud_managed",
      side: "owner",
      timeZone: expect.any(String),
    });
    expect(mockClient.getLifeOpsGmailTriage).toHaveBeenCalledWith({
      mode: "cloud_managed",
      side: "owner",
      maxResults: 3,
    });
  });

  it("shows a reconnect message instead of empty calendar state when Google scopes are invalid", async () => {
    const ownerConnector = buildController("owner", {
      status: buildStatus("owner", {
        connected: true,
        reason: "connected",
        preferredByAgent: true,
        cloudConnectionId: "managed-owner",
        identity: {
          name: "Shaw",
          email: "shawmakesmagic@gmail.com",
        },
        grantedCapabilities: ["google.basic_identity", "google.calendar.read"],
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/calendar.readonly",
        ],
        expiresAt: "2026-04-05T00:00:00.000Z",
        hasRefreshToken: true,
      }),
    });
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? buildController("agent") : ownerConnector,
    );
    mockClient.getLifeOpsCalendarFeed.mockRejectedValue(
      new Error(
        "Google connector needs re-authentication: Request had insufficient authentication scopes.",
      ),
    );
    mockClient.getLifeOpsGmailTriage.mockResolvedValue({
      messages: [],
      source: "cache",
      syncedAt: "2026-04-04T17:32:00.000Z",
      summary: {
        unreadCount: 0,
        importantNewCount: 0,
        likelyReplyNeededCount: 0,
      },
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(GoogleSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    const text = flattenText(renderer.root);
    expect(text).toContain(
      "Reconnect Google to refresh calendar and Gmail permissions.",
    );
    expect(text).not.toContain("No upcoming events");
    expect(text).not.toContain("No priority mail");
  });
});
