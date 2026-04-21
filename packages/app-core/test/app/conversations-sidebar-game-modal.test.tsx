// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ConversationStub = {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
};

type SidebarContextStub = {
  conversations: ConversationStub[];
  activeConversationId: string | null;
  activeInboxChat: { id: string; source: string; title: string } | null;
  unreadConversations: Set<string>;
  handleStartDraftConversation: () => Promise<void>;
  handleNewConversation: () => Promise<void>;
  handleSelectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;
  suggestConversationTitle: (id: string) => Promise<string | null>;
  setState: (key: string, value: unknown) => void;
  uiLanguage: "en" | "zh-CN";
  t: (k: string, vars?: { defaultValue?: string }) => string;
};

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
    Dialog: ({
      open,
      children,
    }: {
      open?: boolean;
      children?: React.ReactNode;
    }) =>
      open
        ? React.createElement(
            "div",
            { "data-testid": "radix-dialog-stub" },
            children,
          )
        : null,
    DialogContent: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    DialogHeader: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogTitle: ({ children, ...props }: React.ComponentProps<"h2">) =>
      React.createElement("h2", props, children),
    DialogFooter: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogDescription: ({ children, ...props }: React.ComponentProps<"p">) =>
      React.createElement("p", props, children),
    Input: React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
      (props, ref) => React.createElement("input", { ...props, ref }),
    ),
    Label: ({ children, ...props }: React.ComponentProps<"label">) =>
      React.createElement("label", props, children),
    TooltipProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Tooltip: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    TooltipTrigger: ({
      children,
      asChild,
      ...props
    }: { children?: React.ReactNode; asChild?: boolean } & Record<
      string,
      unknown
    >) =>
      asChild
        ? (children as React.ReactElement)
        : React.createElement("span", props, children),
    TooltipContent: () => null,
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
    ChatConversationRenameDialog: ({
      open,
      title,
      description,
      inputLabel,
      value,
      onChange,
      onClose,
      onSave,
      onSuggest,
      saveDisabled,
      saveLabel,
      suggestDisabled,
      suggestLabel,
    }: {
      open?: boolean;
      title?: React.ReactNode;
      description?: React.ReactNode;
      inputLabel?: React.ReactNode;
      value: string;
      onChange: (value: string) => void;
      onClose: () => void;
      onSave: () => void;
      onSuggest: () => void;
      saveDisabled?: boolean;
      saveLabel?: React.ReactNode;
      suggestDisabled?: boolean;
      suggestLabel?: React.ReactNode;
    }) =>
      open
        ? React.createElement(
            "div",
            { "data-testid": "conv-rename-dialog" },
            React.createElement("h2", null, title),
            React.createElement("p", null, description),
            React.createElement("label", null, inputLabel),
            React.createElement("input", {
              "data-testid": "conv-rename-input",
              value,
              onChange: (event: { target: { value: string } }) =>
                onChange(event.target.value),
            }),
            React.createElement(
              "button",
              {
                type: "button",
                "data-testid": "conv-rename-suggest",
                disabled: suggestDisabled,
                onClick: onSuggest,
              },
              suggestLabel,
            ),
            React.createElement(
              "button",
              {
                type: "button",
                "data-testid": "conv-rename-save",
                disabled: saveDisabled,
                onClick: onSave,
              },
              saveLabel,
            ),
            React.createElement(
              "button",
              {
                type: "button",
                "data-testid": "conv-rename-cancel",
                onClick: onClose,
              },
              "cancel",
            ),
          )
        : null,
  };
});

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getInboxChats: vi.fn(async () => ({ chats: [] })),
    getAgentSelfStatus: vi.fn(async () => null),
    onWsEvent: vi.fn(() => () => {}),
  },
}));

import { textOf } from "../../../../test/helpers/react-test";
import { ConversationsSidebar } from "../../src/components/conversations/ConversationsSidebar";

