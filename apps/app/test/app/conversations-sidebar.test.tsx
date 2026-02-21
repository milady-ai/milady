import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

type Conversation = {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
};

function createConversation(id: string, title: string): Conversation {
  return {
    id,
    title,
    roomId: `room-${id}`,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

function createContext(overrides?: Record<string, unknown>) {
  return {
    conversations: [createConversation("conv-1", "Important chat")],
    activeConversationId: "conv-1",
    unreadConversations: new Set<string>(),
    handleNewConversation: vi.fn(),
    handleSelectConversation: vi.fn(async () => {}),
    handleDeleteConversation: vi.fn(async () => {}),
    handleRenameConversation: vi.fn(async () => {}),
    ...(overrides ?? {}),
  };
}

describe("ConversationsSidebar delete confirmation", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    Object.assign(globalThis, {
      window: { confirm: vi.fn() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not delete when confirmation is canceled", async () => {
    const ctx = createContext();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteButton = tree.root.findByProps({ "data-testid": "conv-delete" });
    await act(async () => {
      deleteButton.props.onClick({ stopPropagation: vi.fn() });
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete conversation "Important chat"? This cannot be undone.',
    );
    expect(ctx.handleDeleteConversation).not.toHaveBeenCalled();
  });

  it("deletes when confirmation is accepted", async () => {
    const ctx = createContext();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteButton = tree.root.findByProps({ "data-testid": "conv-delete" });
    await act(async () => {
      deleteButton.props.onClick({ stopPropagation: vi.fn() });
      await Promise.resolve();
    });

    expect(ctx.handleDeleteConversation).toHaveBeenCalledTimes(1);
    expect(ctx.handleDeleteConversation).toHaveBeenCalledWith("conv-1");
  });
});
