import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderPrivateAccess,
  mockResolveCanonicalOwnerIdForMessage,
  mockGetOverview,
  mockGetGoogleConnectorStatus,
  mockGetNextCalendarEventContext,
  mockGetGmailTriage,
} = vi.hoisted(() => ({
  mockCheckSenderPrivateAccess: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockGetOverview: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockGetNextCalendarEventContext: vi.fn(),
  mockGetGmailTriage: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderPrivateAccess: mockCheckSenderPrivateAccess,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getOverview = mockGetOverview;
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
    getNextCalendarEventContext = mockGetNextCalendarEventContext;
    getGmailTriage = mockGetGmailTriage;
  },
}));

import { lifeOpsProvider } from "./lifeops";

function baseOverview() {
  return {
    owner: {
      occurrences: [{ title: "Pay rent", state: "visible" }],
      goals: [{ title: "Keep finances clean" }],
      reminders: [],
      summary: {
        activeOccurrenceCount: 1,
        overdueOccurrenceCount: 0,
        snoozedOccurrenceCount: 0,
        activeReminderCount: 0,
        activeGoalCount: 1,
      },
    },
    agentOps: {
      occurrences: [{ title: "Review plugin health", state: "visible" }],
      goals: [],
      reminders: [],
      summary: {
        activeOccurrenceCount: 1,
        overdueOccurrenceCount: 0,
        snoozedOccurrenceCount: 0,
        activeReminderCount: 0,
        activeGoalCount: 0,
      },
    },
  };
}

describe("lifeOpsProvider", () => {
  beforeEach(() => {
    mockCheckSenderPrivateAccess.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockGetOverview.mockReset();
    mockGetGoogleConnectorStatus.mockReset();
    mockGetNextCalendarEventContext.mockReset();
    mockGetGmailTriage.mockReset();
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: true,
      accessRole: "OWNER",
      accessSource: "owner",
    });
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue(null);
    mockGetOverview.mockResolvedValue(baseOverview());
    // Default: Google not connected
    mockGetGoogleConnectorStatus.mockRejectedValue(new Error("not configured"));
  });

  it("returns empty output for non-admin callers", async () => {
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    });

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: {
          source: "client_chat",
          text: "show my todos",
        },
      } as never,
      {} as never,
    );

    expect(result).toEqual({
      text: "",
      values: {},
      data: {},
    });
  });

  it("summarizes owner and agent lifeops for admin chat", async () => {
    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "what's on deck?",
        },
      } as never,
      {} as never,
    );

    expect(result.text).toContain("Use LIFE");
    expect(result.text).toContain("Owner open occurrences: 1");
    expect(result.text).toContain("Pay rent");
    expect(result.text).toContain("Review plugin health");
    expect(result.values).toMatchObject({
      ownerOpenOccurrences: 1,
      ownerActiveGoals: 1,
      agentOpenOccurrences: 1,
    });
  });

  it("summarizes lifeops for owner on discord", async () => {
    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "discord",
          text: "do i have any flights this week",
        },
      } as never,
      {} as never,
    );

    expect(result.text).toContain("CALENDAR_ACTION");
    expect(result.text).toContain("Owner open occurrences: 1");
    expect(result.text).toContain("Pay rent");
  });

  it("hides lifeops from connector-admin callers without an explicit grant", async () => {
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "helper-1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    });

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "helper-1",
        content: {
          source: "discord",
          text: "what's on Shaw's calendar",
        },
      } as never,
      {} as never,
    );

    expect(result).toEqual({
      text: "",
      values: {},
      data: {},
    });
  });

  it("includes next calendar event when Google is connected", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      provider: "google",
      connected: true,
      grantedCapabilities: ["google.calendar.read"],
    });
    const eventStart = new Date(Date.now() + 45 * 60_000);
    mockGetNextCalendarEventContext.mockResolvedValue({
      event: {
        title: "Team sync",
        startAt: eventStart.toISOString(),
        endAt: new Date(eventStart.getTime() + 3_600_000).toISOString(),
        isAllDay: false,
      },
      startsAt: eventStart.toISOString(),
      startsInMinutes: 45,
      attendeeCount: 3,
      attendeeNames: ["Alice", "Bob", "Carol"],
      location: null,
      conferenceLink: null,
      preparationChecklist: [],
      linkedMailState: "unavailable",
      linkedMailError: null,
      linkedMail: [],
    });

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "hey" },
      } as never,
      {} as never,
    );

    expect(result.text).toContain("Next event: Team sync");
    expect(result.text).toContain("Alice");
    expect(result.data).toHaveProperty("nextEventContext");
  });

  it("includes email triage summary when Gmail is connected", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      provider: "google",
      connected: true,
      grantedCapabilities: ["google.gmail.triage"],
    });
    mockGetGmailTriage.mockResolvedValue({
      messages: [],
      source: "cache",
      syncedAt: null,
      summary: {
        unreadCount: 5,
        importantNewCount: 2,
        likelyReplyNeededCount: 1,
      },
    });

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "hey" },
      } as never,
      {} as never,
    );

    expect(result.text).toContain("5 unread");
    expect(result.text).toContain("2 important");
    expect(result.data).toHaveProperty("gmailSummary");
  });

  it("gracefully skips calendar/email when Google fetch fails", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      provider: "google",
      connected: true,
      grantedCapabilities: ["google.calendar.read", "google.gmail.triage"],
    });
    mockGetNextCalendarEventContext.mockRejectedValue(new Error("token expired"));
    mockGetGmailTriage.mockRejectedValue(new Error("token expired"));

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "hey" },
      } as never,
      {} as never,
    );

    // Should still contain the overview data, just no calendar/email
    expect(result.text).toContain("Owner open occurrences: 1");
    expect(result.data).toMatchObject({
      nextEventContext: null,
      gmailSummary: null,
    });
  });
});
