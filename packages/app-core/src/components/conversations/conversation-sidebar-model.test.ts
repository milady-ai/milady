import { describe, expect, it } from "vitest";

import type { Conversation } from "../../api/client-types-chat";
import {
  ALL_CONNECTORS_SOURCE_SCOPE,
  ALL_WORLDS_SCOPE,
  buildConversationsSidebarModel,
  type InboxChatSidebarRow,
  MILADY_SOURCE_SCOPE,
} from "./conversation-sidebar-model";

const NOW = "2026-04-09T12:00:00.000Z";

function t(
  key: string,
  options?: { defaultValue?: string } & Record<string, unknown>,
) {
  return options?.defaultValue ?? key;
}

function createConversation(
  overrides: Partial<Conversation> & Pick<Conversation, "id" | "title">,
): Conversation {
  return {
    roomId: `room-${overrides.id}`,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createInboxChat(
  overrides: Partial<InboxChatSidebarRow> &
    Pick<InboxChatSidebarRow, "id" | "source" | "title" | "worldLabel">,
): InboxChatSidebarRow {
  return {
    lastMessageAt: Date.parse(NOW),
    ...overrides,
  };
}

describe("buildConversationsSidebarModel", () => {
  it("defaults to the Milady group and keeps internal chats separate", () => {
    const model = buildConversationsSidebarModel({
      conversations: [
        createConversation({ id: "conv-1", title: "Internal A" }),
        createConversation({
          id: "conv-2",
          title: "Internal B",
          updatedAt: "2026-04-09T13:00:00.000Z",
        }),
      ],
      inboxChats: [
        createInboxChat({
          id: "chat-1",
          source: "discord",
          title: "Connector Chat",
          worldId: "world-1",
          worldLabel: "Milady Server",
        }),
      ],
      searchQuery: "",
      sourceScope: MILADY_SOURCE_SCOPE,
      t,
      worldScope: ALL_WORLDS_SCOPE,
    });

    expect(model.sourceScope).toBe(MILADY_SOURCE_SCOPE);
    expect(model.showWorldFilter).toBe(false);
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]).toMatchObject({
      key: MILADY_SOURCE_SCOPE,
      label: "Milady",
      count: 2,
    });
    expect(model.rows.map((row) => row.title)).toEqual([
      "Internal B",
      "Internal A",
    ]);
    expect(model.sourceOptions.map((option) => option.value)).toEqual([
      MILADY_SOURCE_SCOPE,
      ALL_CONNECTORS_SOURCE_SCOPE,
      "discord",
    ]);
  });

  it("builds world options for a specific connector and filters by the selected world", () => {
    const model = buildConversationsSidebarModel({
      conversations: [],
      inboxChats: [
        createInboxChat({
          id: "discord-a",
          source: "discord",
          title: "Ops",
          worldId: "world-ops",
          worldLabel: "Ops Server",
          lastMessageAt: Date.parse("2026-04-09T13:00:00.000Z"),
        }),
        createInboxChat({
          id: "discord-b",
          source: "discord",
          title: "Dev",
          worldId: "world-dev",
          worldLabel: "Dev Server",
          lastMessageAt: Date.parse("2026-04-09T12:00:00.000Z"),
        }),
        createInboxChat({
          id: "telegram-a",
          source: "telegram",
          title: "Telegram Chat",
          worldId: "world-tg",
          worldLabel: "Telegram Friends",
        }),
      ],
      searchQuery: "",
      sourceScope: "discord",
      t,
      worldScope: "world-dev",
    });

    expect(model.sourceScope).toBe("discord");
    expect(model.showWorldFilter).toBe(true);
    expect(model.worldOptions.map((option) => option.value)).toEqual([
      ALL_WORLDS_SCOPE,
      "world-dev",
      "world-ops",
    ]);
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]).toMatchObject({
      label: "Dev Server",
      count: 1,
    });
    expect(model.rows.map((row) => row.title)).toEqual(["Dev"]);
  });

  it("groups all connector chats by connector and world when browsing everything external", () => {
    const model = buildConversationsSidebarModel({
      conversations: [],
      inboxChats: [
        createInboxChat({
          id: "discord-a",
          source: "discord",
          title: "Ops 1",
          worldId: "world-ops",
          worldLabel: "Ops Server",
          lastMessageAt: Date.parse("2026-04-09T14:00:00.000Z"),
        }),
        createInboxChat({
          id: "discord-b",
          source: "discord",
          title: "Ops 2",
          worldId: "world-ops",
          worldLabel: "Ops Server",
          lastMessageAt: Date.parse("2026-04-09T13:00:00.000Z"),
        }),
        createInboxChat({
          id: "telegram-a",
          source: "telegram",
          title: "Friends",
          worldId: "world-friends",
          worldLabel: "Friends",
          lastMessageAt: Date.parse("2026-04-09T12:00:00.000Z"),
        }),
      ],
      searchQuery: "",
      sourceScope: ALL_CONNECTORS_SOURCE_SCOPE,
      t,
      worldScope: ALL_WORLDS_SCOPE,
    });

    expect(model.showWorldFilter).toBe(false);
    expect(model.sections).toHaveLength(2);
    expect(model.sections.map((section) => section.label)).toEqual([
      "Discord • Ops Server",
      "Telegram • Friends",
    ]);
    expect(model.sections[0]?.rows.map((row) => row.title)).toEqual([
      "Ops 1",
      "Ops 2",
    ]);
  });
});