function createContext(
  overrides?: Partial<SidebarContextStub>,
): SidebarContextStub {
  const now = Date.now();
  return {
    t: (k: string, vars?: { defaultValue?: string }) => vars?.defaultValue ?? k,
    conversations: [
      {
        id: "conv-1",
        title: "First room",
        roomId: "room-1",
        createdAt: new Date(now - 30_000).toISOString(),
        updatedAt: new Date(now - 30_000).toISOString(),
      },
      {
        id: "conv-2",
        title: "Newest room",
        roomId: "room-2",
        createdAt: new Date(now - 10_000).toISOString(),
        updatedAt: new Date(now - 10_000).toISOString(),
      },
    ],
    activeConversationId: "conv-2",
    activeInboxChat: null,
    unreadConversations: new Set(["conv-1"]),
    handleStartDraftConversation: vi.fn(async () => {}),
    handleNewConversation: vi.fn(async () => {}),
    handleSelectConversation: vi.fn(async () => {}),
    handleDeleteConversation: vi.fn(async () => {}),
    handleRenameConversation: vi.fn(async () => {}),
    suggestConversationTitle: vi.fn(async () => null),
    setState: vi.fn(),
    uiLanguage: "en",
    ...overrides,
  };
}

describe("ConversationsSidebar game-modal variant", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    vi.clearAllMocks();
    window.setInterval = globalThis.setInterval.bind(globalThis);
    window.clearInterval = globalThis.clearInterval.bind(globalThis);
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  });

  it("renders game-modal list and keeps new/select/delete actions working", async () => {
    const handleStartDraftConversation = vi.fn(async () => {});
    const handleNewConversation = vi.fn(async () => {});
    const handleSelectConversation = vi.fn(async () => {});
    const handleDeleteConversation = vi.fn(async () => {});

    mockUseApp.mockReturnValue(
      createContext({
        handleStartDraftConversation,
        handleNewConversation,
        handleSelectConversation,
        handleDeleteConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const roots = tree?.root.findAll(
      (node) =>
        node.props["data-testid"] === "conversations-sidebar" &&
        node.props["data-variant"] === "game-modal",
    );
    expect(roots.length).toBe(1);

    const newChatButtons = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        textOf(node).trim() === "conversations.newChat",
    );
    expect(newChatButtons.length).toBe(1);
    await act(async () => {
      newChatButtons[0].props.onClick();
    });
    expect(handleNewConversation).toHaveBeenCalledTimes(1);
    expect(handleStartDraftConversation).not.toHaveBeenCalled();

    const convItems = tree?.root.findAll(
      (node) =>
        node.props["data-testid"] === "conv-item" &&
        typeof node.type !== "function",
    );
    expect(convItems.length).toBe(2);

    const selectBtn = convItems[1].find(
      (node) =>
        node.type === "button" &&
        String(node.props.className).includes("flex-1"),
    );
    expect(String(selectBtn.props.className)).toContain("w-full");
    expect(String(selectBtn.props.className)).toContain("!text-left");
    const title = selectBtn.find(
      (node) => node.type === "span" && textOf(node).trim() === "First room",
    );
    expect(String(title.props.className)).toContain("block");
    expect(String(title.props.className)).toContain("text-left");
    await act(async () => {
      selectBtn.props.onClick();
    });
    expect(handleSelectConversation).toHaveBeenCalledWith("conv-1");

    const rowTrigger = tree?.root.findAllByProps({
      "data-testid": "conv-select",
    })[0];
    await act(async () => {
      rowTrigger.props.onContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 32,
        clientY: 48,
      });
    });

    const deleteMenuItem = tree?.root.findByProps({
      "data-testid": "conv-menu-delete",
    });
    await act(async () => {
      deleteMenuItem.props.onClick();
    });

    const confirmYes = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        textOf(node).trim() === "conversations.deleteYes",
    );
    expect(confirmYes.length).toBe(1);
    await act(async () => {
      confirmYes[0].props.onClick();
    });
    expect(handleDeleteConversation).toHaveBeenCalledWith("conv-2");
  });

  it("renders a Search chats input in game-modal and filters rows", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const searchInput = tree?.root.find(
      (node) =>
        node.type === "input" && node.props["aria-label"] === "Search chats",
    );
    expect(searchInput).toBeDefined();

    await act(async () => {
      searchInput?.props.onChange({ target: { value: "newest" } });
    });

    const visibleRows = tree?.root.findAllByProps({
      "data-testid": "conv-item",
    });
    expect(visibleRows).toHaveLength(1);
    expect(JSON.stringify(tree?.toJSON())).toContain("Newest room");
    expect(JSON.stringify(tree?.toJSON())).not.toContain("First room");
  });

  it("opens delete confirm from row X control then deletes", async () => {
    const handleDeleteConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleDeleteConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const deleteControls = tree?.root.findAll(
      (node) =>
        node.props["data-testid"] === "conv-delete" &&
        typeof node.type === "string",
    );
    expect(deleteControls?.length).toBe(2);

    await act(async () => {
      deleteControls?.[0].props.onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });

    const confirmYes = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        textOf(node).trim() === "conversations.deleteYes",
    );
    expect(confirmYes.length).toBe(1);
    await act(async () => {
      confirmYes[0].props.onClick();
    });
    expect(handleDeleteConversation).toHaveBeenCalledWith("conv-2");
  });

  it("supports inline rename in game-modal variant", async () => {
    const handleRenameConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleRenameConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const rowTrigger = tree?.root.findAllByProps({
      "data-testid": "conv-select",
    })[0];
    await act(async () => {
      rowTrigger.props.onContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 24,
        clientY: 40,
      });
    });

    const editMenuItem = tree?.root.findByProps({
      "data-testid": "conv-menu-edit",
    });
    await act(async () => {
      editMenuItem.props.onClick();
    });

    const input = tree?.root.findByProps({
      "data-testid": "conv-rename-input",
    });
    expect(input).toBeTruthy();

    await act(async () => {
      input?.props.onChange({ target: { value: "Renamed room" } });
    });
    const saveBtn = tree?.root.findByProps({
      "data-testid": "conv-rename-save",
    });
    await act(async () => {
      saveBtn.props.onClick();
      await Promise.resolve();
    });

    expect(handleRenameConversation).toHaveBeenCalledWith(
      "conv-2",
      "Renamed room",
    );
  });

  it("fills title from suggest then saves", async () => {
    const handleRenameConversation = vi.fn(async () => {});
    const suggestConversationTitle = vi.fn(async () => "LLM suggested title");
    mockUseApp.mockReturnValue(
      createContext({
        handleRenameConversation,
        suggestConversationTitle,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const renameBtn = tree?.root.findAllByProps({
      "data-testid": "conv-rename",
    })[0];
    await act(async () => {
      renameBtn.props.onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });

    const suggestBtn = tree?.root.findByProps({
      "data-testid": "conv-rename-suggest",
    });
    await act(async () => {
      suggestBtn.props.onClick();
      await Promise.resolve();
    });

    expect(suggestConversationTitle).toHaveBeenCalledWith("conv-2");

    const saveBtn = tree?.root.findByProps({
      "data-testid": "conv-rename-save",
    });
    await act(async () => {
      saveBtn.props.onClick();
      await Promise.resolve();
    });

    expect(handleRenameConversation).toHaveBeenCalledWith(
      "conv-2",
      "LLM suggested title",
    );
  });

  it("shows the unread count badge in game-modal when conversations are unread", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const content = textOf(tree?.root);
    expect(content).toContain("Newest room");
    expect(content).toContain("First room");
    expect(
      tree?.root.findAll(
        (node) =>
          node.type === "span" &&
          typeof node.props.className === "string" &&
          node.props.className.includes("bg-accent") &&
          node.props.className.includes("animate-pulse"),
      ),
    ).toHaveLength(1);
  });
});
