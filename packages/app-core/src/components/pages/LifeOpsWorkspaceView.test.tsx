// @vitest-environment jsdom

import type {
  LifeOpsConnectorSide,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flush, text } from "../../../../../test/helpers/react-test";

const { mockClient, mockUseApp, mockUseGoogleLifeOpsConnector } = vi.hoisted(
  () => ({
    mockClient: {
      createLifeOpsCalendarEvent: vi.fn(),
      createLifeOpsGmailReplyDraft: vi.fn(),
      getLifeOpsCalendarFeed: vi.fn(),
      getLifeOpsGmailTriage: vi.fn(),
      getLifeOpsNextCalendarEventContext: vi.fn(),
      sendLifeOpsGmailReply: vi.fn(),
    },
    mockUseApp: vi.fn(),
    mockUseGoogleLifeOpsConnector: vi.fn(),
  }),
);

let ownerConnectorMock: ReturnType<typeof mockUseGoogleLifeOpsConnector>;
let agentConnectorMock: ReturnType<typeof mockUseGoogleLifeOpsConnector>;

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../hooks", () => ({
  useGoogleLifeOpsConnector: (options?: { side?: LifeOpsConnectorSide }) =>
    mockUseGoogleLifeOpsConnector(options),
}));

vi.mock("../../state", () => ({
  useApp: () =>
    mockUseApp({
      setActionNotice: vi.fn(),
      setState: vi.fn(),
      t: (key: string, vars?: Record<string, unknown>) =>
        typeof vars?.defaultValue === "string" ? vars.defaultValue : key,
    }),
}));

vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Badge: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("span", props, children),
    Button: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    PagePanel: Object.assign(passthrough, {
      Empty: ({
        title,
        description,
        ...props
      }: React.PropsWithChildren<
        { title?: string; description?: string } & Record<string, unknown>
      >) =>
        React.createElement(
          "div",
          props,
          React.createElement("div", null, title),
          description ? React.createElement("div", null, description) : null,
        ),
      Header: ({
        heading,
        description,
        eyebrow,
        actions,
      }: React.PropsWithChildren<{
        heading?: string;
        description?: string;
        eyebrow?: string;
        actions?: React.ReactNode;
      }>) =>
        React.createElement(
          "div",
          null,
          eyebrow ? React.createElement("div", null, eyebrow) : null,
          heading ? React.createElement("div", null, heading) : null,
          description ? React.createElement("div", null, description) : null,
          actions ?? null,
        ),
      Loading: ({ heading }: { heading?: string }) =>
        React.createElement("div", null, heading ?? "Loading"),
      Notice: ({
        children,
      }: React.PropsWithChildren<
        { tone?: string } & Record<string, unknown>
      >) => React.createElement("div", null, children),
    }),
    SegmentedControl: ({
      items,
      value,
      onValueChange,
      ...props
    }: {
      items: Array<{ value: string; label: string }>;
      value: string;
      onValueChange: (value: string) => void;
    } & Record<string, unknown>) =>
      React.createElement(
        "div",
        props,
        items.map((item) =>
          React.createElement(
            "button",
            {
              key: item.value,
              type: "button",
              onClick: () => onValueChange(item.value),
              "aria-pressed": value === item.value,
            },
            item.label,
          ),
        ),
      ),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
  };
});

import { LifeOpsWorkspaceView } from "./LifeOpsWorkspaceView";

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
    connected: true,
    reason: "connected",
    preferredByAgent: side === "owner",
    cloudConnectionId: "cloud-1",
    identity: {
      name: side === "owner" ? "Owner Example" : "Agent Example",
      email: `${side}@example.com`,
    },
    grantedCapabilities: [
      "google.basic_identity",
      "google.calendar.read",
      "google.calendar.write",
      "google.gmail.triage",
      "google.gmail.send",
    ],
    grantedScopes: [],
    expiresAt: null,
    hasRefreshToken: true,
    grant: null,
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

function findButton(
  root: TestRenderer.ReactTestInstance,
  value: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && text(node).includes(value),
  );
  if (!matches[0]) {
    throw new Error(`Button containing "${value}" not found`);
  }
  return matches[0];
}

function findTextarea(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) =>
      node.type === "textarea" && node.props.placeholder === placeholder,
  );
  if (!matches[0]) {
    throw new Error(`Textarea "${placeholder}" not found`);
  }
  return matches[0];
}

