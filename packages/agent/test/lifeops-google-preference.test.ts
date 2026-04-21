import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import { saveEnv } from "../../../test/helpers/test-utils";
import { ManagedGoogleClientError } from "../src/lifeops/google-managed-client";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";
import { LifeOpsService } from "../src/lifeops/service";
import { DatabaseSync, hasSqlite } from "../src/test-utils/sqlite-compat";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) {
    return "";
  }
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return String(value ?? "");
    })
    .join("");
}

function createRuntime(agentId: string, databasePath: string): IAgentRuntime {
  const sqlite = new DatabaseSync(databasePath);
  return {
    agentId,
    character: {
      name: `${agentId}-agent`,
    } as IAgentRuntime["character"],
    getSetting: () => undefined,
    getService: () => null,
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) {
            return [];
          }
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  } as unknown as IAgentRuntime;
}

async function seedGoogleGrants(
  repository: LifeOpsRepository,
  agentId: string,
  preferredMode: "local" | "cloud_managed",
  side: "owner" | "agent" = "owner",
): Promise<void> {
  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId,
      side,
      provider: "google",
      identity: {},
      grantedScopes: [],
      capabilities: [],
      tokenRef: null,
      mode: "local",
      preferredByAgent: preferredMode === "local",
      metadata: {},
      lastRefreshAt: null,
    }),
  );
  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId,
      side,
      provider: "google",
      identity: {},
      grantedScopes: [],
      capabilities: [],
      tokenRef: null,
      mode: "cloud_managed",
      executionTarget: "cloud",
      sourceOfTruth: "cloud_connection",
      preferredByAgent: preferredMode === "cloud_managed",
      cloudConnectionId: `cloud-${agentId}`,
      metadata: {},
      lastRefreshAt: null,
    }),
  );
}

async function seedManagedGoogleGrant(args: {
  repository: LifeOpsRepository;
  agentId: string;
  side: "owner" | "agent";
  preferredByAgent?: boolean;
  capabilities?: string[];
}): Promise<void> {
  await args.repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId: args.agentId,
      side: args.side,
      provider: "google",
      identity: {
        email: `${args.side}@example.com`,
        name: args.side === "owner" ? "Owner Example" : "Agent Example",
      },
      grantedScopes: ["calendar.readonly", "gmail.readonly"],
      capabilities: args.capabilities ?? [
        "google.calendar.read",
        "google.gmail.triage",
      ],
      tokenRef: null,
      mode: "cloud_managed",
      executionTarget: "cloud",
      sourceOfTruth: "cloud_connection",
      preferredByAgent: args.preferredByAgent ?? false,
      cloudConnectionId: `cloud-${args.agentId}-${args.side}`,
      metadata: {
        hasRefreshToken: true,
      },
      lastRefreshAt: null,
    }),
  );
}

