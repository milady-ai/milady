// @vitest-environment jsdom

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ShellHeaderControls } from "./ShellHeaderControls";

const { mockUseMediaQuery } = vi.hoisted(() => ({
  mockUseMediaQuery: vi.fn(),
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useMediaQuery: (...args: unknown[]) => mockUseMediaQuery(...args),
}));

vi.mock("@miladyai/app-core/components", () => ({
  LANGUAGE_DROPDOWN_TRIGGER_CLASSNAME:
    "!h-11 !min-h-[44px] !min-w-[44px] !rounded-xl !px-3.5 sm:!px-3.5 leading-none",
  LanguageDropdown: () =>
    React.createElement("div", { "data-testid": "language-dropdown-stub" }),
  ThemeToggle: () =>
    React.createElement("div", { "data-testid": "theme-toggle-stub" }),
}));

vi.mock("@miladyai/ui", () => ({
  Button: React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
      React.createElement("button", { ...props, ref }),
  ),
}));

vi.mock("lucide-react", () => ({
  Check: () => React.createElement("span", null, "check"),
  Loader2: () => React.createElement("span", null, "loader"),
  MessageCirclePlus: () => React.createElement("span", null, "new"),
  Monitor: () => React.createElement("span", null, "desktop"),
  PencilLine: () => React.createElement("span", null, "character"),
  Save: () => React.createElement("span", null, "save"),
  Smartphone: () => React.createElement("span", null, "phone"),
  UserRound: () => React.createElement("span", null, "companion"),
  Volume2: () => React.createElement("span", null, "voice"),
  VolumeX: () => React.createElement("span", null, "mute"),
}));

function renderControls(
  props: Partial<React.ComponentProps<typeof ShellHeaderControls>> = {},
) {
  let tree: ReactTestRenderer | null = null;
  act(() => {
    tree = create(
      <ShellHeaderControls
        activeShellView="companion"
        onShellViewChange={vi.fn()}
        uiLanguage="en"
        setUiLanguage={vi.fn()}
        uiTheme="dark"
        setUiTheme={vi.fn()}
        t={(key) => key}
        showCompanionControls
        chatAgentVoiceMuted={false}
        onToggleVoiceMute={vi.fn()}
        onNewChat={vi.fn()}
        rightExtras={React.createElement("div", {
          "data-testid": "right-extra-stub",
        })}
        {...props}
      />,
    );
  });

  if (!tree) {
    throw new Error("Expected ShellHeaderControls to render");
  }

  return tree;
}

