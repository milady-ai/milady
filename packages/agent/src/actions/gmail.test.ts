import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderPrivateAccess,
  mockResolveCanonicalOwnerIdForMessage,
  mockGetGoogleConnectorStatus,
  mockGetGmailTriage,
  mockGetGmailNeedsResponse,
  mockGetGmailSearch,
  mockReadGmailMessage,
  mockCreateGmailReplyDraft,
  mockCreateGmailBatchReplyDrafts,
  mockSendGmailReply,
  mockSendGmailReplies,
  mockUseModel,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockCheckSenderPrivateAccess: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockGetGmailTriage: vi.fn(),
  mockGetGmailNeedsResponse: vi.fn(),
  mockGetGmailSearch: vi.fn(),
  mockReadGmailMessage: vi.fn(),
  mockCreateGmailReplyDraft: vi.fn(),
  mockCreateGmailBatchReplyDrafts: vi.fn(),
  mockSendGmailReply: vi.fn(),
  mockSendGmailReplies: vi.fn(),
  mockUseModel: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderPrivateAccess: mockCheckSenderPrivateAccess,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getGoogleConnectorStatus = mockGetGoogleConnectorStatus;
    getGmailTriage = mockGetGmailTriage;
    getGmailNeedsResponse = mockGetGmailNeedsResponse;
    getGmailSearch = mockGetGmailSearch;
    readGmailMessage = mockReadGmailMessage;
    createGmailReplyDraft = mockCreateGmailReplyDraft;
    createGmailBatchReplyDrafts = mockCreateGmailBatchReplyDrafts;
    sendGmailReply = mockSendGmailReply;
    sendGmailReplies = mockSendGmailReplies;
  },
  LifeOpsServiceError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { gmailAction } from "./gmail";

const runtime = {
  agentId: "agent-1",
  useModel: mockUseModel,
  logger: {
    warn: mockLoggerWarn,
  },
} as never;

function msg(text: string, source = "client_chat") {
  return {
    entityId: "owner-1",
    content: { source, text },
  } as never;
}

function invoke(intent: string, extra: Record<string, unknown> = {}) {
  const { subaction, query, queries, messageId, bodyText, details, state } =
    extra;
  return gmailAction.handler?.(
    runtime,
    msg(intent),
    (state ?? {}) as never,
    {
      parameters: {
        subaction,
        intent,
        query,
        queries,
        messageId,
        bodyText,
        details,
      },
    } as never,
  );
}