describeIf(hasSqlite)("life-ops Google mode preference", () => {
  let databasePath = "";
  let envBackup: { restore: () => void };

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZAOS_CLOUD_BASE_URL",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL",
      "ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL",
    );
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
    delete process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL;
    delete process.env.ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL;

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lifeops-google-preference-"),
    );
    databasePath = path.join(tempDir, "lifeops.sqlite");
  });

  afterAll(async () => {
    if (databasePath) {
      await fs.rm(path.dirname(databasePath), {
        recursive: true,
        force: true,
      });
    }
    envBackup.restore();
  });

  it("stores Google preference per agent instead of globally", async () => {
    const runtimeA = createRuntime("lifeops-google-agent-a", databasePath);
    const runtimeB = createRuntime("lifeops-google-agent-b", databasePath);
    const repositoryA = new LifeOpsRepository(runtimeA);
    const repositoryB = new LifeOpsRepository(runtimeB);
    const serviceA = new LifeOpsService(runtimeA);
    const serviceB = new LifeOpsService(runtimeB);
    const requestUrl = new URL(
      "http://127.0.0.1:3000/api/lifeops/connectors/google/status",
    );

    await seedGoogleGrants(
      repositoryA,
      "lifeops-google-agent-a",
      "cloud_managed",
    );
    await seedGoogleGrants(repositoryB, "lifeops-google-agent-b", "local");

    const switchedLocalStatus = await serviceA.selectGoogleConnectorMode(
      requestUrl,
      "local",
    );
    const agentAGrants = await repositoryA.listConnectorGrants(
      "lifeops-google-agent-a",
    );
    const agentBGrantsAfterA = await repositoryB.listConnectorGrants(
      "lifeops-google-agent-b",
    );

    expect(switchedLocalStatus.mode).toBe("local");
    expect(switchedLocalStatus.preferredByAgent).toBe(true);
    expect(
      agentAGrants.find((grant) => grant.mode === "local")?.preferredByAgent,
    ).toBe(true);
    expect(
      agentAGrants.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(false);
    expect(
      agentBGrantsAfterA.find((grant) => grant.mode === "local")
        ?.preferredByAgent,
    ).toBe(true);
    expect(
      agentBGrantsAfterA.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(false);

    const switchedCloudStatus = await serviceB.selectGoogleConnectorMode(
      requestUrl,
      "cloud_managed",
    );
    const agentAGrantsAfterB = await repositoryA.listConnectorGrants(
      "lifeops-google-agent-a",
    );
    const agentBGrants = await repositoryB.listConnectorGrants(
      "lifeops-google-agent-b",
    );

    expect(switchedCloudStatus.mode).toBe("cloud_managed");
    expect(switchedCloudStatus.preferredByAgent).toBe(true);
    expect(
      agentAGrantsAfterB.find((grant) => grant.mode === "local")
        ?.preferredByAgent,
    ).toBe(true);
    expect(
      agentAGrantsAfterB.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(false);
    expect(
      agentBGrants.find((grant) => grant.mode === "local")?.preferredByAgent,
    ).toBe(false);
    expect(
      agentBGrants.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(true);
  });

  it("treats missing managed Google status endpoints as disconnected cloud state without falling back to local", async () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "test-cloud-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://www.elizacloud.ai";

    const agentId = "lifeops-google-status-agent";
    const runtime = createRuntime(agentId, databasePath);
    const repository = new LifeOpsRepository(runtime);
    const service = new LifeOpsService(runtime);
    await seedManagedGoogleGrant({
      repository,
      agentId,
      side: "owner",
      preferredByAgent: true,
    });

    (
      service as unknown as {
        googleManagedClient: { getStatus: () => Promise<never> };
      }
    ).googleManagedClient = {
      getStatus: vi
        .fn()
        .mockRejectedValue(new Error("should not be called through network")),
    };

    vi.spyOn(
      (
        service as unknown as {
          googleManagedClient: { getStatus: () => Promise<never> };
        }
      ).googleManagedClient,
      "getStatus",
    ).mockRejectedValueOnce(new ManagedGoogleClientError(404, "404 Not Found"));

    const status = await service.getGoogleConnectorStatus(
      new URL("http://127.0.0.1:3000/api/lifeops/connectors/google/status"),
      "cloud_managed",
      "owner",
    );
    const staleGrant = await repository.getConnectorGrant(
      agentId,
      "google",
      "cloud_managed",
      "owner",
    );

    expect(status.connected).toBe(false);
    expect(status.configured).toBe(true);
    expect(status.reason).toBe("disconnected");
    expect(status.availableModes).toEqual(["cloud_managed"]);
    expect(status.mode).toBe("cloud_managed");
    expect(status.side).toBe("owner");
    expect(status.executionTarget).toBe("cloud");
    expect(status.sourceOfTruth).toBe("cloud_connection");
    expect(status.grant).toBeNull();
    expect(status.identity).toBeNull();
    expect(staleGrant).toBeNull();

    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
  });

  it("keeps owner and agent Google grants separate while allowing one active default per agent", async () => {
    const agentId = "lifeops-google-side-agent";
    const runtime = createRuntime(agentId, databasePath);
    const repository = new LifeOpsRepository(runtime);
    const service = new LifeOpsService(runtime);
    const requestUrl = new URL(
      "http://127.0.0.1:3000/api/lifeops/connectors/google/status",
    );

    await repository.upsertConnectorGrant(
      createLifeOpsConnectorGrant({
        agentId,
        side: "owner",
        provider: "google",
        identity: {},
        grantedScopes: [],
        capabilities: [],
        tokenRef: null,
        mode: "local",
        preferredByAgent: true,
        metadata: {},
        lastRefreshAt: null,
      }),
    );
    await repository.upsertConnectorGrant(
      createLifeOpsConnectorGrant({
        agentId,
        side: "owner",
        provider: "google",
        identity: {},
        grantedScopes: [],
        capabilities: [],
        tokenRef: null,
        mode: "cloud_managed",
        executionTarget: "cloud",
        sourceOfTruth: "cloud_connection",
        preferredByAgent: false,
        cloudConnectionId: `cloud-owner-${agentId}`,
        metadata: {},
        lastRefreshAt: null,
      }),
    );
    await repository.upsertConnectorGrant(
      createLifeOpsConnectorGrant({
        agentId,
        side: "agent",
        provider: "google",
        identity: {},
        grantedScopes: [],
        capabilities: [],
        tokenRef: null,
        mode: "local",
        preferredByAgent: false,
        metadata: {},
        lastRefreshAt: null,
      }),
    );
    await repository.upsertConnectorGrant(
      createLifeOpsConnectorGrant({
        agentId,
        side: "agent",
        provider: "google",
        identity: {},
        grantedScopes: [],
        capabilities: [],
        tokenRef: null,
        mode: "cloud_managed",
        executionTarget: "cloud",
        sourceOfTruth: "cloud_connection",
        preferredByAgent: false,
        cloudConnectionId: `cloud-agent-${agentId}`,
        metadata: {},
        lastRefreshAt: null,
      }),
    );

    const ownerStatusBefore = await service.getGoogleConnectorStatus(
      requestUrl,
      undefined,
      "owner",
    );
    const agentStatusBefore = await service.getGoogleConnectorStatus(
      requestUrl,
      "cloud_managed",
      "agent",
    );

    expect(ownerStatusBefore.side).toBe("owner");
    expect(ownerStatusBefore.mode).toBe("local");
    expect(ownerStatusBefore.preferredByAgent).toBe(true);
    expect(agentStatusBefore.side).toBe("agent");
    expect(agentStatusBefore.mode).toBe("cloud_managed");
    expect(agentStatusBefore.preferredByAgent).toBe(false);

    const switchedAgentStatus = await service.selectGoogleConnectorMode(
      requestUrl,
      "cloud_managed",
      "agent",
    );
    const grantsAfterAgentSwitch =
      await repository.listConnectorGrants(agentId);

    expect(switchedAgentStatus.side).toBe("agent");
    expect(switchedAgentStatus.mode).toBe("cloud_managed");
    expect(switchedAgentStatus.preferredByAgent).toBe(true);
    expect(
      grantsAfterAgentSwitch.find(
        (grant) => grant.side === "owner" && grant.mode === "local",
      )?.preferredByAgent,
    ).toBe(false);
    expect(
      grantsAfterAgentSwitch.find(
        (grant) => grant.side === "agent" && grant.mode === "cloud_managed",
      )?.preferredByAgent,
    ).toBe(true);

    const switchedOwnerStatus = await service.selectGoogleConnectorMode(
      requestUrl,
      "local",
      "owner",
    );
    const grantsAfterOwnerSwitch =
      await repository.listConnectorGrants(agentId);

    expect(switchedOwnerStatus.side).toBe("owner");
    expect(switchedOwnerStatus.mode).toBe("local");
    expect(switchedOwnerStatus.preferredByAgent).toBe(true);
    expect(
      grantsAfterOwnerSwitch.find(
        (grant) => grant.side === "owner" && grant.mode === "local",
      )?.preferredByAgent,
    ).toBe(true);
    expect(
      grantsAfterOwnerSwitch.find(
        (grant) => grant.side === "agent" && grant.mode === "cloud_managed",
      )?.preferredByAgent,
    ).toBe(false);
  });

  it("keeps owner and agent managed Google calendar and Gmail caches isolated", async () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "cloud-api-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://elizacloud.example";

    const agentId = "lifeops-google-side-cache-agent";
    const runtime = createRuntime(agentId, databasePath);
    const repository = new LifeOpsRepository(runtime);
    await seedManagedGoogleGrant({
      repository,
      agentId,
      side: "owner",
      preferredByAgent: true,
    });
    await seedManagedGoogleGrant({
      repository,
      agentId,
      side: "agent",
    });

    const service = new LifeOpsService(runtime);
    const requestUrl = new URL(
      "http://127.0.0.1:3000/api/lifeops/calendar/feed",
    );
    const managedClient = (
      service as unknown as {
        googleManagedClient: {
          getStatus: (side: "owner" | "agent") => Promise<unknown>;
          getCalendarFeed: (args: {
            side: "owner" | "agent";
            calendarId: string;
            timeMin: string;
            timeMax: string;
            timeZone: string;
          }) => Promise<unknown>;
          getGmailTriage: (args: {
            side: "owner" | "agent";
            maxResults: number;
          }) => Promise<unknown>;
        };
      }
    ).googleManagedClient;

    vi.spyOn(managedClient, "getStatus").mockImplementation(async (side) => ({
      provider: "google",
      side,
      mode: "cloud_managed",
      configured: true,
      connected: true,
      reason: "connected",
      identity: {
        email: `${side}@example.com`,
        name: side === "owner" ? "Owner Example" : "Agent Example",
      },
      grantedCapabilities: ["google.calendar.read", "google.gmail.triage"],
      grantedScopes: ["calendar.readonly", "gmail.readonly"],
      expiresAt: null,
      hasRefreshToken: true,
      connectionId: `conn-${side}`,
      linkedAt: "2026-04-05T00:00:00.000Z",
      lastUsedAt: "2026-04-05T00:00:00.000Z",
    }));
    vi.spyOn(managedClient, "getCalendarFeed").mockImplementation(
      async ({ side }) => ({
        calendarId: "primary",
        syncedAt: "2026-04-05T01:00:00.000Z",
        events: [
          {
            externalId: "shared-external-event",
            calendarId: "primary",
            title:
              side === "owner"
                ? "Owner calendar event"
                : "Agent calendar event",
            description: "",
            location: side === "owner" ? "Owner HQ" : "Agent Lab",
            status: "confirmed",
            startAt: "2026-04-05T02:00:00.000Z",
            endAt: "2026-04-05T02:30:00.000Z",
            isAllDay: false,
            timezone: "UTC",
            htmlLink: null,
            conferenceLink: null,
            organizer: null,
            attendees: [],
            metadata: {},
          },
        ],
      }),
    );
    vi.spyOn(managedClient, "getGmailTriage").mockImplementation(
      async ({ side }) => ({
        syncedAt: "2026-04-05T01:05:00.000Z",
        messages: [
          {
            externalId: "shared-external-message",
            threadId: "shared-thread",
            subject:
              side === "owner" ? "Owner inbox thread" : "Agent inbox thread",
            from:
              side === "owner"
                ? "Owner Sender <owner.sender@example.com>"
                : "Agent Sender <agent.sender@example.com>",
            fromEmail:
              side === "owner"
                ? "owner.sender@example.com"
                : "agent.sender@example.com",
            replyTo:
              side === "owner"
                ? "owner.sender@example.com"
                : "agent.sender@example.com",
            to: [`${side}@example.com`],
            cc: [],
            snippet: side === "owner" ? "Owner snippet" : "Agent snippet",
            receivedAt: "2026-04-05T01:04:00.000Z",
            isUnread: true,
            isImportant: true,
            likelyReplyNeeded: true,
            triageScore: 90,
            triageReason: "needs reply",
            labels: ["INBOX"],
            htmlLink: null,
            metadata: {},
          },
        ],
      }),
    );

    const calendarFeedRequest = {
      mode: "cloud_managed" as const,
      timeMin: "2026-04-05T00:00:00.000Z",
      timeMax: "2026-04-06T00:00:00.000Z",
    };

    const ownerFeed = await service.getCalendarFeed(requestUrl, {
      ...calendarFeedRequest,
      side: "owner",
      forceSync: true,
    });
    const agentFeed = await service.getCalendarFeed(requestUrl, {
      ...calendarFeedRequest,
      side: "agent",
      forceSync: true,
    });
    const ownerFeedCached = await service.getCalendarFeed(requestUrl, {
      ...calendarFeedRequest,
      side: "owner",
    });
    const agentFeedCached = await service.getCalendarFeed(requestUrl, {
      ...calendarFeedRequest,
      side: "agent",
    });

    expect(ownerFeed.events).toHaveLength(1);
    expect(agentFeed.events).toHaveLength(1);
    expect(ownerFeed.events[0]?.side).toBe("owner");
    expect(agentFeed.events[0]?.side).toBe("agent");
    expect(ownerFeed.events[0]?.title).toBe("Owner calendar event");
    expect(agentFeed.events[0]?.title).toBe("Agent calendar event");
    expect(ownerFeed.events[0]?.externalId).toBe("shared-external-event");
    expect(agentFeed.events[0]?.externalId).toBe("shared-external-event");
    expect(ownerFeed.events[0]?.id).not.toBe(agentFeed.events[0]?.id);
    expect(ownerFeedCached.source).toBe("cache");
    expect(agentFeedCached.source).toBe("cache");
    expect(ownerFeedCached.events[0]?.title).toBe("Owner calendar event");
    expect(agentFeedCached.events[0]?.title).toBe("Agent calendar event");

    const ownerTriage = await service.getGmailTriage(requestUrl, {
      mode: "cloud_managed",
      side: "owner",
      forceSync: true,
    });
    const agentTriage = await service.getGmailTriage(requestUrl, {
      mode: "cloud_managed",
      side: "agent",
      forceSync: true,
    });
    const ownerMessageId = ownerTriage.messages[0]?.id;
    const agentMessageId = agentTriage.messages[0]?.id;

    expect(ownerMessageId).toBeTypeOf("string");
    expect(agentMessageId).toBeTypeOf("string");

    const ownerDraft = await service.createGmailReplyDraft(requestUrl, {
      mode: "cloud_managed",
      side: "owner",
      messageId: String(ownerMessageId),
    });
    const agentDraft = await service.createGmailReplyDraft(requestUrl, {
      mode: "cloud_managed",
      side: "agent",
      messageId: String(agentMessageId),
    });

    expect(ownerTriage.messages).toHaveLength(1);
    expect(agentTriage.messages).toHaveLength(1);
    expect(ownerTriage.messages[0]?.side).toBe("owner");
    expect(agentTriage.messages[0]?.side).toBe("agent");
    expect(ownerTriage.messages[0]?.subject).toBe("Owner inbox thread");
    expect(agentTriage.messages[0]?.subject).toBe("Agent inbox thread");
    expect(ownerTriage.messages[0]?.externalId).toBe("shared-external-message");
    expect(agentTriage.messages[0]?.externalId).toBe("shared-external-message");
    expect(ownerTriage.messages[0]?.id).not.toBe(agentTriage.messages[0]?.id);
    expect(ownerDraft.messageId).toBe(ownerTriage.messages[0]?.id);
    expect(agentDraft.messageId).toBe(agentTriage.messages[0]?.id);

    const ownerCachedMessages = await repository.listGmailMessages(
      agentId,
      "google",
      { maxResults: 5 },
      "owner",
    );
    const agentCachedMessages = await repository.listGmailMessages(
      agentId,
      "google",
      { maxResults: 5 },
      "agent",
    );
    expect(ownerCachedMessages).toHaveLength(1);
    expect(agentCachedMessages).toHaveLength(1);
    expect(ownerCachedMessages[0]?.subject).toBe("Owner inbox thread");
    expect(agentCachedMessages[0]?.subject).toBe("Agent inbox thread");
  });
});
