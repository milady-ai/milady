// @vitest-environment jsdom

import type { PluginInfo } from "@miladyai/app-core/api";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textOf as text } from "../../../../test/helpers/react-test";

const mockUseApp = vi.fn();
const mockOnWsEvent = vi.fn(() => () => {});
const mockHandlePluginToggle = vi.fn();
const mockLoadPlugins = vi.fn(async () => {});
const mockHandlePluginConfigSave = vi.fn(async () => {});
const mockSetActionNotice = vi.fn();
const mockSetState = vi.fn();
const mockTestPluginConnection = vi.fn(async () => ({
  success: true,
  durationMs: 12,
}));
const mockOpenExternalInvoke = vi.fn(async () => undefined);

type SidebarHeaderSearchProps = React.InputHTMLAttributes<HTMLInputElement> & {
  clearLabel?: string;
  loading?: boolean;
  onClear?: () => void;
};

let narrowViewport = false;
let originalMatchMedia: typeof window.matchMedia | undefined;

function translateTest(
  key: string,
  vars?: {
    defaultValue?: string;
  },
): string {
  if (key === "pluginsview.TestConnection") return "Test Connection";
  return vars?.defaultValue ?? key;
}

function ensureWindowGlobals() {
  const root = globalThis as typeof globalThis & {
    window?: typeof globalThis & Window;
    localStorage?: Storage;
  };
  if (!root.window) {
    Object.defineProperty(root, "window", {
      configurable: true,
      writable: true,
      value: root,
    });
  }
  if (!root.localStorage) {
    const store = new Map<string, string>();
    Object.defineProperty(root, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => {
          store.delete(key);
        },
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      } satisfies Storage,
    });
  }
  if (typeof root.window.open !== "function") {
    Object.defineProperty(root.window, "open", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
}

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    onWsEvent: (...args: unknown[]) => mockOnWsEvent(...args),
    installRegistryPlugin: vi.fn(),
    restartAndWait: vi.fn(),
    testPluginConnection: (...args: unknown[]) =>
      mockTestPluginConnection(...args),
  },
}));

