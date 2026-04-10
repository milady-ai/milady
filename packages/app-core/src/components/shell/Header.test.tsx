// @vitest-environment jsdom

import * as AppContext from "@miladyai/app-core/state";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

// Mock the AppContext
vi.mock("@miladyai/app-core/state", () => ({
  useApp: vi.fn(),
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
  LANGUAGE_DROPDOWN_TRIGGER_CLASSNAME:
    "!h-11 !min-h-[44px] !min-w-[44px] !rounded-xl !px-3.5 sm:!px-3.5 leading-none",
  LanguageDropdown: () => React.createElement("div", null, "LanguageDropdown"),
  ThemeToggle: () => React.createElement("div", null, "ThemeToggle"),
}));

vi.mock("@miladyai/ui", () => ({
  IconTooltip: ({
    children,
  }: {
    children: React.ReactNode;
    content?: string;
    side?: string;
  }) => React.createElement("div", null, children),
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
  Dialog: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DialogContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }) =>
    React.createElement("div", props, children),
  DialogHeader: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", props, children),
  DialogTitle: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", props, children),
  DialogDescription: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", props, children),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", null, "⚠"),
  CircleUserRound: () => React.createElement("span", null, "👤"),
  Bug: () => React.createElement("span", null, "🐛"),
  CircleDollarSign: () => React.createElement("span", null, "💰"),
  MessageCirclePlus: () => React.createElement("span", null, "💬"),
  Menu: () => React.createElement("span", null, "☰"),
  Monitor: () => React.createElement("span", null, "🖥"),
  PencilLine: () => React.createElement("span", null, "✏"),
  Smartphone: () => React.createElement("span", null, "📱"),
  UserRound: () => React.createElement("span", null, "👤"),
  Users: () => React.createElement("span", null, "👥"),
  Volume2: () => React.createElement("span", null, "🔊"),
  VolumeX: () => React.createElement("span", null, "🔇"),
  X: () => React.createElement("span", null, "✕"),
}));