describe("ShellHeaderControls", () => {
  it("keeps companion actions centered in the header on mobile", () => {
    mockUseMediaQuery.mockReturnValue(true);

    const tree = renderControls();
    const root = tree.root;
    const headerRoot = root.findByProps({ "data-no-camera-drag": "true" });
    const shellToggle = root.findByProps({ "data-testid": "ui-shell-toggle" });
    const companionControls = root.findByProps({
      "data-testid": "companion-header-chat-controls",
    });
    const rightControls = root.findByProps({
      "data-testid": "shell-header-right-controls",
    });
    const buttons = root.findAllByType("button");
    const voiceButton = buttons.find(
      (node) => node.props["aria-label"] === "companion.agentVoiceOn",
    );
    const newChatButton = buttons.find(
      (node) => node.props["aria-label"] === "companion.newChat",
    );

    expect(String(headerRoot.props.className)).toContain("flex");
    expect(String(headerRoot.props.className)).not.toContain("grid");
    expect(String(shellToggle.parent?.props.className)).toContain("shrink-0");
    expect(String(companionControls.props.className)).toContain(
      "justify-center",
    );
    expect(
      root.findAllByProps({
        "data-testid": "companion-header-mobile-actions",
      }),
    ).toHaveLength(0);
    expect(String(rightControls.props.className)).toContain("justify-end");
    expect(String(voiceButton?.props.className)).toContain("w-11");
    expect(String(voiceButton?.props.className)).not.toContain("gap-1.5");
    expect(String(newChatButton?.props.className)).toContain("w-11");
    expect(String(newChatButton?.props.className)).not.toContain("gap-1.5");
    expect(typeof voiceButton?.props.onPointerDown).toBe("function");
    expect(typeof newChatButton?.props.onPointerDown).toBe("function");
  });

  it("keeps the companion controls inline on desktop", () => {
    mockUseMediaQuery.mockReturnValue(false);

    const tree = renderControls();
    const root = tree.root;
    const companionControls = root.findByProps({
      "data-testid": "companion-header-chat-controls",
    });
    const rightControls = root.findByProps({
      "data-testid": "shell-header-right-controls",
    });

    expect(String(companionControls.parent?.props.className)).toContain(
      "flex-1",
    );
    expect(String(companionControls.children[0]?.props.className)).toContain(
      "inline-flex",
    );
    expect(String(rightControls.props.className)).toContain("shrink-0");
    expect(String(rightControls.props.className)).not.toContain("order-2");
  });

  it("splits companion desktop actions across the header shell", () => {
    mockUseMediaQuery.mockReturnValue(false);

    const tree = renderControls({
      activeShellView: "desktop",
      companionDesktopActionsLayout: "split",
      rightTrailingExtras: React.createElement("div", {
        "data-testid": "right-trailing-extra-stub",
      }),
    });
    const root = tree.root;
    const leftVoice = root.findByProps({
      "data-testid": "companion-header-desktop-voice",
    });
    const rightNewChat = root.findByProps({
      "data-testid": "companion-header-desktop-new-chat",
    });
    const rightControls = root.findByProps({
      "data-testid": "shell-header-right-controls",
    });
    const buttons = root.findAllByType("button");
    const voiceButton = buttons.find(
      (node) => node.props["aria-label"] === "companion.agentVoiceOn",
    );
    const newChatButton = buttons.find(
      (node) => node.props["aria-label"] === "companion.newChat",
    );

    expect(
      root.findAllByProps({
        "data-testid": "companion-header-chat-controls",
      }),
    ).toHaveLength(0);
    expect(String(leftVoice.props.className)).toContain("shrink-0");
    expect(String(rightNewChat.props.className)).toContain("shrink-0");
    expect(String(rightControls.props.className)).toContain("justify-end");
    expect(String(voiceButton?.props.className)).toContain("backdrop-blur-xl");
    expect(String(voiceButton?.props.className)).toContain("ring-white/6");
    expect(String(voiceButton?.props.className)).toContain("var(--card)_72%");
    expect(String(newChatButton?.props.className)).toContain(
      "backdrop-blur-xl",
    );
    expect(String(newChatButton?.props.className)).toContain("var(--bg)_44%");
    const rightChildrenIds = rightControls.children.map((child) =>
      typeof child === "object" && child !== null && "props" in child
        ? (child.props["data-testid"] ?? null)
        : null,
    );
    expect(rightChildrenIds).toEqual([
      "right-extra-stub",
      "companion-header-desktop-new-chat",
      "right-trailing-extra-stub",
      null,
      null,
    ]);
  });

  it("renders Save button instead of New Chat when onSave is provided", async () => {
    mockUseMediaQuery.mockReturnValue(false);
    const onSave = vi.fn();
    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = create(
        <ShellHeaderControls
          activeShellView="character"
          onShellViewChange={() => {}}
          uiLanguage="en"
          setUiLanguage={() => {}}
          uiTheme="dark"
          setUiTheme={() => {}}
          t={(k: string) => k}
          showCompanionControls
          onSave={onSave}
        />,
      );
    });
    const buttons = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "charactereditor.Save",
    );
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    // New Chat should NOT be present
    const newChatButtons = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "companion.newChat",
    );
    expect(newChatButtons.length).toBe(0);
  });
});