describe("gmailAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseModel.mockResolvedValue("<response></response>");
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
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-1");
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: [
        "google.basic_identity",
        "google.gmail.triage",
        "google.gmail.send",
      ],
    });
  });

  it("returns inbox triage", async () => {
    mockGetGmailTriage.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          externalId: "ext-1",
          threadId: "thread-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Investor follow-up",
          from: "Jane Doe",
          fromEmail: "jane@example.com",
          replyTo: "jane@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Checking in on next week",
          receivedAt: "2026-04-09T16:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 90,
          triageReason: "reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-1",
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        unreadCount: 1,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });

    const result = await invoke("what's in my inbox", { subaction: "triage" });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Investor follow-up");
    expect(result?.text).toContain("reply needed");
  });

  it("repairs a bad requested subaction with an LLM gmail plan", async () => {
    mockUseModel.mockResolvedValue(
      '{"subaction":"search","queries":["from:suran"]}',
    );
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const result = await invoke("did suran email me", { subaction: "triage" });

    expect(mockUseModel).toHaveBeenCalled();
    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "from:suran" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("uses message text when intent param is omitted", async () => {
    mockGetGmailNeedsResponse.mockResolvedValue({
      messages: [],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 0,
        unreadCount: 0,
        importantCount: 0,
      },
    });

    const result = await gmailAction.handler?.(
      runtime,
      msg("what emails need a reply"),
      {} as never,
      { parameters: {} } as never,
    );

    expect(mockGetGmailNeedsResponse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("allows owner access from discord", async () => {
    const valid = await gmailAction.validate?.(
      runtime,
      msg("what emails need a reply", "discord"),
      {} as never,
    );
    expect(valid).toBe(true);
  });

  it("rejects connector-admin access without an explicit grant", async () => {
    mockCheckSenderPrivateAccess.mockResolvedValue({
      entityId: "mod-1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    });

    const valid = await gmailAction.validate?.(
      runtime,
      {
        entityId: "mod-1",
        content: { source: "discord", text: "what emails need a reply" },
      } as never,
      {} as never,
    );

    expect(valid).toBe(false);
  });

  it("returns needs-response results", async () => {
    mockGetGmailNeedsResponse.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          externalId: "ext-1",
          threadId: "thread-1",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Schedule meeting",
          from: "Alex",
          fromEmail: "alex@example.com",
          replyTo: "alex@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Does next Thursday work?",
          receivedAt: "2026-04-09T16:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 88,
          triageReason: "reply needed",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-1",
          metadata: {},
          syncedAt: "2026-04-09T16:00:00.000Z",
          updatedAt: "2026-04-09T16:00:00.000Z",
        },
      ],
      source: "synced",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 1,
        importantCount: 1,
      },
    });

    const result = await invoke("what emails need a reply", {
      subaction: "needs_response",
    });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Schedule meeting");
  });

  it("searches gmail", async () => {
    mockGetGmailSearch.mockResolvedValue({
      query: "oneblade",
      messages: [
        {
          id: "msg-2",
          externalId: "ext-2",
          threadId: "thread-2",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "OneBlade receipt",
          from: "Amazon",
          fromEmail: "orders@amazon.com",
          replyTo: "orders@amazon.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Your Philips OneBlade order shipped",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: false,
          isImportant: false,
          likelyReplyNeeded: false,
          triageScore: 20,
          triageReason: "search hit",
          labels: ["INBOX"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-2",
          metadata: {},
          syncedAt: "2026-04-08T16:00:00.000Z",
          updatedAt: "2026-04-08T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 0,
        importantCount: 0,
        replyNeededCount: 0,
      },
    });

    const result = await invoke("search my email for oneblade", {
      subaction: "search",
      query: "oneblade",
    });

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "oneblade" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("OneBlade receipt");
  });

  it("uses LLM plan subaction when no explicit subaction is provided", async () => {
    mockUseModel.mockResolvedValue(
      '{"subaction":"search","queries":["from:suran"],"replyNeededOnly":false}',
    );
    mockGetGmailSearch.mockResolvedValue({
      query: "from:suran",
      messages: [
        {
          id: "msg-llm-plan-suran",
          externalId: "ext-llm-plan-suran",
          threadId: "thread-llm-plan-suran",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Checking in",
          from: "Suran Lee",
          fromEmail: "suran@example.com",
          replyTo: "suran@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Wanted to follow up",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: true,
          isImportant: false,
          likelyReplyNeeded: true,
          triageScore: 66,
          triageReason: "search hit",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-llm-plan-suran",
          metadata: {},
          syncedAt: "2026-04-08T16:00:00.000Z",
          updatedAt: "2026-04-08T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 1,
        importantCount: 0,
        replyNeededCount: 1,
      },
    });

    const result = await invoke("i'm wondering whether suran emailed me");

    expect(mockUseModel).toHaveBeenCalled();
    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "from:suran" }),
    );
    expect(result).toMatchObject({ success: true });
    expect(result?.text).toContain("Suran Lee");
  });

  it("parses TOON response with || delimited queries from LLM plan", async () => {
    mockUseModel.mockResolvedValue(
      "subaction: search\nqueries: from:suran newer_than:21d || subject:report\nreplyNeededOnly: false",
    );
    mockGetGmailSearch.mockResolvedValue({
      query: "from:suran newer_than:21d",
      messages: [
        {
          id: "msg-toon",
          externalId: "ext-toon",
          threadId: "thread-toon",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Report",
          from: "Suran Lee",
          fromEmail: "suran@example.com",
          replyTo: "suran@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Here is the report",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: false,
          isImportant: false,
          likelyReplyNeeded: false,
          triageScore: 50,
          triageReason: "search hit",
          labels: ["INBOX"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-toon",
          metadata: {},
          syncedAt: "2026-04-08T16:00:00.000Z",
          updatedAt: "2026-04-08T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 0,
        importantCount: 0,
        replyNeededCount: 0,
      },
    });

    const result = await invoke("find emails from suran about the report");

    expect(mockUseModel).toHaveBeenCalled();
    // The || delimiter should produce two separate queries
    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: expect.stringContaining("suran") }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("sends grounded Gmail results through the action callback", async () => {
    const callback = vi.fn(async () => []);
    mockGetGmailSearch.mockResolvedValue({
      query: "from:suran newer_than:21d",
      messages: [
        {
          id: "msg-suran-recent",
          externalId: "ext-suran-recent",
          threadId: "thread-suran-recent",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Checking in",
          from: "Suran Goonatilake",
          fromEmail: "suran@example.com",
          replyTo: "suran@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Wanted to follow up on the last few weeks.",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: true,
          isImportant: true,
          likelyReplyNeeded: true,
          triageScore: 72,
          triageReason: "search hit",
          labels: ["INBOX", "UNREAD"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-suran-recent",
          metadata: {},
          syncedAt: "2026-04-08T16:00:00.000Z",
          updatedAt: "2026-04-08T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 1,
        importantCount: 1,
        replyNeededCount: 1,
      },
    });

    const result = await gmailAction.handler?.(
      runtime,
      msg("check my emails from suran again"),
      {} as never,
      {
        parameters: {
          subaction: "search",
          query: "from:suran newer_than:21d",
        },
      } as never,
      callback,
    );

    expect(gmailAction.suppressPostActionContinuation).toBe(true);
    expect(result?.success).toBe(true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "GMAIL_ACTION",
        source: "action",
      }),
    );
  });

  it("broadens sender searches before giving up", async () => {
    mockGetGmailSearch
      .mockResolvedValueOnce({
        query: "from:suran",
        messages: [],
        source: "cache",
        syncedAt: "2026-04-09T16:00:00.000Z",
        summary: {
          totalCount: 0,
          unreadCount: 0,
          importantCount: 0,
          replyNeededCount: 0,
        },
      })
      .mockResolvedValueOnce({
        query: "suran",
        messages: [
          {
            id: "msg-suran",
            externalId: "ext-suran",
            threadId: "thread-suran",
            agentId: "agent-1",
            provider: "google",
            side: "owner",
            subject: "Checking in",
            from: "Suran Lee",
            fromEmail: "suran@example.com",
            replyTo: "suran@example.com",
            to: ["shawmakesmagic@gmail.com"],
            cc: [],
            snippet: "Wanted to follow up on our last note",
            receivedAt: "2026-04-08T16:00:00.000Z",
            isUnread: true,
            isImportant: false,
            likelyReplyNeeded: true,
            triageScore: 63,
            triageReason: "search hit",
            labels: ["INBOX"],
            htmlLink: "https://mail.google.com/mail/u/0/#all/thread-suran",
            metadata: {},
            syncedAt: "2026-04-08T16:00:00.000Z",
            updatedAt: "2026-04-08T16:00:00.000Z",
          },
        ],
        source: "cache",
        syncedAt: "2026-04-09T16:00:00.000Z",
        summary: {
          totalCount: 1,
          unreadCount: 1,
          importantCount: 0,
          replyNeededCount: 1,
        },
      });

    const result = await invoke("find an email from suran", {
      subaction: "search",
    });

    expect(mockGetGmailSearch).toHaveBeenNthCalledWith(
      1,
      expect.any(URL),
      expect.objectContaining({ query: "from:suran" }),
    );
    expect(mockGetGmailSearch).toHaveBeenNthCalledWith(
      2,
      expect.any(URL),
      expect.objectContaining({ query: "suran" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Suran Lee");
    expect(result?.text).toContain('sender "suran"');
  });

  it("infers sender and timeframe queries for natural Gmail search phrasing", async () => {
    mockGetGmailSearch
      .mockResolvedValueOnce({
        query: "from:suran newer_than:21d",
        messages: [],
        source: "cache",
        syncedAt: "2026-04-09T16:00:00.000Z",
        summary: {
          totalCount: 0,
          unreadCount: 0,
          importantCount: 0,
          replyNeededCount: 0,
        },
      })
      .mockResolvedValueOnce({
        query: "suran newer_than:21d",
        messages: [
          {
            id: "msg-suran-window",
            externalId: "ext-suran-window",
            threadId: "thread-suran-window",
            agentId: "agent-1",
            provider: "google",
            side: "owner",
            subject: "Follow-up from Suran",
            from: "Suran Lee",
            fromEmail: "suran@example.com",
            replyTo: "suran@example.com",
            to: ["shawmakesmagic@gmail.com"],
            cc: [],
            snippet: "Checking in over the last couple weeks",
            receivedAt: "2026-04-08T16:00:00.000Z",
            isUnread: true,
            isImportant: false,
            likelyReplyNeeded: true,
            triageScore: 70,
            triageReason: "search hit",
            labels: ["INBOX", "UNREAD"],
            htmlLink:
              "https://mail.google.com/mail/u/0/#all/thread-suran-window",
            metadata: {},
            syncedAt: "2026-04-08T16:00:00.000Z",
            updatedAt: "2026-04-08T16:00:00.000Z",
          },
        ],
        source: "cache",
        syncedAt: "2026-04-09T16:00:00.000Z",
        summary: {
          totalCount: 1,
          unreadCount: 1,
          importantCount: 0,
          replyNeededCount: 1,
        },
      });

    const result = await invoke(
      "look for all emails sent to me from suran in the last few weeks",
      {
        subaction: "search",
      },
    );

    expect(mockGetGmailSearch).toHaveBeenNthCalledWith(
      1,
      expect.any(URL),
      expect.objectContaining({ query: "from:suran newer_than:21d" }),
    );
    expect(mockGetGmailSearch).toHaveBeenNthCalledWith(
      2,
      expect.any(URL),
      expect.objectContaining({ query: "suran newer_than:21d" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Suran Lee");
    expect(result?.text).toContain("last 21 days");
  });

  it("extracts better Gmail search queries from recent conversation when no usable query is provided", async () => {
    mockUseModel.mockResolvedValue(
      "<response><query1>from:suran newer_than:21d</query1><query2>suran newer_than:21d</query2><query3></query3></response>",
    );
    mockGetGmailSearch.mockResolvedValue({
      query: "from:suran newer_than:21d",
      messages: [
        {
          id: "msg-llm-suran",
          externalId: "ext-llm-suran",
          threadId: "thread-llm-suran",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: "Suran follow-up",
          from: "Suran Lee",
          fromEmail: "suran@example.com",
          replyTo: "suran@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: "Wanted to follow up",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: false,
          isImportant: false,
          likelyReplyNeeded: true,
          triageScore: 60,
          triageReason: "search hit",
          labels: ["INBOX"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-llm-suran",
          metadata: {},
          syncedAt: "2026-04-08T16:00:00.000Z",
          updatedAt: "2026-04-08T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 0,
        importantCount: 0,
        replyNeededCount: 1,
      },
    });

    const result = await invoke("search again", {
      subaction: "search",
      state: {
        values: {
          recentMessages:
            "user: can you search my inbox\nassistant: sure\nuser: it was from Suran Lee in the last few weeks",
        },
      },
    });

    expect(mockUseModel).toHaveBeenCalledTimes(1);
    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "from:suran newer_than:21d" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Suran Lee");
  });

  it("reads the body of a matched email from follow-up context", async () => {
    mockUseModel.mockResolvedValue(
      "<response><query1>from:suran newer_than:21d</query1><query2>suran newer_than:21d</query2><query3></query3></response>",
    );
    mockReadGmailMessage.mockResolvedValue({
      query: "from:suran newer_than:21d",
      message: {
        id: "life-gmail-suran",
        externalId: "msg-suran",
        threadId: "thread-suran",
        agentId: "agent-1",
        provider: "google",
        side: "owner",
        subject: "Suran follow-up",
        from: "Suran Lee",
        fromEmail: "suran@example.com",
        replyTo: "suran@example.com",
        to: ["shawmakesmagic@gmail.com"],
        cc: [],
        snippet: "Wanted to follow up",
        receivedAt: "2026-04-08T16:00:00.000Z",
        isUnread: false,
        isImportant: false,
        likelyReplyNeeded: true,
        triageScore: 60,
        triageReason: "search hit",
        labels: ["INBOX"],
        htmlLink: "https://mail.google.com/mail/u/0/#all/thread-suran",
        metadata: {},
        syncedAt: "2026-04-08T16:00:00.000Z",
        updatedAt: "2026-04-08T16:00:00.000Z",
      },
      bodyText: "Wanted to follow up on the last few weeks.",
      source: "synced",
      syncedAt: "2026-04-09T16:00:00.000Z",
    });

    const result = await invoke("yeah, can you read it to me?", {
      state: {
        values: {
          recentMessages:
            "user: can you search my inbox\nassistant: sure\nuser: it was from Suran Lee in the last few weeks",
        },
      },
    });

    expect(mockReadGmailMessage).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "from:suran newer_than:21d" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Suran follow-up");
    expect(result?.text).toContain(
      "Wanted to follow up on the last few weeks.",
    );
  });

  it("returns a grounded rate-limit error when Gmail search is throttled", async () => {
    mockGetGmailSearch.mockRejectedValueOnce(
      new (await import("../lifeops/service.js")).LifeOpsServiceError(
        429,
        "Too many requests",
      ),
    );

    const result = await invoke("find email from suran", {
      subaction: "search",
    });

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("Gmail search hit an upstream rate limit"),
    });
  });

  it("creates a single reply draft", async () => {
    mockCreateGmailReplyDraft.mockResolvedValue({
      messageId: "msg-3",
      threadId: "thread-3",
      subject: "Re: Scheduling",
      to: ["alex@example.com"],
      cc: [],
      bodyText: "Thanks, next week works for me.",
      previewLines: ["Thanks,", "Next week works for me."],
      sendAllowed: true,
      requiresConfirmation: true,
    });

    const result = await invoke("draft a reply", {
      subaction: "draft_reply",
      messageId: "msg-3",
      details: {
        tone: "warm",
        includeQuotedOriginal: true,
      },
    });

    expect(mockCreateGmailReplyDraft).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        messageId: "msg-3",
        tone: "warm",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Drafted reply");
  });

  it("creates batch reply drafts", async () => {
    mockCreateGmailBatchReplyDrafts.mockResolvedValue({
      query: "investor",
      messages: [],
      drafts: [
        {
          messageId: "msg-4",
          threadId: "thread-4",
          subject: "Re: Investor update",
          to: ["investor@example.com"],
          cc: [],
          bodyText: "Thanks for the follow-up.",
          previewLines: ["Thanks for the follow-up."],
          sendAllowed: true,
          requiresConfirmation: true,
        },
      ],
      source: "synced",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        sendAllowedCount: 1,
        requiresConfirmationCount: 1,
      },
    });

    const result = await invoke("draft replies for investor emails", {
      subaction: "draft_batch_replies",
      query: "investor",
    });

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Drafted 1 Gmail reply");
  });

  it("sends a confirmed reply", async () => {
    mockSendGmailReply.mockResolvedValue({ ok: true });

    const result = await invoke("send this reply", {
      subaction: "send_reply",
      messageId: "msg-5",
      bodyText: "That works for me.",
      details: {
        confirmSend: true,
      },
    });

    expect(mockSendGmailReply).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        messageId: "msg-5",
        bodyText: "That works for me.",
        confirmSend: true,
      }),
    );
    expect(result).toMatchObject({ success: true });
    expect(result?.text).toContain("reply sent");
  });

  it("sends confirmed batch replies", async () => {
    mockSendGmailReplies.mockResolvedValue({ ok: true, sentCount: 2 });

    const result = await invoke("send these drafted replies", {
      subaction: "send_batch_replies",
      details: {
        confirmSend: true,
        items: [
          { messageId: "msg-1", bodyText: "Reply one" },
          { messageId: "msg-2", bodyText: "Reply two" },
        ],
      },
    });

    expect(mockSendGmailReplies).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        confirmSend: true,
        items: [
          { messageId: "msg-1", bodyText: "Reply one" },
          { messageId: "msg-2", bodyText: "Reply two" },
        ],
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Sent 2 Gmail replies");
  });

  it("asks for reconnect when Gmail send access is missing", async () => {
    mockGetGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.basic_identity", "google.gmail.triage"],
    });

    const result = await invoke("send this reply", {
      subaction: "send_reply",
      messageId: "msg-6",
      bodyText: "Thanks!",
    });

    expect(mockSendGmailReply).not.toHaveBeenCalled();
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("send access is not granted");
  });

  // --- Natural language search flexibility ---

  function searchResult(opts: {
    query: string;
    from?: string;
    fromEmail?: string;
    subject?: string;
    snippet?: string;
    empty?: boolean;
  }) {
    if (opts.empty) {
      return {
        query: opts.query,
        messages: [],
        source: "cache",
        syncedAt: "2026-04-09T16:00:00.000Z",
        summary: {
          totalCount: 0,
          unreadCount: 0,
          importantCount: 0,
          replyNeededCount: 0,
        },
      };
    }
    return {
      query: opts.query,
      messages: [
        {
          id: "msg-test",
          externalId: "ext-test",
          threadId: "thread-test",
          agentId: "agent-1",
          provider: "google",
          side: "owner",
          subject: opts.subject ?? "Test email",
          from: opts.from ?? "Test Sender",
          fromEmail: opts.fromEmail ?? "test@example.com",
          replyTo: opts.fromEmail ?? "test@example.com",
          to: ["shawmakesmagic@gmail.com"],
          cc: [],
          snippet: opts.snippet ?? "Test snippet",
          receivedAt: "2026-04-08T16:00:00.000Z",
          isUnread: false,
          isImportant: false,
          likelyReplyNeeded: false,
          triageScore: 50,
          triageReason: "search hit",
          labels: ["INBOX"],
          htmlLink: "https://mail.google.com/mail/u/0/#all/thread-test",
          metadata: {},
          syncedAt: "2026-04-08T16:00:00.000Z",
          updatedAt: "2026-04-08T16:00:00.000Z",
        },
      ],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        totalCount: 1,
        unreadCount: 0,
        importantCount: 0,
        replyNeededCount: 0,
      },
    };
  }

  function invokeWith(
    messageText: string,
    paramsIntent: string,
    extra: Record<string, unknown> = {},
  ) {
    const { subaction, query, queries, messageId, bodyText, details, state } =
      extra;
    return gmailAction.handler?.(
      runtime,
      msg(messageText),
      (state ?? {}) as never,
      {
        parameters: {
          subaction,
          intent: paramsIntent,
          query,
          queries,
          messageId,
          bodyText,
          details,
        },
      } as never,
    );
  }

  it("searches by bare name: 'just search suran'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "suran",
        from: "Suran Goonatilake",
        fromEmail: "suran@example.com",
        subject: "Checking in",
      }),
    );

    const result = await invoke("just search suran");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: "suran" }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("extracts sender from 'can you search my email and tell me if anyone named suran emailed me'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        fromEmail: "suran@example.com",
        subject: "Checking in",
      }),
    );

    const result = await invoke(
      "can you search my email and tell me if anyone named suran emailed me",
    );

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("extracts sender from 'find the last email suran sent me'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Project update",
      }),
    );

    const result = await invoke("find the last email suran sent me");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Project update");
  });

  it("extracts sender from 'did suran email me'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Quick question",
      }),
    );

    const result = await invoke("did suran email me");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Quick question");
  });

  it("extracts sender from 'can you search my email and tell me if anyone named suran emailed me'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const result = await invoke(
      "can you search my email and tell me if anyone named suran emailed me",
    );

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("extracts sender from 'has suran emailed me'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Follow-up note",
      }),
    );

    const result = await invoke("has suran emailed me");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Follow-up note");
  });

  it("extracts sender from 'what did suran send me'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Meeting notes",
      }),
    );

    const result = await invoke("what did suran send me");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Meeting notes");
  });

  it("handles 'any emails from suran?'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Hey",
      }),
    );

    const result = await invoke("any emails from suran?");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: expect.stringContaining("from:suran"),
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("handles sender + topic: 'emails from suran about the meeting'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran meeting",
        from: "Suran Goonatilake",
        subject: "Re: Meeting agenda",
      }),
    );

    const result = await invoke("emails from suran about the meeting");

    const searchCall = mockGetGmailSearch.mock.calls[0];
    const query = (searchCall[1] as { query: string }).query;
    expect(query).toContain("from:suran");
    expect(query).toMatch(/meeting/i);
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Meeting agenda");
  });

  it("handles topic-only search: 'find emails about the invoice'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "invoice",
        from: "Accounting",
        subject: "Invoice #4521",
      }),
    );

    const result = await invoke("find emails about the invoice");

    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ query: expect.stringContaining("invoice") }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Invoice #4521");
  });

  // --- Follow-up and retry handling ---

  it("resolves prior intent on 'yeah try it' follow-up", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const result = await invokeWith("yeah try it", "yeah try it", {
      state: {
        values: {
          recentMessages:
            "user: find the last email suran sent me\nassistant: No Gmail message matched.",
        },
      },
    });

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const searchCall = mockGetGmailSearch.mock.calls[0];
    const query = (searchCall[1] as { query: string }).query;
    expect(query).toMatch(/suran/i);
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("resolves prior intent on 'try again' follow-up", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Update",
      }),
    );

    const result = await invokeWith("try again", "try again", {
      state: {
        values: {
          recentMessages:
            "user: search for emails from suran\nassistant: No email matched.",
        },
      },
    });

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const searchCall = mockGetGmailSearch.mock.calls[0];
    const query = (searchCall[1] as { query: string }).query;
    expect(query).toMatch(/suran/i);
    expect(result?.success).toBe(true);
  });

  it("follow-up adds useful constraints: 'what about unread ones?'", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran is:unread",
        from: "Suran Goonatilake",
        subject: "New proposal",
      }),
    );

    const result = await invokeWith(
      "what about unread ones?",
      "what about unread ones?",
      {
        state: {
          values: {
            recentMessages:
              "user: find emails from suran\nassistant: Found 3 emails for sender suran.",
          },
        },
      },
    );

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const searchCall = mockGetGmailSearch.mock.calls[0];
    const query = (searchCall[1] as { query: string }).query;
    expect(query).toMatch(/suran/i);
    expect(query).toContain("is:unread");
    expect(result?.success).toBe(true);
  });

  it("follow-up adds a relative month constraint from recent context", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran newer_than:30d",
        from: "Suran Goonatilake",
        subject: "Monthly update",
      }),
    );

    const result = await invokeWith("what about this month?", "what about this month?", {
      state: {
        values: {
          recentMessages:
            "user: find emails from suran\nassistant: Found 3 emails for sender suran.",
        },
      },
    });

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const searchCall = mockGetGmailSearch.mock.calls[0];
    const query = (searchCall[1] as { query: string }).query;
    expect(query).toContain("from:suran");
    expect(query).toContain("newer_than:30d");
    expect(result?.success).toBe(true);
  });

  it("follow-up resolves from timestamped runtime format", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran is:unread",
        from: "Suran Goonatilake",
        subject: "New proposal",
      }),
    );

    const result = await invokeWith(
      "what about unread ones?",
      "what about unread ones?",
      {
        state: {
          values: {
            agentName: "Sakuya",
            recentMessages: [
              "14:23 (3 min ago) [entity-abc] Shaw: find emails from suran",
              "14:24 (2 min ago) [entity-xyz] Sakuya: Found 3 emails for sender suran.",
            ].join("\n"),
          },
        },
      },
    );

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const searchCall = mockGetGmailSearch.mock.calls[0];
    const query = (searchCall[1] as { query: string }).query;
    expect(query).toMatch(/suran/i);
    expect(query).toContain("is:unread");
    expect(result?.success).toBe(true);
  });

  // --- Parameter documentation noise rejection ---

  it("rejects LIFE action parameter doc noise in params.intent", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const noiseIntent =
      'title?:string - Name or ID of an existing item (e.g., when renaming).; details?:object - Structured data when needed. May include: cadence (schedule object), kind (task/habit/routine), description, priority, progressionRule, reminderPlan, confirmed (boolean when the user explicitly approves a previewed create)';

    const result = await invokeWith("yeah try it", noiseIntent, {
      state: {
        values: {
          recentMessages:
            "user: find the last email suran sent me\nassistant: I couldn't find an email matching that search.",
        },
      },
    });

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const query = (mockGetGmailSearch.mock.calls[0][1] as { query: string })
      .query;
    expect(query).toMatch(/suran/i);
    expect(query).not.toContain("title");
    expect(query).not.toContain("cadence");
    expect(query).not.toContain("progressionRule");
    expect(result?.success).toBe(true);
  });

  it("prefers a generated structured Gmail query over a narrative params.query", async () => {
    mockUseModel.mockResolvedValue(
      "<response><query1>from:suran</query1></response>",
    );
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const result = await invokeWith(
      "can you search my email and tell me if anyone named suran emailed me",
      "can you search my email and tell me if anyone named suran emailed me",
      {
        query: "my and tell me if anyone named suran emailed me",
      },
    );

    expect(mockUseModel).toHaveBeenCalledTimes(1);
    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: "from:suran",
      }),
    );
    expect(result?.success).toBe(true);
  });

  it("falls back to an LLM-extracted Gmail query when a non-English params.query is just the echoed request", async () => {
    mockUseModel.mockResolvedValue(
      '{"subaction":"search","queries":["from:suran"]}',
    );
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const request =
      "puedes buscar en mi correo y decirme si suran me escribió";
    const result = await invokeWith(request, request, {
      subaction: "search",
      query: request,
    });

    expect(mockUseModel).toHaveBeenCalled();
    expect(mockGetGmailSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        query: "from:suran",
      }),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("does not extract garbage sender names from noise text", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({ query: "suran", from: "Suran", subject: "Hey" }),
    );

    const noiseIntent =
      "query?:string - Gmail search query; queries?:string[] - Multiple queries; details?:object - Structured data";

    const result = await invokeWith("search suran", noiseIntent, {});

    expect(mockGetGmailSearch).toHaveBeenCalled();
    const query = (mockGetGmailSearch.mock.calls[0][1] as { query: string })
      .query;
    expect(query).toMatch(/suran/i);
    expect(query).not.toContain("details");
  });

  it("overrides malformed planner search text with an inferred sender query", async () => {
    mockGetGmailSearch.mockResolvedValue(
      searchResult({
        query: "from:suran",
        from: "Suran Goonatilake",
        subject: "Checking in",
      }),
    );

    const result = await invoke(
      "can you search my email and tell me if anyone named suran emailed me",
      {
        subaction: "search",
        query: "my and tell me if anyone named suran emailed me",
      },
    );

    const query = (mockGetGmailSearch.mock.calls[0][1] as { query: string })
      .query;
    expect(query).toContain("from:suran");
    expect(query).not.toContain("tell me if");
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Checking in");
  });

  it("rejects noise and falls back gracefully when no context exists", async () => {
    mockGetGmailTriage.mockResolvedValue({
      messages: [],
      source: "cache",
      syncedAt: "2026-04-09T16:00:00.000Z",
      summary: {
        unreadCount: 0,
        importantNewCount: 0,
        likelyReplyNeededCount: 0,
      },
    });

    const noiseIntent =
      "actions params parameters details?:object structured gmail arguments supported keys include";

    const result = await invokeWith("yeah", noiseIntent, {});

    expect(result?.success).toBe(true);
    expect(mockGetGmailSearch).not.toHaveBeenCalled();
  });
});