describe("Header", () => {
  it("hides the shell toggle pill outside the companion overlay", async () => {
    // Mock the useApp hook return value
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: false,
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }
    const root = (testRenderer as ReactTestRenderer).root;

    // Shell toggle pill should NOT be rendered — it only lives in the companion header
    expect(
      root.findAll((node) => node.props["data-testid"] === "ui-shell-toggle"),
    ).toHaveLength(0);
    expect(mockUseApp.setState).toHaveBeenCalledWith("chatMode", "power");
  });

  it("keeps mobile-left controls inside the right header control cluster", async () => {
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: true,
      elizaCloudConnected: true,
      elizaCloudCredits: 12.34,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
      chatAgentVoiceMuted: false,
      handleNewConversation: vi.fn(),
      handleSaveCharacter: vi.fn(),
      characterSaving: false,
      characterSaveSuccess: false,
      conversationMessages: [],
      chatLastUsage: null,
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(
        <Header
          mobileLeft={
            <button data-testid="mobile-left-stub" type="button">
              Chats
            </button>
          }
        />,
      );
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    const root = (testRenderer as ReactTestRenderer).root;
    const rightControls = root.findByProps({
      "data-testid": "shell-header-right-controls",
    });
    expect(
      root.findAllByProps({
        "data-testid": "mobile-left-stub",
      }),
    ).toHaveLength(1);
    expect(
      rightControls.findByProps({
        "data-testid": "mobile-left-stub",
      }),
    ).toBeDefined();
  });

  it("shows nav tabs on the character view with cloud status visible", async () => {
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: true,
      elizaCloudConnected: true,
      elizaCloudCredits: 12.34,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "https://example.com/topup",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "character",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header transparent />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    // Header is always in desktop mode — nav tabs are always visible
    const root = (testRenderer as ReactTestRenderer).root;
    root.findByType("header");
    // Cloud status is visible on character tab when connected
    expect(
      root.findAllByProps({ "data-testid": "header-cloud-status" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("always shows navigation tabs (header is always desktop mode)", async () => {
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: false,
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    // Nav tabs should always be visible — header is always in desktop mode
    expect(
      (testRenderer as ReactTestRenderer).root.findAll(
        (node) => node.props["data-testid"] === "header-nav-button-chat",
      ),
    ).not.toHaveLength(0);
  });

  it("keeps desktop shell transparent when the header is explicitly transparent", async () => {
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: false,
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header transparent />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    const glassShell = (testRenderer as ReactTestRenderer).root.findByProps({
      "data-testid": "header-glass-shell",
    });
    expect(String(glassShell.props.className)).toContain("bg-transparent");
    expect(String(glassShell.props.className)).toContain("backdrop-blur-none");
    expect(
      (testRenderer as ReactTestRenderer).root.findAll(
        (node) => node.props["data-testid"] === "header-nav-button-chat",
      ),
    ).not.toHaveLength(0);
  });

  it("shows nothing when cloud is disconnected", async () => {
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: false,
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    expect(
      (testRenderer as ReactTestRenderer).root.findAllByProps({
        "data-testid": "header-cloud-status",
      }),
    ).toHaveLength(0);
  });

  it("routes cloud credits to settings billing instead of an external link", async () => {
    const setTab = vi.fn();
    const setState = vi.fn();
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: true,
      elizaCloudConnected: true,
      elizaCloudCredits: 12.34,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "https://example.com/topup",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab,
      setState,
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    const creditButton = (testRenderer as ReactTestRenderer).root.findByProps({
      "data-testid": "header-cloud-status",
    });

    await act(async () => {
      creditButton.props.onClick();
    });

    expect(setState).toHaveBeenCalledWith("cloudDashboardView", "billing");
    expect(setTab).toHaveBeenCalledWith("settings");
  });

  it("renders a compact balance pill in the main header", async () => {
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: true,
      elizaCloudConnected: true,
      elizaCloudCredits: 12.34,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: null,
      elizaCloudTopUpUrl: "https://example.com/topup",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }

    const root = (testRenderer as ReactTestRenderer).root;
    const cloudStatus = root.findByProps({
      "data-testid": "header-cloud-status",
    });
    expect(cloudStatus.props["data-status"]).toBe("regular-credits");
    expect(String(cloudStatus.props.className)).toContain("font-mono");
    expect(cloudStatus.props.style.backgroundColor).toBe("var(--accent)");
    expect(
      cloudStatus.findAll(
        (node) =>
          typeof node.children?.[0] === "string" &&
          node.children[0] === "$12.3",
      ),
    ).toHaveLength(1);
  });

  it("uses warning and error labels instead of connected copy", async () => {
    const warningAppState = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Eliza" },
      elizaCloudEnabled: true,
      elizaCloudConnected: true,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: "Upstream timeout",
      elizaCloudTopUpUrl: "https://example.com/topup",
      lifecycleBusy: false,
      lifecycleAction: null,
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(warningAppState);

    let warningRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      warningRenderer = create(<Header />);
    });
    if (!warningRenderer) {
      throw new Error("Failed to render Header");
    }

    const warningBadge = (
      warningRenderer as ReactTestRenderer
    ).root.findByProps({
      "data-testid": "header-cloud-status",
    });
    expect(warningBadge.props["data-status"]).toBe("warning");
    expect(
      warningBadge.findAll(
        (node) =>
          typeof node.children?.[0] === "string" &&
          node.children[0] === "logsview.Warn",
      ),
    ).toHaveLength(1);

    const errorAppState = {
      ...warningAppState,
      elizaCloudCreditsError: null,
      elizaCloudAuthRejected: true,
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(errorAppState);

    let errorRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      errorRenderer = create(<Header />);
    });
    if (!errorRenderer) {
      throw new Error("Failed to render Header");
    }

    const errorBadge = (errorRenderer as ReactTestRenderer).root.findByProps({
      "data-testid": "header-cloud-status",
    });
    expect(errorBadge.props["data-status"]).toBe("error");
    expect(
      errorBadge.findAll(
        (node) =>
          typeof node.children?.[0] === "string" &&
          node.children[0] === "logsview.Error",
      ),
    ).toHaveLength(1);
  });

  it("keeps desktop header chrome transparent so companion glass stays scoped", async () => {
    const mockUseApp = {
      elizaCloudEnabled: false,
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsCritical: false,
      elizaCloudCreditsLow: false,
      elizaCloudAuthRejected: false,
      elizaCloudCreditsError: false,
      chatAgentVoiceMuted: false,
      handleNewConversation: vi.fn(),
      handleSaveCharacter: vi.fn(),
      characterSaving: false,
      characterSaveSuccess: false,
      conversationMessages: [],
      chatLastUsage: null,
      t: (k: string) => k,
      handleStart: vi.fn(),
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      plugins: [],
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      uiShellMode: "native",
      switchShellView: vi.fn(),
    };
    // @ts-expect-error - test uses a narrowed subset
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);
    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = create(<Header />);
    });
    const glassShell = tree?.root.findByProps({
      "data-testid": "header-glass-shell",
    });
    expect(String(glassShell?.props.className)).toContain("bg-transparent");
    expect(String(glassShell?.props.className)).toContain("backdrop-blur-none");
  });
});
