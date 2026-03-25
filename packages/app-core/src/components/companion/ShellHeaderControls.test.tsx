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
  MessageCirclePlus: () => React.createElement("span", null, "new"),
  Monitor: () => React.createElement("span", null, "desktop"),
  PencilLine: () => React.createElement("span", null, "character"),
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
  it("pins compact companion actions to the mobile header edges", () => {
    mockUseMediaQuery.mockReturnValue(true);

    const tree = renderControls();
    const root = tree.root;
    const headerRoot = root.findByProps({ "data-no-camera-drag": "true" });
    const shellToggle = root.findByProps({ "data-testid": "ui-shell-toggle" });
    const mobileVoice = root.findByProps({
      "data-testid": "companion-header-mobile-voice",
    });
    const mobileNewChat = root.findByProps({
      "data-testid": "companion-header-mobile-new-chat",
    });
    const mobileActions = root.findByProps({
      "data-testid": "companion-header-mobile-actions",
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

    expect(String(headerRoot.props.className)).toContain("grid");
    expect(String(shellToggle.parent?.props.className)).toContain("row-start-1");
    expect(String(rightControls.props.className)).toContain("row-start-1");
    expect(String(mobileActions.props.className)).toContain("row-start-2");
    expect(String(mobileActions.props.className)).toContain("justify-between");
    expect(String(mobileVoice.props.className)).toContain("justify-start");
    expect(String(mobileNewChat.props.className)).toContain("justify-end");
    expect(String(voiceButton?.props.className)).toContain("rounded-xl");
    expect(String(voiceButton?.props.className)).toContain("pointer-events-auto");
    expect(String(newChatButton?.props.className)).toContain("rounded-xl");
    expect(String(newChatButton?.props.className)).toContain(
      "pointer-events-auto",
    );
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
    expect(String(voiceButton?.props.className)).toContain(
      "ring-white/6",
    );
    expect(String(newChatButton?.props.className)).toContain(
      "backdrop-blur-xl",
    );
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
});
