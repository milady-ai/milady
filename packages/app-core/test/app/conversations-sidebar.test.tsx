import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: (index: number) => `mock-vrm-${index}.png`,
  VRM_COUNT: 8,
}));

vi.mock("@miladyai/ui", async () => {
  const React = await import("react");
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    DropdownMenuContent: ({
      children,
      ...props
    }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    DropdownMenuItem: ({
      children,
      onClick,
      ...props
    }: React.ComponentProps<"button">) =>
      React.createElement("button", { ...props, onClick }, children),
    Select: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectTrigger: ({
      children,
      ...props
    }: React.ComponentProps<"button">) =>
      React.createElement("button", { type: "button", ...props }, children),
    SelectValue: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectItem: ({
      children,
      value,
      ...props
    }: React.ComponentProps<"option"> & { value: string }) =>
      React.createElement("option", { ...props, value }, children),
  };
});

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getInboxChats: vi.fn(async () => ({ chats: [] })),
  },
}));

import { ConversationsSidebar } from "../../src/components/conversations/ConversationsSidebar";

type ConversationStub = {
  id: string;
  title: string;
  updatedAt: string;
};

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    t: (k: string, vars?: { defaultValue?: string }) => vars?.defaultValue ?? k,
    conversations: [
      {
        id: "conv-1",
        title: "First conversation",
        updatedAt: "2026-02-19T00:00:00.000Z",
      } satisfies ConversationStub,
    ],
    activeConversationId: "conv-1",
    activeInboxChat: null,
    unreadConversations: new Set<string>(),
    handleStartDraftConversation: vi.fn(async () => {}),
    handleNewConversation: vi.fn(),
    handleSelectConversation: vi.fn(async () => {}),
    handleDeleteConversation: vi.fn(async () => {}),
    handleRenameConversation: vi.fn(async () => {}),
    suggestConversationTitle: vi.fn(async () => null),
    setState: vi.fn(),
    uiLanguage: "en",
    ...overrides,
  };
}

function findButtonByText(
  tree: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  return tree.root.find(
    (node) =>
      (node.type === "button" || typeof node.type === "function") &&
      node.children.some(
        (child) => typeof child === "string" && child === label,
      ),
  );
}

describe("ConversationsSidebar", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    if (typeof document !== "undefined") {
      document.addEventListener ??= vi.fn();
      document.removeEventListener ??= vi.fn();
    }
    window.setInterval = globalThis.setInterval.bind(globalThis);
    window.clearInterval = globalThis.clearInterval.bind(globalThis);
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  });

  it("requires explicit confirmation before deleting", async () => {
    const handleDeleteConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(createContext({ handleDeleteConversation }));

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const rowTrigger = tree.root.findByProps({
      "data-testid": "conv-select",
    });
    await act(async () => {
      rowTrigger.props.onContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 40,
        clientY: 60,
      });
    });

    expect(handleDeleteConversation).not.toHaveBeenCalled();
    const deleteMenuItem = tree.root.findByProps({
      "data-testid": "conv-menu-delete",
    });
    await act(async () => {
      deleteMenuItem.props.onClick();
    });
    expect(findButtonByText(tree, "conversations.deleteYes")).toBeDefined();
    expect(findButtonByText(tree, "conversations.deleteNo")).toBeDefined();
  });

  it("deletes only after clicking Yes", async () => {
    const handleDeleteConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(createContext({ handleDeleteConversation }));

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const rowTrigger = tree.root.findByProps({
      "data-testid": "conv-select",
    });
    await act(async () => {
      rowTrigger.props.onContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 40,
        clientY: 60,
      });
    });

    const deleteMenuItem = tree.root.findByProps({
      "data-testid": "conv-menu-delete",
    });
    await act(async () => {
      deleteMenuItem.props.onClick();
    });

    const yesButton = findButtonByText(tree, "conversations.deleteYes");
    await act(async () => {
      yesButton.props.onClick();
      await Promise.resolve();
    });

    expect(handleDeleteConversation).toHaveBeenCalledTimes(1);
    expect(handleDeleteConversation).toHaveBeenCalledWith("conv-1");
  });

  it("calls handleNewConversation immediately when New Chat is clicked", async () => {
    const handleNewConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleNewConversation,
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const newChatButton = findButtonByText(tree, "conversations.newChat");
    await act(async () => {
      newChatButton.props.onClick();
    });

    expect(handleNewConversation).toHaveBeenCalledTimes(1);
  });

  it("shows the empty-state guidance when no conversations exist", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversations: [],
        activeConversationId: null,
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const content = JSON.stringify(tree.toJSON());
    expect(content).toContain("No Milady chats yet");
    expect(content).toContain("conversations.chats");
  });

  it("renders a Search chats input and filters the conversation list", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversations: [
          {
            id: "conv-1",
            title: "First conversation",
            updatedAt: "2026-02-19T00:00:00.000Z",
          } satisfies ConversationStub,
          {
            id: "conv-2",
            title: "Wallet planning",
            updatedAt: "2026-02-20T00:00:00.000Z",
          } satisfies ConversationStub,
        ],
        activeConversationId: "conv-2",
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const searchInput = tree.root.find(
      (node) =>
        node.type === "input" && node.props["aria-label"] === "Search chats",
    );
    expect(searchInput).toBeDefined();

    await act(async () => {
      searchInput.props.onChange({ target: { value: "wallet" } });
    });

    expect(
      tree.root.findAllByProps({ "data-testid": "conv-item" }),
    ).toHaveLength(1);
    expect(JSON.stringify(tree.toJSON())).toContain("Wallet planning");
    expect(JSON.stringify(tree.toJSON())).not.toContain("First conversation");
  });

  it("uses the rounded desktop shell treatment and shows unread count badges", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        unreadConversations: new Set(["conv-1", "conv-2"]),
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const sidebar = tree.root.findByProps({
      "data-testid": "conversations-sidebar",
    });
    expect(String(sidebar.props.className)).toContain("rounded-tr-[26px]");
    expect(String(sidebar.props.className)).toContain("rounded-l-none");
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "span" &&
          Array.isArray(node.children) &&
          node.children.includes("New"),
      ),
    ).toHaveLength(1);
  });

  it("collapses the desktop rail into a slim history bar", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const collapseButton = tree.root.findByProps({
      "data-testid": "chat-sidebar-collapse-toggle",
    });

    await act(async () => {
      collapseButton.props.onClick();
    });

    const sidebar = tree.root.findByProps({
      "data-testid": "conversations-sidebar",
    });
    expect(sidebar.props["data-collapsed"]).toBe(true);
    expect(String(sidebar.props.className)).toContain("w-[4.75rem]");
    expect(
      tree.root.findByProps({
        "data-testid": "chat-sidebar-expand-toggle",
      }),
    ).toBeTruthy();
  });

  it("renders a mobile close control and calls onClose", async () => {
    const onClose = vi.fn();
    mockUseApp.mockReturnValue(createContext());

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, {
          mobile: true,
          onClose,
        }),
      );
    });

    const closeButton = tree.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "conversations.closePanel",
    );
    const sidebar = tree.root.findByProps({
      "data-testid": "conversations-sidebar",
    });

    await act(async () => {
      closeButton.props.onClick();
    });

    expect(String(sidebar.props.className)).toContain("w-full");
    expect(closeButton.children).not.toContain("bugreportmodal.Times");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
