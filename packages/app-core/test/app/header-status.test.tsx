// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
  useMediaQuery: () => false,
}));

vi.mock("@miladyai/app-core/navigation", () => ({
  getTabGroups: () => [
    {
      label: "Chat",
      tabs: ["chat"],
      icon: () => React.createElement("span", null, "💬"),
      description: "Chat",
    },
  ],
}));

vi.mock("@miladyai/app-core/components", () => ({
  LanguageDropdown: () => React.createElement("div", null, "LanguageDropdown"),
  ThemeToggle: () => React.createElement("div", null, "ThemeToggle"),
}));

vi.mock("@miladyai/ui", () => ({
  Button: React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
      React.createElement("button", { ...props, ref }),
  ),
  IconTooltip: ({
    children,
  }: {
    children: React.ReactNode;
    content?: string;
    side?: string;
  }) => React.createElement("div", null, children),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", null, "alert"),
  CircleUserRound: () => React.createElement("span", null, "user"),
  Bug: () => React.createElement("span", null, "bug"),
  CircleDollarSign: () => React.createElement("span", null, "dollar"),
  Menu: () => React.createElement("span", null, "menu"),
  MessageCirclePlus: () => React.createElement("span", null, "msg"),
  Monitor: () => React.createElement("span", null, "monitor"),
  PencilLine: () => React.createElement("span", null, "pencil"),
  Smartphone: () => React.createElement("span", null, "phone"),
  UserRound: () => React.createElement("span", null, "user"),
  Users: () => React.createElement("span", null, "users"),
  Volume2: () => React.createElement("span", null, "vol"),
  VolumeX: () => React.createElement("span", null, "mute"),
  X: () => React.createElement("span", null, "x"),
}));

import { Header } from "../../src/components/Header";

let baseAppState: Record<string, unknown>;

describe("header status", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    baseAppState = {
      t: (k: string) => k,
      agentStatus: {
        state: "running",
        agentName: "Eliza",
        model: undefined,
        startedAt: undefined,
        uptime: undefined,
      },
      elizaCloudEnabled: false,
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudTopUpUrl: "",
      walletAddresses: null,
      lifecycleBusy: false,
      lifecycleAction: null,

      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      openCommandPalette: vi.fn(),
      copyToClipboard: vi.fn(),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      registryStatus: null,
      plugins: [],
      uiShellMode: "native",
      setUiShellMode: vi.fn(),
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
    };
    mockUseApp.mockReturnValue(baseAppState);
  });

  it("renders shell toggle button", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });
    expect(tree).toBeDefined();
    const shellToggle = tree?.root.findByProps({
      "data-testid": "ui-shell-toggle",
    });
    expect(shellToggle).toBeDefined();
    expect(baseAppState.setState).toHaveBeenCalledWith("chatMode", "power");
  });

  it("renders language and theme controls", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });
    expect(tree).toBeDefined();
    const controls = tree?.root.findAll(
      (node) =>
        typeof node.children?.[0] === "string" &&
        (node.children[0] === "LanguageDropdown" ||
          node.children[0] === "ThemeToggle"),
    );
    expect(controls?.length).toBeGreaterThan(0);
  });

});