describe("LifeOpsWorkspaceView", () => {
  beforeEach(() => {
    mockClient.createLifeOpsCalendarEvent.mockReset();
    mockClient.createLifeOpsGmailReplyDraft.mockReset();
    mockClient.getLifeOpsCalendarFeed.mockReset();
    mockClient.getLifeOpsGmailTriage.mockReset();
    mockClient.getLifeOpsNextCalendarEventContext.mockReset();
    mockClient.sendLifeOpsGmailReply.mockReset();
    mockUseApp.mockReset();
    mockUseGoogleLifeOpsConnector.mockReset();
    mockUseApp.mockImplementation(() => ({
      setActionNotice: vi.fn(),
      setState: vi.fn(),
      t: (key: string, vars?: Record<string, unknown>) =>
        typeof vars?.defaultValue === "string" ? vars.defaultValue : key,
    }));
    ownerConnectorMock = {
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
      side: "owner",
      status: buildStatus("owner"),
    };
    agentConnectorMock = {
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
      side: "agent",
      status: buildStatus("agent", { connected: false }),
    };
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) => {
        return options?.side === "agent"
          ? agentConnectorMock
          : ownerConnectorMock;
      },
    );
  });

  it("renders agenda and week calendar views and creates calendar events", async () => {
    mockClient.getLifeOpsCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      source: "synced",
      syncedAt: "2026-04-06T09:00:00.000Z",
      timeMin: "2026-04-06T00:00:00.000Z",
      timeMax: "2026-04-07T00:00:00.000Z",
      events: [
        {
          id: "event-1",
          externalId: "external-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Morning standup",
          description: "Discuss priorities",
          location: "Zoom",
          status: "confirmed",
          startAt: "2026-04-06T16:00:00.000Z",
          endAt: "2026-04-06T16:30:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: "https://meet.example.com/standup",
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-06T09:00:00.000Z",
          updatedAt: "2026-04-06T09:00:00.000Z",
        },
        {
          id: "event-2",
          externalId: "external-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          calendarId: "primary",
          title: "Planning review",
          description: "",
          location: "Conference room",
          status: "confirmed",
          startAt: "2026-04-07T18:00:00.000Z",
          endAt: "2026-04-07T19:00:00.000Z",
          isAllDay: false,
          timezone: "UTC",
          htmlLink: null,
          conferenceLink: null,
          organizer: null,
          attendees: [],
          metadata: {},
          syncedAt: "2026-04-06T09:00:00.000Z",
          updatedAt: "2026-04-06T09:00:00.000Z",
        },
      ],
    });
    mockClient.getLifeOpsGmailTriage.mockResolvedValue({
      source: "synced",
      syncedAt: "2026-04-06T09:00:00.000Z",
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
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
          receivedAt: "2026-04-06T08:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 95,
          triageReason: "direct reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: null,
          metadata: {},
          syncedAt: "2026-04-06T09:00:00.000Z",
          updatedAt: "2026-04-06T09:00:00.000Z",
        },
      ],
    });
    mockClient.getLifeOpsNextCalendarEventContext.mockResolvedValue({
      event: null,
      startsAt: "2026-04-06T16:00:00.000Z",
      startsInMinutes: 120,
      attendeeCount: 2,
      attendeeNames: ["Founder Example", "Agent Example"],
      location: "Zoom",
      conferenceLink: "https://meet.example.com/standup",
      preparationChecklist: ["Review agenda", "Open notes"],
      linkedMailState: "synced",
      linkedMailError: null,
      linkedMail: [
        {
          id: "linked-1",
          subject: "Project sync",
          from: "Founder Example <founder@example.com>",
          receivedAt: "2026-04-06T08:00:00.000Z",
          snippet: "Can we review the product plan today?",
          htmlLink: null,
        },
      ],
    });
    mockClient.createLifeOpsCalendarEvent.mockResolvedValue({
      event: {
        id: "event-created",
        externalId: "external-created",
        agentId: "agent-1",
        provider: "google",
        side: "owner",
        calendarId: "primary",
        title: "Team retro",
        description: "Retro notes",
        location: "Room 2",
        status: "confirmed",
        startAt: "2026-04-06T17:00:00.000Z",
        endAt: "2026-04-06T17:30:00.000Z",
        isAllDay: false,
        timezone: "UTC",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: [],
        metadata: {},
        syncedAt: "2026-04-06T09:30:00.000Z",
        updatedAt: "2026-04-06T09:30:00.000Z",
      },
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsWorkspaceView));
      await flush();
    });

    const rootText = flattenText(renderer.root);
    expect(rootText).toContain("Calendar and Inbox Workspace");
    expect(rootText).toContain("Owner");
    expect(rootText).toContain("Morning standup");
    expect(rootText).toContain("Review agenda");
    expect(rootText).toContain("Project sync");

    await act(async () => {
      findButton(renderer.root, "Week").props.onClick();
      await flush();
    });
    expect(flattenText(renderer.root)).toContain("Planning review");

    await act(async () => {
      renderer.root
        .findAll(
          (node) => node.props["data-testid"] === "lifeops-create-event-title",
        )[0]
        ?.props.onChange({ target: { value: "Team retro" } });
      renderer.root
        .findAll(
          (node) => node.props["data-testid"] === "lifeops-create-event-date",
        )[0]
        ?.props.onChange({ target: { value: "2026-04-06" } });
      renderer.root
        .findAll(
          (node) => node.props["data-testid"] === "lifeops-create-event-time",
        )[0]
        ?.props.onChange({ target: { value: "10:00" } });
      renderer.root
        .findAll(
          (node) =>
            node.props["data-testid"] === "lifeops-create-event-duration",
        )[0]
        ?.props.onChange({ target: { value: "30" } });
      renderer.root
        .findAll(
          (node) =>
            node.props["data-testid"] === "lifeops-create-event-location",
        )[0]
        ?.props.onChange({ target: { value: "Room 2" } });
      renderer.root
        .findAll(
          (node) =>
            node.props["data-testid"] === "lifeops-create-event-description",
        )[0]
        ?.props.onChange({ target: { value: "Retro notes" } });
      await flush();
    });

    await act(async () => {
      findButton(renderer.root, "Create event").props.onClick();
      await flush();
    });

    const expectedStartAt = new Date("2026-04-06T10:00").toISOString();
    expect(mockClient.createLifeOpsCalendarEvent).toHaveBeenCalledWith({
      side: "owner",
      mode: "cloud_managed",
      title: "Team retro",
      description: "Retro notes",
      location: "Room 2",
      startAt: expectedStartAt,
      durationMinutes: 30,
    });
  });

  it("drafts and sends a reply for the selected email thread", async () => {
    mockClient.getLifeOpsCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      source: "synced",
      syncedAt: "2026-04-06T09:00:00.000Z",
      timeMin: "2026-04-06T00:00:00.000Z",
      timeMax: "2026-04-07T00:00:00.000Z",
      events: [],
    });
    mockClient.getLifeOpsGmailTriage.mockResolvedValue({
      source: "synced",
      syncedAt: "2026-04-06T09:00:00.000Z",
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
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
          receivedAt: "2026-04-06T08:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 95,
          triageReason: "direct reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: null,
          metadata: {},
          syncedAt: "2026-04-06T09:00:00.000Z",
          updatedAt: "2026-04-06T09:00:00.000Z",
        },
      ],
    });
    mockClient.getLifeOpsNextCalendarEventContext.mockResolvedValue({
      event: null,
      startsAt: null,
      startsInMinutes: null,
      attendeeCount: 0,
      attendeeNames: [],
      location: null,
      conferenceLink: null,
      preparationChecklist: [],
      linkedMailState: "unavailable",
      linkedMailError: null,
      linkedMail: [],
    });
    mockClient.createLifeOpsGmailReplyDraft.mockResolvedValue({
      draft: {
        messageId: "message-1",
        threadId: "thread-1",
        subject: "Re: Project sync",
        to: ["founder@example.com"],
        cc: [],
        bodyText: "Thanks, I can review it today.",
        previewLines: ["Thanks, I can review it today."],
        sendAllowed: true,
        requiresConfirmation: true,
      },
    });
    mockClient.sendLifeOpsGmailReply.mockResolvedValue({ ok: true });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsWorkspaceView));
      await flush();
    });

    await act(async () => {
      findButton(renderer.root, "Email").props.onClick();
      await flush();
    });

    expect(flattenText(renderer.root)).toContain("Project sync");

    await act(async () => {
      findButton(renderer.root, "Generate draft").props.onClick();
      await flush();
    });

    expect(mockClient.createLifeOpsGmailReplyDraft).toHaveBeenCalledWith({
      side: "owner",
      mode: "cloud_managed",
      messageId: "message-1",
      tone: "neutral",
      intent: "Draft a concise follow-up that moves the thread forward.",
      includeQuotedOriginal: true,
    });
    expect(flattenText(renderer.root)).toContain(
      "Thanks, I can review it today.",
    );

    await act(async () => {
      findButton(renderer.root, "Send reply").props.onClick();
      await flush();
    });

    expect(mockClient.sendLifeOpsGmailReply).toHaveBeenCalledWith({
      side: "owner",
      mode: "cloud_managed",
      messageId: "message-1",
      bodyText: "Thanks, I can review it today.",
      confirmSend: true,
      subject: "Re: Project sync",
      to: ["founder@example.com"],
      cc: [],
    });
  });
});