vi.mock("@miladyai/ui", () => ({
  AdminDialog: {
    BodyScroll: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, ...props }, children),
    Content: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, ...props }, children),
    Footer: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, ...props }, children),
    Header: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, ...props }, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    MetaBadge: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", { className, ...props }, children),
    MonoMeta: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", { className, ...props }, children),
  },
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  EmptyState: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className, ...props }, children),
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => (open === false ? null : React.createElement("div", null, children)),
  DialogContent: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className, ...props }, children),
  DialogDescription: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className }, children),
  DialogFooter: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className }, children),
  DialogHeader: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className }, children),
  DialogTitle: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className }, children),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
  SidebarHeader: ({
    children,
    className,
    search,
    ...props
  }: React.PropsWithChildren<{
    className?: string;
    search?: SidebarHeaderSearchProps;
  }>) => {
    const { clearLabel, loading, onClear, ...inputProps } = search ?? {};
    void clearLabel;
    void loading;
    void onClear;

    return React.createElement(
      "div",
      { className, ...props },
      search ? React.createElement("input", inputProps) : null,
      children,
    );
  },
  SidebarSearchBar: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value?: string;
  }) => React.createElement("div", { "data-value": value }, children),
  SelectTrigger: ({
    children,
    className,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement(
      "button",
      { type: "button", className, ...props },
      children,
    ),
  SettingsControls: {
    SelectTrigger: ({
      children,
      className,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement(
        "button",
        { type: "button", className, ...props },
        children,
      ),
  },
  SelectValue: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
  SelectContent: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className }, children),
  SelectItem: ({
    children,
    value,
    className,
  }: React.HTMLAttributes<HTMLDivElement> & { value: string }) =>
    React.createElement("div", { className, "data-value": value }, children),
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    onCheckedChange?: (next: boolean) => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", {
      type: "button",
      "aria-pressed": checked,
      onClick: () => onCheckedChange?.(!checked),
      ...props,
    }),
  StatusBadge: ({
    label,
    className,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { label: string }) =>
    React.createElement("span", { className, ...props }, label),
  Sidebar: ({
    children,
    className,
    header,
    footer,
    testId,
  }: React.HTMLAttributes<HTMLElement> & {
    header?: React.ReactNode;
    footer?: React.ReactNode;
    testId?: string;
  }) =>
    React.createElement(
      "aside",
      {
        className: [
          "flex flex-col overflow-hidden border-border/34 backdrop-blur-md",
          className,
        ]
          .filter(Boolean)
          .join(" "),
        "data-testid": testId,
      },
      header,
      children,
      footer,
    ),
  SidebarScrollRegion: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className, ...props }, children),
  SidebarPanel: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className, ...props }, children),
  SidebarHeaderStack: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className, ...props }, children),
  SidebarContent: {
    EmptyState: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, ...props }, children),
    Item: ({
      children,
      className,
      as,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { as?: "button" | "div" }) =>
      React.createElement(as ?? "button", { className, ...props }, children),
    ItemBody: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", { className, ...props }, children),
    ItemDescription: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", { className, ...props }, children),
    ItemButton: ({
      children,
      className,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement(
        "button",
        { type: "button", className, ...props },
        children,
      ),
    RailItem: ({
      children,
      className,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement(
        "button",
        { type: "button", className, ...props },
        children,
      ),
    ItemIcon: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", { className, ...props }, children),
    ItemTitle: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", { className, ...props }, children),
  },
  PageLayout: ({
    children,
    className,
    contentClassName,
    contentHeader,
    contentInnerClassName,
    sidebar,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    contentClassName?: string;
    contentHeader?: React.ReactNode;
    contentInnerClassName?: string;
    sidebar: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      { className, ...props },
      sidebar,
      React.createElement(
        "main",
        {
          className:
            contentClassName ??
            "chat-native-scrollbar relative flex flex-1 min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-transparent px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:px-7 lg:pb-7 lg:pt-4",
        },
        React.createElement(
          "div",
          { className: contentInnerClassName },
          contentHeader,
          children,
        ),
      ),
    ),
  PageLayoutHeader: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", { className, ...props }, children),
  PagePanel: Object.assign(
    ({
      children,
      as,
      className,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { as?: "div" | "section" }) =>
      React.createElement(as ?? "div", { className, ...props }, children),
    {
      Empty: ({
        children,
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", { className, ...props }, children),
      Header: ({
        children,
        heading,
        description,
        actions,
        media,
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        heading?: React.ReactNode;
        description?: React.ReactNode;
        actions?: React.ReactNode;
        media?: React.ReactNode;
      }) =>
        React.createElement(
          "div",
          { className, ...props },
          media,
          heading,
          description,
          actions,
          children,
        ),
      Meta: ({
        children,
        className,
        ...props
      }: React.HTMLAttributes<HTMLSpanElement>) =>
        React.createElement("span", { className, ...props }, children),
      ContentArea: ({
        children,
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", { className, ...props }, children),
      CollapsibleSection: ({
        children,
        heading,
        description,
        actions,
        media,
        className,
        expanded,
        onExpandedChange,
        ...props
      }: React.HTMLAttributes<HTMLElement> & {
        actions?: React.ReactNode;
        description?: React.ReactNode;
        expanded?: boolean;
        heading?: React.ReactNode;
        media?: React.ReactNode;
        onExpandedChange?: (next: boolean) => void;
      }) =>
        React.createElement(
          "section",
          {
            className,
            onClick:
              expanded === false && onExpandedChange
                ? () => onExpandedChange(true)
                : undefined,
            ...props,
          },
          media,
          heading,
          description,
          actions,
          expanded ? children : null,
        ),
      Frame: ({
        children,
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", { className, ...props }, children),
      Notice: ({
        children,
        actions,
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        actions?: React.ReactNode;
      }) =>
        React.createElement("div", { className, ...props }, children, actions),
    },
  ),
  useLinkedSidebarSelection: () => ({
    contentContainerRef: { current: null },
    queueContentAlignment: vi.fn(),
    registerContentItem: () => vi.fn(),
    registerRailItem: () => vi.fn(),
    registerSidebarItem: () => vi.fn(),
    scrollContentToItem: vi.fn(),
  }),
}));

import { PluginsView } from "../../src/components/pages/PluginsView";

function hasClass(
  node: TestRenderer.ReactTestInstance,
  className: string,
): boolean {
  if (typeof node.props.className !== "string") return false;
  return node.props.className.split(/\s+/).includes(className);
}

function createPlugin(
  id: string,
  name: string,
  category: PluginInfo["category"] = "feature",
  overrides: Partial<PluginInfo> = {},
): PluginInfo {
  return {
    id,
    name,
    description: `${name} configuration plugin`,
    tags: [category],
    enabled: true,
    configured: true,
    envKey: null,
    category,
    source: "bundled",
    parameters: [
      {
        key: "API_KEY",
        type: "string",
        description: "API key",
        required: true,
        sensitive: true,
        currentValue: null,
        isSet: false,
      },
    ],
    validationErrors: [],
    validationWarnings: [],
    version: "1.0.0",
    isActive: true,
    icon: "🧩",
    homepage: undefined,
    repository: undefined,
    setupGuideUrl: undefined,
    ...overrides,
  };
}

function baseContext(plugins?: PluginInfo[]) {
  return {
    t: translateTest,
    plugins: plugins ?? [
      createPlugin("test-plugin", "Test Plugin", "feature"),
      createPlugin("second-plugin", "Second Plugin", "feature"),
      createPlugin("discord", "Discord", "connector"),
    ],
    pluginStatusFilter: "all" as const,
    pluginSearch: "",
    pluginSettingsOpen: new Set<string>(),
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: mockLoadPlugins,
    handlePluginToggle: mockHandlePluginToggle,
    handlePluginConfigSave: mockHandlePluginConfigSave,
    setActionNotice: mockSetActionNotice,
    setState: mockSetState,
  };
}

describe("PluginsView game modal", () => {
  beforeEach(() => {
    ensureWindowGlobals();
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.spyOn(electrobunRpc, "getElectrobunRendererRpc").mockReturnValue(
      undefined,
    );
    mockUseApp.mockReset();
    mockOnWsEvent.mockReset();
    mockHandlePluginToggle.mockReset();
    mockLoadPlugins.mockReset();
    mockHandlePluginConfigSave.mockReset();
    mockSetActionNotice.mockReset();
    mockSetState.mockReset();
    mockTestPluginConnection.mockReset();

    mockOnWsEvent.mockReturnValue(() => {});
    mockLoadPlugins.mockResolvedValue(undefined);
    mockHandlePluginToggle.mockResolvedValue(undefined);
    mockHandlePluginConfigSave.mockResolvedValue(undefined);
    mockTestPluginConnection.mockResolvedValue({
      success: true,
      durationMs: 12,
    });
    mockUseApp.mockReturnValue(baseContext());

    narrowViewport = false;
    originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => {
        const matches = query.includes("max-width: 600px")
          ? narrowViewport
          : query.includes("min-width: 1024px")
            ? !narrowViewport
            : false;
        return {
          matches,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      }),
    });
    // Relies on vi.restoreAllMocks() in suite cleanup
    mockOpenExternalInvoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("renders game modal for both plugins and connectors modals", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "all" }),
      );
    });

    expect(
      tree?.root.findAll((node) => hasClass(node, "plugins-game-modal")).length,
    ).toBe(1);
    expect(
      tree?.root.findAll((node) => hasClass(node, "conn-master-detail")).length,
    ).toBe(0);

    await act(async () => {
      tree?.update(
        React.createElement(PluginsView, { inModal: true, mode: "connectors" }),
      );
    });
    expect(
      tree?.root.findAll((node) => hasClass(node, "plugins-game-modal")).length,
    ).toBe(1);
    expect(
      tree?.root.findAll((node) => hasClass(node, "conn-master-detail")).length,
    ).toBe(0);
    expect(text(tree?.root)).toContain("Connectors");
  });

  it("renders connectors in a settings-style layout when social mode is inline", async () => {
    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("discord", "Discord", "connector"),
        createPlugin("telegram", "Telegram", "connector", {
          enabled: false,
        }),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "social" }),
      );
    });

    expect(
      tree?.root.findAll(
        (node) => node.props?.["data-testid"] === "connectors-settings-sidebar",
      ).length,
    ).toBe(1);
    const sidebar = tree?.root.findAll(
      (node) => node.props?.["data-testid"] === "connectors-settings-sidebar",
    )[0];
    expect(sidebar).toBeDefined();
    const contentAreas = tree?.root.findAll(
      (node) =>
        typeof node.props?.className === "string" &&
        node.props.className.includes("chat-native-scrollbar") &&
        node.props.className.includes("overflow-y-auto"),
    );
    expect(contentAreas.length).toBeGreaterThan(0);
    const selectedConnector = tree?.root.findAll(
      (node) => node.props?.["aria-current"] === "page",
    )[0];
    expect(selectedConnector).toBeDefined();
    expect(
      tree?.root.findAll((node) => hasClass(node, "plugins-game-modal")).length,
    ).toBe(0);
    expect(text(tree?.root)).toContain("Discord");
  });

  it("allows expanding and collapsing a desktop connector section", async () => {
    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("discord", "Discord", "connector"),
        createPlugin("telegram", "Telegram", "connector", {
          enabled: false,
        }),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "social" }),
      );
    });

    const expandButton = tree.root.findByProps({
      "aria-label": "Expand Discord",
    });
    expect(text(tree.root)).not.toContain("Save Settings");

    await act(async () => {
      expandButton.props.onClick();
    });

    expect(text(tree.root)).toContain("Save Settings");

    const collapseButton = tree.root.findByProps({
      "aria-label": "Collapse Discord",
    });

    await act(async () => {
      collapseButton.props.onClick();
    });

    expect(
      tree.root.findAllByProps({
        "aria-label": "Expand Discord",
      }).length,
    ).toBeGreaterThan(0);
    expect(text(tree.root)).not.toContain("Save Settings");
    expect(
      tree.root
        .findByProps({
          "data-testid": "connector-section-discord",
        })
        .findAllByProps({ "data-config-key": "API_KEY" }),
    ).toHaveLength(0);
  });

  it("uses list/detail mobile panes on narrow viewport", async () => {
    narrowViewport = true;
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "all" }),
      );
    });

    const getListPane = () =>
      tree?.root.findAll((node) =>
        hasClass(node, "plugins-game-list-panel"),
      )[0];
    const getDetailPane = () =>
      tree?.root.findAll((node) =>
        hasClass(node, "plugins-game-detail-panel"),
      )[0];
    const firstCard = tree?.root.findAll((node) =>
      hasClass(node, "plugins-game-card"),
    )[0];

    expect(getListPane().props.className.includes("is-hidden")).toBe(false);
    expect(getDetailPane().props.className.includes("is-hidden")).toBe(true);

    await act(async () => {
      firstCard.props.onClick();
    });

    expect(getListPane().props.className.includes("is-hidden")).toBe(true);
    expect(getDetailPane().props.className.includes("is-hidden")).toBe(false);

    const backButton = tree?.root.findAll((node) =>
      hasClass(node, "plugins-game-back-btn"),
    )[0];
    await act(async () => {
      backButton.props.onClick();
    });

    expect(getListPane().props.className.includes("is-hidden")).toBe(false);
    expect(getDetailPane().props.className.includes("is-hidden")).toBe(true);
  });

  it("shows connectors as collapsed inline sections on mobile and expands in place", async () => {
    narrowViewport = true;
    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("discord", "Discord", "connector"),
        createPlugin("telegram", "Telegram", "connector", {
          enabled: false,
        }),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "social" }),
      );
    });

    expect(
      tree?.root.findAll(
        (node) => node.props?.["data-testid"] === "connectors-settings-sidebar",
      ).length,
    ).toBe(0);
    expect(text(tree?.root)).not.toContain("Save Settings");
    expect(
      tree?.root.findAll((node) => hasClass(node, "plugins-game-back-btn"))
        .length,
    ).toBe(0);

    const discordCard = tree?.root.findAll(
      (node) => node.props?.["data-testid"] === "connector-card-discord",
    )[0];
    await act(async () => {
      if (typeof discordCard.props.onClick === "function") {
        discordCard.props.onClick();
      } else {
        discordCard.props.onExpandedChange?.(true);
      }
    });

    expect(text(tree?.root)).toContain("Save Settings");
    expect(text(tree?.root)).toContain("Test Connection");
    expect(
      tree?.root.findAllByProps({
        "aria-label": "Collapse Discord",
      }).length,
    ).toBeGreaterThan(0);
  });

  it("does not show install copy for bundled discord when it is enabled but inactive", async () => {
    narrowViewport = true;
    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("discord", "Discord", "connector", {
          enabled: true,
          isActive: false,
          source: "bundled",
          npmName: "@elizaos/plugin-discord",
        }),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "social" }),
      );
    });

    const discordCard = tree?.root.findAll(
      (node) => node.props?.["data-testid"] === "connector-card-discord",
    )[0];
    await act(async () => {
      if (typeof discordCard.props.onClick === "function") {
        discordCard.props.onClick();
      } else {
        discordCard.props.onExpandedChange?.(true);
      }
    });

    expect(text(tree?.root)).toContain("Not loaded");
    expect(text(tree?.root)).not.toContain(
      "Install this connector to activate it in the runtime.",
    );
    expect(text(tree?.root)).not.toContain("Install Plugin");
  });

  it("re-selects the first visible plugin when the selected one is filtered out", async () => {
    const state = baseContext([
      createPlugin("alpha-plugin", "Alpha Plugin", "feature"),
      createPlugin("bravo-plugin", "Bravo Plugin", "feature"),
    ]);
    mockUseApp.mockImplementation(() => state);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "all" }),
      );
    });

    const cards = tree?.root.findAll((node) =>
      hasClass(node, "plugins-game-card"),
    );
    await act(async () => {
      cards[1].props.onClick();
    });
    expect(text(tree?.root).includes("Bravo Plugin")).toBe(true);

    state.pluginSearch = "Alpha";
    await act(async () => {
      tree?.update(
        React.createElement(PluginsView, { inModal: true, mode: "all" }),
      );
    });

    expect(text(tree?.root).includes("Alpha Plugin")).toBe(true);
    expect(text(tree?.root).includes("Bravo Plugin configuration plugin")).toBe(
      false,
    );
  });

  it("keeps detail actions wired in game modal", async () => {
    mockUseApp.mockReturnValue(
      baseContext([createPlugin("test-plugin", "Test Plugin", "feature")]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "all" }),
      );
    });

    const toggle = tree?.root.findAll((node) =>
      hasClass(node, "plugins-game-toggle"),
    )[0];
    expect(toggle).toBeDefined();

    const testConnectionBtn = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("plugins-game-action-btn") &&
        node.children.some((c) => c === "Test Connection"),
    )[0];
    await act(async () => {
      await testConnectionBtn.props.onClick();
    });
    expect(mockTestPluginConnection).toHaveBeenCalledWith("test-plugin");

    const saveBtn = tree?.root.findAll((node) =>
      hasClass(node, "plugins-game-save-btn"),
    )[0];
    await act(async () => {
      await saveBtn.props.onClick();
    });
    expect(mockHandlePluginConfigSave).toHaveBeenCalledWith("test-plugin", {});
  });

  it("shows streaming plugin only in streaming mode", async () => {
    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("twitch", "Twitch", "streaming"),
        createPlugin("discord", "Discord", "connector"),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "streaming" }),
      );
    });

    expect(text(tree?.root)).toContain("Twitch");
    expect(text(tree?.root)).not.toContain("Discord");
  });

  it("shows all connectors in Connectors view", async () => {
    const state = baseContext([
      createPlugin("telegram", "Telegram", "connector", {
        tags: ["connector", "social", "social-chat", "messaging"],
      }),
      createPlugin("signal", "Signal", "connector", {
        enabled: false,
        tags: ["connector", "social", "social-chat", "messaging"],
      }),
      createPlugin("github", "GitHub", "connector", {
        tags: ["connector", "integration"],
      }),
      createPlugin("iq", "Iq", "connector", {
        enabled: false,
        tags: [],
      }),
    ]);
    mockUseApp.mockImplementation(() => state);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { mode: "social" }),
      );
    });

    expect(text(tree?.root)).toContain("Telegram");
    expect(text(tree?.root)).toContain("Signal");
    expect(text(tree?.root)).toContain("GitHub");
    expect(text(tree?.root)).toContain("Iq");
    const sidebar = tree?.root.findAll(
      (node) => node.props?.["data-testid"] === "connectors-settings-sidebar",
    )[0];
    expect(sidebar).toBeDefined();
    expect(text(sidebar)).toContain("All");
    const connectorSections = tree?.root
      .findAll(
        (node) =>
          typeof node.props?.["data-testid"] === "string" &&
          node.props["data-testid"].startsWith("connector-section-"),
      )
      .map((node) => String(node.props["data-testid"]));
    expect(connectorSections).toEqual(
      expect.arrayContaining([
        "connector-section-telegram",
        "connector-section-signal",
        "connector-section-github",
        "connector-section-iq",
      ]),
    );
    expect(text(tree?.root)).not.toContain("Save Settings");

    const telegramSidebarButton = sidebar.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props?.onClick === "function" &&
        text(node).includes("Telegram"),
    )[0];
    expect(telegramSidebarButton).toBeDefined();

    await act(async () => {
      telegramSidebarButton.props.onClick();
    });

    expect(text(tree?.root)).toContain("Save Settings");

    const githubCard = tree?.root.findAll(
      (node) => node.props?.["data-testid"] === "connector-card-github",
    )[0];
    await act(async () => {
      if (typeof githubCard.props.onClick === "function") {
        githubCard.props.onClick();
      } else {
        githubCard.props.onExpandedChange?.(true);
      }
    });

    expect(text(tree?.root)).toContain("GitHub");
    expect(
      tree?.root.findAllByProps({
        "aria-label": "Collapse GitHub",
      }).length,
    ).toBeGreaterThan(0);

    const addButtons = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((child) => child === "pluginsview.AddPlugin"),
    );
    expect(addButtons.length).toBe(0);
  });

  it("renders plugin type filters in a desktop sidebar for the main plugins view", async () => {
    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("openai", "OpenAI", "ai-provider", {
          tags: ["llm", "provider"],
        }),
        createPlugin("discord", "Discord", "connector", {
          tags: ["connector", "messaging"],
        }),
        createPlugin("twitch", "Twitch", "streaming", {
          tags: ["streaming", "broadcast"],
        }),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    const sidebar = tree?.root.findAllByProps({
      "data-testid": "plugins-subgroup-sidebar",
    })[0];
    expect(sidebar).toBeDefined();
    expect(String(sidebar.props.className)).not.toContain("h-screen");
    expect(String(sidebar.props.className)).toContain("overflow-hidden");
    expect(String(sidebar.props.className)).toContain("backdrop-blur-md");
    expect(String(sidebar.props.className)).toContain("border-border/34");
    const sidebarText = text(sidebar);
    expect(sidebarText).toContain("All");
    expect(sidebarText).toContain("AI Providers");
    expect(sidebarText).toContain("Connectors");
    expect(sidebarText).toContain("Streaming Destinations");

    const addButtons = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        node.children.some((child) => child === "pluginsview.AddPlugin"),
    );
    expect(addButtons.length).toBe(0);
  });

  it("renders setup links on cards and opens detail links via desktop IPC with browser fallback", async () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as unknown as Window);
    (
      window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        desktopOpenExternal: mockOpenExternalInvoke,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    mockUseApp.mockReturnValue(
      baseContext([
        createPlugin("twitch", "Twitch", "streaming", {
          setupGuideUrl: "https://docs.milady.ai/plugin-setup-guide#twitch",
          repository:
            "https://github.com/milady-ai/milady/tree/main/packages/plugin-twitch",
        }),
      ]),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { mode: "streaming" }),
      );
    });

    expect(
      tree?.root.findAll(
        (node) =>
          node.type === "a" ||
          (node.type === "button" && text(node).includes("Setup guide")),
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsView, { inModal: true, mode: "streaming" }),
      );
    });

    expect(
      tree?.root.findAll((node) => hasClass(node, "plugins-game-link-btn"))
        .length,
    ).toBeGreaterThan(0);

    const setupButton = tree?.root.findAll(
      (node) =>
        hasClass(node, "plugins-game-link-btn") &&
        text(node).includes("Setup guide"),
    )[0];
    await act(async () => {
      setupButton.props.onClick();
      await Promise.resolve();
    });
    expect(mockOpenExternalInvoke).toHaveBeenCalledWith({
      url: "https://docs.milady.ai/plugin-setup-guide#twitch",
    });

    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    const sourceButton = tree?.root.findAll(
      (node) =>
        hasClass(node, "plugins-game-link-btn") &&
        text(node).includes("Source"),
    )[0];
    await act(async () => {
      sourceButton.props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/milady-ai/milady/tree/main/packages/plugin-twitch",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockRestore();
  });
});
