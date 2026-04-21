import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import { LifeOpsRepository } from "../src/lifeops/repository";
import {
  DatabaseSync,
  hasSqlite,
  type SqliteDatabaseSync,
} from "../src/test-utils/sqlite-compat";

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

function createRuntime(
  agentId: string,
  sqlite: SqliteDatabaseSync,
): IAgentRuntime {
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

describeIf(hasSqlite)("LifeOpsRepository Google side migrations", () => {
  it("migrates pre-side Google cache tables and preserves owner rows while allowing agent rows with the same external ids", async () => {
    const agentId = "lifeops-google-legacy-migration-agent";
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE life_calendar_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        external_event_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        is_all_day BOOLEAN NOT NULL,
        timezone TEXT,
        html_link TEXT,
        conference_link TEXT,
        organizer_json TEXT,
        attendees_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        synced_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, provider, calendar_id, external_event_id)
      );
      CREATE TABLE life_calendar_sync_states (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        window_start_at TEXT NOT NULL,
        window_end_at TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, provider, calendar_id)
      );
      CREATE TABLE life_gmail_messages (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_message_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        from_display TEXT NOT NULL DEFAULT '',
        from_email TEXT,
        reply_to TEXT,
        to_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        snippet TEXT NOT NULL DEFAULT '',
        received_at TEXT NOT NULL,
        is_unread BOOLEAN NOT NULL DEFAULT FALSE,
        is_important BOOLEAN NOT NULL DEFAULT FALSE,
        likely_reply_needed BOOLEAN NOT NULL DEFAULT FALSE,
        triage_score INTEGER NOT NULL DEFAULT 0,
        triage_reason TEXT NOT NULL DEFAULT '',
        label_ids_json TEXT NOT NULL DEFAULT '[]',
        html_link TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        synced_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, provider, external_message_id)
      );
      CREATE TABLE life_gmail_sync_states (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        mailbox TEXT NOT NULL,
        max_results INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, provider, mailbox)
      );
      INSERT INTO life_calendar_events (
        id, agent_id, provider, calendar_id, external_event_id, title,
        description, location, status, start_at, end_at, is_all_day, timezone,
        html_link, conference_link, organizer_json, attendees_json,
        metadata_json, synced_at, updated_at
      ) VALUES (
        'legacy-calendar-owner',
        '${agentId}',
        'google',
        'primary',
        'shared-external-event',
        'Legacy owner event',
        '',
        'Owner HQ',
        'confirmed',
        '2026-04-05T02:00:00.000Z',
        '2026-04-05T02:30:00.000Z',
        0,
        'UTC',
        NULL,
        NULL,
        NULL,
        '[]',
        '{"legacy":true}',
        '2026-04-05T01:00:00.000Z',
        '2026-04-05T01:00:00.000Z'
      );
      INSERT INTO life_calendar_sync_states (
        id, agent_id, provider, calendar_id, window_start_at, window_end_at,
        synced_at, updated_at
      ) VALUES (
        'legacy-calendar-sync-owner',
        '${agentId}',
        'google',
        'primary',
        '2026-04-05T00:00:00.000Z',
        '2026-04-06T00:00:00.000Z',
        '2026-04-05T01:00:00.000Z',
        '2026-04-05T01:00:00.000Z'
      );
      INSERT INTO life_gmail_messages (
        id, agent_id, provider, external_message_id, thread_id, subject,
        from_display, from_email, reply_to, to_json, cc_json, snippet,
        received_at, is_unread, is_important, likely_reply_needed,
        triage_score, triage_reason, label_ids_json, html_link, metadata_json,
        synced_at, updated_at
      ) VALUES (
        'legacy-gmail-owner',
        '${agentId}',
        'google',
        'shared-external-message',
        'shared-thread',
        'Legacy owner message',
        'Owner Sender <owner.sender@example.com>',
        'owner.sender@example.com',
        'owner.sender@example.com',
        '["owner@example.com"]',
        '[]',
        'Legacy snippet',
        '2026-04-05T01:04:00.000Z',
        1,
        1,
        1,
        90,
        'needs reply',
        '["INBOX"]',
        NULL,
        '{"legacy":true}',
        '2026-04-05T01:05:00.000Z',
        '2026-04-05T01:05:00.000Z'
      );
      INSERT INTO life_gmail_sync_states (
        id, agent_id, provider, mailbox, max_results, synced_at, updated_at
      ) VALUES (
        'legacy-gmail-sync-owner',
        '${agentId}',
        'google',
        'primary',
        10,
        '2026-04-05T01:05:00.000Z',
        '2026-04-05T01:05:00.000Z'
      );
    `);

    const repository = new LifeOpsRepository(createRuntime(agentId, sqlite));
    await repository.ensureReady();

    const ownerEvents = await repository.listCalendarEvents(
      agentId,
      "google",
      undefined,
      undefined,
      "owner",
    );
    const ownerCalendarSync = await repository.getCalendarSyncState(
      agentId,
      "google",
      "primary",
      "owner",
    );
    const ownerMessages = await repository.listGmailMessages(
      agentId,
      "google",
      { maxResults: 10 },
      "owner",
    );
    const ownerGmailSync = await repository.getGmailSyncState(
      agentId,
      "google",
      "primary",
      "owner",
    );

    expect(ownerEvents).toHaveLength(1);
    expect(ownerEvents[0]?.side).toBe("owner");
    expect(ownerEvents[0]?.title).toBe("Legacy owner event");
    expect(ownerEvents[0]?.metadata).toEqual({ legacy: true });
    expect(ownerCalendarSync?.side).toBe("owner");
    expect(ownerMessages).toHaveLength(1);
    expect(ownerMessages[0]?.side).toBe("owner");
    expect(ownerMessages[0]?.subject).toBe("Legacy owner message");
    expect(ownerMessages[0]?.metadata).toEqual({ legacy: true });
    expect(ownerGmailSync?.side).toBe("owner");

    await repository.upsertCalendarEvent({
      ...(ownerEvents[0] as NonNullable<(typeof ownerEvents)[number]>),
      id: "agent-calendar-row",
      side: "agent",
      title: "Agent side event",
      location: "Agent Lab",
      syncedAt: "2026-04-05T02:00:00.000Z",
      updatedAt: "2026-04-05T02:00:00.000Z",
    });
    await repository.upsertCalendarSyncState({
      id: "agent-calendar-sync-row",
      agentId,
      provider: "google",
      side: "agent",
      calendarId: "primary",
      windowStartAt: "2026-04-05T00:00:00.000Z",
      windowEndAt: "2026-04-06T00:00:00.000Z",
      syncedAt: "2026-04-05T02:00:00.000Z",
      updatedAt: "2026-04-05T02:00:00.000Z",
    });
    await repository.upsertGmailMessage({
      ...(ownerMessages[0] as NonNullable<(typeof ownerMessages)[number]>),
      id: "agent-gmail-row",
      side: "agent",
      subject: "Agent side message",
      from: "Agent Sender <agent.sender@example.com>",
      fromEmail: "agent.sender@example.com",
      replyTo: "agent.sender@example.com",
      to: ["agent@example.com"],
      snippet: "Agent snippet",
      syncedAt: "2026-04-05T02:05:00.000Z",
      updatedAt: "2026-04-05T02:05:00.000Z",
    });
    await repository.upsertGmailSyncState({
      id: "agent-gmail-sync-row",
      agentId,
      provider: "google",
      side: "agent",
      mailbox: "primary",
      maxResults: 10,
      syncedAt: "2026-04-05T02:05:00.000Z",
      updatedAt: "2026-04-05T02:05:00.000Z",
    });

    const migratedOwnerEvents = await repository.listCalendarEvents(
      agentId,
      "google",
      undefined,
      undefined,
      "owner",
    );
    const agentEvents = await repository.listCalendarEvents(
      agentId,
      "google",
      undefined,
      undefined,
      "agent",
    );
    const migratedOwnerMessages = await repository.listGmailMessages(
      agentId,
      "google",
      { maxResults: 10 },
      "owner",
    );
    const agentMessages = await repository.listGmailMessages(
      agentId,
      "google",
      { maxResults: 10 },
      "agent",
    );
    const agentCalendarSync = await repository.getCalendarSyncState(
      agentId,
      "google",
      "primary",
      "agent",
    );
    const agentGmailSync = await repository.getGmailSyncState(
      agentId,
      "google",
      "primary",
      "agent",
    );

    expect(migratedOwnerEvents).toHaveLength(1);
    expect(agentEvents).toHaveLength(1);
    expect(migratedOwnerEvents[0]?.externalId).toBe("shared-external-event");
    expect(agentEvents[0]?.externalId).toBe("shared-external-event");
    expect(migratedOwnerEvents[0]?.title).toBe("Legacy owner event");
    expect(agentEvents[0]?.title).toBe("Agent side event");
    expect(migratedOwnerEvents[0]?.id).not.toBe(agentEvents[0]?.id);
    expect(migratedOwnerMessages).toHaveLength(1);
    expect(agentMessages).toHaveLength(1);
    expect(migratedOwnerMessages[0]?.externalId).toBe(
      "shared-external-message",
    );
    expect(agentMessages[0]?.externalId).toBe("shared-external-message");
    expect(migratedOwnerMessages[0]?.subject).toBe("Legacy owner message");
    expect(agentMessages[0]?.subject).toBe("Agent side message");
    expect(migratedOwnerMessages[0]?.id).not.toBe(agentMessages[0]?.id);
    expect(agentCalendarSync?.side).toBe("agent");
    expect(agentGmailSync?.side).toBe("agent");

    sqlite.close();
  });
});
