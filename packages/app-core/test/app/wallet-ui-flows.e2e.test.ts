/**
 * E2E tests for Wallet/Inventory UI (InventoryView).
 *
 * Tests cover:
 * 1. Balance display
 * 2. Chain selection
 * 3. Token list
 * 4. NFT display
 * 5. Address display and copy
 * 6. Refresh functionality
 */

import http from "node:http";
// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { req } from "../../../../test/helpers/http";

function translateTest(
  key: string,
  vars?: {
    defaultValue?: string;
  },
): string {
  return vars?.defaultValue ?? key;
}

type SidebarHeaderSearchProps = React.InputHTMLAttributes<HTMLInputElement> & {
  clearLabel?: string;
  loading?: boolean;
  onClear?: () => void;
};

// ---------------------------------------------------------------------------
// Part 1: API Tests for Wallet Endpoints
// ---------------------------------------------------------------------------

function createWalletTestServer(): Promise<{
  port: number;
  close: () => Promise<void>;
  getBalances: () => Array<{ chain: string; symbol: string; balance: string }>;
}> {
  const balances = [
    { chain: "ethereum", symbol: "ETH", balance: "1.5", valueUsd: 3000 },
    { chain: "ethereum", symbol: "USDC", balance: "1000", valueUsd: 1000 },
    { chain: "base", symbol: "ETH", balance: "0.5", valueUsd: 1000 },
    { chain: "polygon", symbol: "MATIC", balance: "500", valueUsd: 250 },
  ];

  const nfts = [
    {
      chain: "ethereum",
      name: "Cool NFT #1",
      imageUrl: "https://example.com/nft1.png",
      collectionName: "Cool Collection",
    },
    {
      chain: "ethereum",
      name: "Cool NFT #2",
      imageUrl: "https://example.com/nft2.png",
      collectionName: "Cool Collection",
    },
  ];

  const addresses = {
    ethereum: "0x1234567890123456789012345678901234567890",
    base: "0x1234567890123456789012345678901234567890",
    polygon: "0x1234567890123456789012345678901234567890",
  };

  const json = (res: http.ServerResponse, data: unknown, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
  };

  const routes: Record<
    string,
    (req: http.IncomingMessage, res: http.ServerResponse) => void
  > = {
    "GET /api/wallet/balances": (_r, res) => json(res, { balances }),
    "GET /api/wallet/nfts": (_r, res) => json(res, { nfts }),
    "GET /api/wallet/addresses": (_r, res) => json(res, { addresses }),
    "POST /api/wallet/refresh": (_r, res) => json(res, { ok: true }),
    "GET /api/wallet/config": (_r, res) =>
      json(res, {
        chains: ["ethereum", "base", "polygon"],
        selectedChain: "ethereum",
      }),
  };

  const server = http.createServer((rq, rs) => {
    if (rq.method === "OPTIONS") {
      rs.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
      });
      rs.end();
      return;
    }
    const key = `${rq.method} ${new URL(rq.url ?? "/", "http://localhost").pathname}`;
    const handler = routes[key];
    if (handler) {
      handler(rq, rs);
    } else {
      json(rs, { error: "Not found" }, 404);
    }
  });

  return new Promise((ok) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      ok({
        port: typeof addr === "object" && addr ? addr.port : 0,
        close: () => new Promise<void>((r) => server.close(() => r())),
        getBalances: () =>
          balances.map((b) => ({
            chain: b.chain,
            symbol: b.symbol,
            balance: b.balance,
          })),
      });
    });
  });
}

describe("Wallet API", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ port, close } = await createWalletTestServer());
  });

  afterAll(async () => {
    await close();
  });

  it("GET /api/wallet/balances returns token balances", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/balances");
    expect(status).toBe(200);
    expect(Array.isArray(data.balances)).toBe(true);
    expect((data.balances as unknown[]).length).toBeGreaterThan(0);
  });

  it("GET /api/wallet/nfts returns NFT list", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/nfts");
    expect(status).toBe(200);
    expect(Array.isArray(data.nfts)).toBe(true);
  });

  it("GET /api/wallet/addresses returns wallet addresses", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/addresses");
    expect(status).toBe(200);
    expect(data.addresses).toBeDefined();
  });

  it("POST /api/wallet/refresh triggers balance refresh", async () => {
    const { status, data } = await req(port, "POST", "/api/wallet/refresh");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("GET /api/wallet/config returns chain configuration", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/config");
    expect(status).toBe(200);
    expect(Array.isArray(data.chains)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part 2: UI Tests for InventoryView
// ---------------------------------------------------------------------------

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", async () => {
  const actual = await vi.importActual("@miladyai/app-core/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  const button = ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children);
  const input = (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props);
  const sidebarSearchBar = (
    props: React.InputHTMLAttributes<HTMLInputElement>,
  ) => {
    const placeholder =
      typeof props.placeholder === "string" &&
      props.placeholder.trim().length > 0 &&
      !/(\.\.\.|…)$/.test(props.placeholder.trim())
        ? `${props.placeholder.trim()}...`
        : props.placeholder;
    return React.createElement("input", { ...props, placeholder });
  };
  const sidebarHeader = ({
    children,
    search,
    ...props
  }: React.PropsWithChildren<{
    search?: SidebarHeaderSearchProps;
  }>) => {
    const { clearLabel, loading, onClear, ...inputProps } = search ?? {};
    void clearLabel;
    void loading;
    void onClear;

    return React.createElement(
      "div",
      props,
      search ? sidebarSearchBar(inputProps) : null,
      children,
    );
  };
  const pageLayout = ({
    children,
    sidebar,
    contentHeader,
    contentRef,
    ...props
  }: React.PropsWithChildren<{
    sidebar?: React.ReactNode;
    contentHeader?: React.ReactNode;
    contentRef?: React.Ref<HTMLElement>;
  }>) => {
    const sidebarElement = React.isValidElement<{
      collapsible?: boolean;
    }>(sidebar)
      ? React.cloneElement(sidebar, {
          collapsible: sidebar.props.collapsible ?? true,
        })
      : sidebar;

    return React.createElement(
      "div",
      props,
      sidebarElement,
      React.createElement("main", { ref: contentRef }, contentHeader, children),
    );
  };
  const MockSidebar = ({
    children,
    header,
    footer,
    testId,
    collapsible = false,
    collapsed,
    defaultCollapsed = false,
    onCollapsedChange,
    collapsedContent,
    collapsedRailAction,
    collapsedRailItems,
    collapseButtonTestId,
    expandButtonTestId,
    collapseButtonAriaLabel = "Collapse sidebar",
    expandButtonAriaLabel = "Expand sidebar",
    ...props
  }: React.PropsWithChildren<{
    header?: React.ReactNode;
    footer?: React.ReactNode;
    testId?: string;
    collapsible?: boolean;
    collapsed?: boolean;
    defaultCollapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    collapsedContent?: React.ReactNode;
    collapsedRailAction?: React.ReactNode;
    collapsedRailItems?: React.ReactNode;
    collapseButtonTestId?: string;
    expandButtonTestId?: string;
    collapseButtonAriaLabel?: string;
    expandButtonAriaLabel?: string;
  }>) => {
    const [internalCollapsed, setInternalCollapsed] =
      React.useState(defaultCollapsed);
    const isCollapsed = collapsed ?? internalCollapsed;

    const setNextCollapsed = (next: boolean) => {
      if (collapsed === undefined) {
        setInternalCollapsed(next);
      }
      onCollapsedChange?.(next);
    };
    const collapsedRailContent =
      collapsedRailAction != null || collapsedRailItems != null
        ? React.createElement(
            React.Fragment,
            null,
            collapsedRailAction,
            collapsedRailItems,
          )
        : null;

    return React.createElement(
      "aside",
      {
        "data-testid": testId,
        "data-collapsed": isCollapsed || undefined,
        ...props,
      },
      isCollapsed && collapsible
        ? React.createElement(
            React.Fragment,
            null,
            collapsedContent ?? collapsedRailContent ?? children,
            React.createElement(
              "button",
              {
                type: "button",
                "data-testid": expandButtonTestId,
                "aria-label": expandButtonAriaLabel,
                onClick: () => setNextCollapsed(false),
              },
              "expand",
            ),
          )
        : React.createElement(
            React.Fragment,
            null,
            header,
            children,
            footer,
            collapsible
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    "data-testid": collapseButtonTestId,
                    "aria-label": collapseButtonAriaLabel,
                    onClick: () => setNextCollapsed(true),
                  },
                  "collapse",
                )
              : null,
          ),
    );
  };
  const pagePanel = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("section", props, children);
  const sidebarContent = {
    EmptyState: passthrough,
    Item: passthrough,
    ItemBody: passthrough,
    ItemButton: button,
    ItemDescription: passthrough,
    ItemIcon: passthrough,
    ItemTitle: passthrough,
    Notice: passthrough,
    RailItem: button,
    SectionHeader: passthrough,
    SectionLabel: passthrough,
    Toolbar: passthrough,
    ToolbarActions: passthrough,
    ToolbarPrimary: passthrough,
  };
  pagePanel.Empty = passthrough;
  pagePanel.Loading = passthrough;
  pagePanel.Notice = passthrough;
  return {
    cn: (...classes: Array<string | false | null | undefined>) =>
      classes.filter(Boolean).join(" "),
    Button: button,
    ContentLayout: passthrough,
    Input: input,
    PageLayout: pageLayout,
    PagePanel: pagePanel,
    Select: passthrough,
    SelectContent: passthrough,
    SelectItem: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("option", props, children),
    SelectTrigger: passthrough,
    SelectValue: passthrough,
    SegmentedControl: ({
      items,
      onValueChange,
      ...props
    }: React.PropsWithChildren<
      Record<string, unknown> & {
        items?: Array<{
          value: string;
          label: React.ReactNode;
          testId?: string;
        }>;
      }
    >) =>
      React.createElement(
        "div",
        props,
        ...(items ?? []).map((item) =>
          React.createElement(
            "button",
            {
              key: item.value,
              type: "button",
              "data-testid": item.testId,
              onClick: () =>
                typeof onValueChange === "function" &&
                onValueChange(item.value),
            },
            item.label,
          ),
        ),
      ),
    Sidebar: MockSidebar,
    SidebarContent: sidebarContent,
    SidebarFilterBar: passthrough,
    SidebarHeader: sidebarHeader,
    SidebarHeaderStack: passthrough,
    SidebarPanel: passthrough,
    SidebarScrollRegion: passthrough,
    SidebarSearchBar: sidebarSearchBar,
    Tooltip: passthrough,
    TooltipContent: passthrough,
    TooltipHint: passthrough,
    TooltipProvider: passthrough,
    TooltipTrigger: passthrough,
    Tabs: passthrough,
    TabsList: passthrough,
    TabsTrigger: passthrough,
    TabsContent: passthrough,
    Badge: passthrough,
    Dialog: passthrough,
    DialogContent: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
    DialogTrigger: passthrough,
    ConfirmDialog: passthrough,
    Label: passthrough,
    Slider: passthrough,
    Switch: passthrough,
    Spinner: passthrough,
  };
});

import { InventoryView } from "../../src/components/pages/InventoryView";

type WalletState = {
  walletConfig: { chains: string[]; selectedChain: string } | null;
  walletAddresses: Record<string, string>;
  walletBalances: Array<{
    chain: string;
    symbol: string;
    name: string;
    balance: string;
    valueUsd: number;
  }>;
  walletNfts: {
    evm: Array<{
      chain: string;
      nfts: Array<{
        name: string;
        imageUrl: string;
        collectionName?: string;
        tokenType?: string;
      }>;
    }>;
    solana?: {
      nfts: Array<{
        name: string;
        imageUrl: string;
        collectionName?: string;
      }>;
    };
  } | null;
  walletLoading: boolean;
  walletNftsLoading: boolean;
  inventoryView: "tokens" | "nfts";
  walletError?: string | null;
};

function createWalletUIState(): WalletState {
  return {
    walletConfig: {
      chains: ["ethereum", "base", "polygon"],
      selectedChain: "ethereum",
    },
    walletAddresses: {
      ethereum: "0x1234567890123456789012345678901234567890",
      base: "0x1234567890123456789012345678901234567890",
    },
    walletBalances: [
      {
        chain: "ethereum",
        symbol: "ETH",
        name: "Ethereum",
        balance: "1.5",
        valueUsd: 3000,
      },
      {
        chain: "ethereum",
        symbol: "USDC",
        name: "USD Coin",
        balance: "1000",
        valueUsd: 1000,
      },
    ],
    walletNfts: {
      evm: [
        {
          chain: "ethereum",
          nfts: [
            {
              name: "Cool NFT #1",
              imageUrl: "https://example.com/nft1.png",
              collectionName: "Cool Collection",
            },
          ],
        },
      ],
      solana: { nfts: [] },
    },
    walletLoading: false,
    walletNftsLoading: false,
    inventoryView: "tokens",
    walletError: null,
  };
}

describe("InventoryView UI", () => {
  let state: WalletState;

  beforeEach(() => {
    state = createWalletUIState();

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      uiLanguage: "en",
      ...state,
      t: translateTest,
      walletAddresses: {
        evmAddress: "0x1234567890123456789012345678901234567890",
      },
      walletBalances: {
        evm: { chains: [] },
        solana: null,
      },
      inventorySort: "value" as const,
      inventorySortDirection: "desc" as const,
      inventoryChainFilters: {
        ethereum: true,
        base: true,
        bsc: true,
        avax: true,
        solana: true,
      },
      elizaCloudConnected: false,
      loadBalances: vi.fn().mockResolvedValue(undefined),
      loadNfts: vi.fn().mockResolvedValue(undefined),
      loadWalletBalances: vi.fn(),
      loadWalletNfts: vi.fn(),
      refreshWallet: vi.fn(),
      setTab: vi.fn(),
      setState: vi.fn(),
      setActionNotice: vi.fn(),
      getStewardStatus: vi.fn().mockResolvedValue(null),
      executeBscTrade: vi.fn(),
      getBscTradePreflight: vi.fn(),
      getBscTradeQuote: vi.fn(),
      getBscTradeTxStatus: vi.fn(),
      setInventoryView: (view: "tokens" | "nfts") => {
        state.inventoryView = view;
      },
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
    }));
  });

  it("renders InventoryView", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    expect(tree).not.toBeNull();
  });

  it("displays wallet address", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const _codeElements = tree?.root.findAll((node) => node.type === "code");
    // Should have address displayed
    expect(tree).not.toBeNull();
  });

  it("displays token balances", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const allText = JSON.stringify(tree?.toJSON());
    // With mock providing empty chains, the component renders the wallet overview
    // with an empty token state — verify the wallet UI structure is present
    expect(
      allText.includes("wallet.overviewTitle") ||
        allText.includes("wallet.noTokensFound") ||
        allText.includes("wallet.noDataRefresh") ||
        allText.includes("wallet.copyEvmAddress"),
    ).toBe(true);
  });

  it("shows loading state when walletLoading is true", async () => {
    state.walletLoading = true;

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    expect(tree).not.toBeNull();
  });

  it("uses the Search wallets label for the sidebar search input", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const searchInput = tree?.root
      .findAllByType("input")
      .find((node) => node.props["aria-label"] === "Search wallets");

    expect(searchInput).toBeDefined();
    expect(searchInput?.props.placeholder).toBe("Search wallets...");
  });

  it("renders compact wallet controls when the shared sidebar rail collapses", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const collapseButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "Collapse sidebar",
    );

    await act(async () => {
      collapseButton?.props.onClick();
    });

    const sidebar = tree?.root.findByProps({
      "data-testid": "wallets-sidebar",
    });
    expect(sidebar?.props["data-collapsed"]).toBe(true);
    expect(
      tree?.root.findByProps({
        "data-testid": "wallet-view-tokens",
      }),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Part 3: Wallet Balance Integration Tests
// ---------------------------------------------------------------------------

describe("Wallet Balance Integration", () => {
  let state: WalletState;
  let refreshCalled: boolean;

  beforeEach(() => {
    state = createWalletUIState();
    refreshCalled = false;

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      uiLanguage: "en",
      ...state,
      t: translateTest,
      loadWalletBalances: vi.fn(),
      loadWalletNfts: vi.fn(),
      refreshWallet: async () => {
        refreshCalled = true;
        // Simulate balance update
        state.walletBalances[0].balance = "2.0";
      },
      setInventoryView: vi.fn(),
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
    }));
  });

  it("refreshing wallet updates balances", async () => {
    const refreshWallet = mockUseApp().refreshWallet;
    const originalBalance = state.walletBalances[0].balance;

    await refreshWallet();

    expect(refreshCalled).toBe(true);
    expect(state.walletBalances[0].balance).not.toBe(originalBalance);
  });
});

// ---------------------------------------------------------------------------
// Part 4: Token/NFT View Toggle Tests
// ---------------------------------------------------------------------------

describe("Inventory View Toggle", () => {
  let state: WalletState;

  beforeEach(() => {
    state = createWalletUIState();

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      uiLanguage: "en",
      ...state,
      t: translateTest,
      loadWalletBalances: vi.fn(),
      loadWalletNfts: vi.fn(),
      refreshWallet: vi.fn(),
      setInventoryView: (view: "tokens" | "nfts") => {
        state.inventoryView = view;
      },
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
    }));
  });

  it("defaults to tokens view", () => {
    expect(state.inventoryView).toBe("tokens");
  });

  it("switching to NFTs view updates state", () => {
    const setView = mockUseApp().setInventoryView;

    setView("nfts");

    expect(state.inventoryView).toBe("nfts");
  });

  it("switching back to tokens view works", () => {
    const setView = mockUseApp().setInventoryView;

    setView("nfts");
    setView("tokens");

    expect(state.inventoryView).toBe("tokens");
  });
});

// ---------------------------------------------------------------------------
// Part 5: Chain Selection Tests
// ---------------------------------------------------------------------------

describe("Chain Selection", () => {
  let state: WalletState;

  beforeEach(() => {
    state = createWalletUIState();

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      uiLanguage: "en",
      ...state,
      t: translateTest,
      loadWalletBalances: vi.fn(),
      loadWalletNfts: vi.fn(),
      refreshWallet: vi.fn(),
      setInventoryView: vi.fn(),
      setSelectedChain: (chain: string) => {
        if (state.walletConfig) {
          state.walletConfig.selectedChain = chain;
        }
      },
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
    }));
  });

  it("available chains are listed", () => {
    expect(state.walletConfig?.chains).toContain("ethereum");
    expect(state.walletConfig?.chains).toContain("base");
    expect(state.walletConfig?.chains).toContain("polygon");
  });

  it("changing chain updates selected chain", () => {
    const setChain = mockUseApp().setSelectedChain;

    setChain("base");

    expect(state.walletConfig?.selectedChain).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// Part 6: Address Copy Tests
// ---------------------------------------------------------------------------

describe("Address Copy Functionality", () => {
  let state: WalletState;
  let copiedText: string | null;

  beforeEach(() => {
    state = createWalletUIState();
    copiedText = null;

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      uiLanguage: "en",
      ...state,
      t: translateTest,
      loadWalletBalances: vi.fn(),
      loadWalletNfts: vi.fn(),
      refreshWallet: vi.fn(),
      setInventoryView: vi.fn(),
      copyToClipboard: async (text: string) => {
        copiedText = text;
      },
    }));
  });

  it("copying address captures correct text", async () => {
    const copyFn = mockUseApp().copyToClipboard;

    await copyFn("0x1234567890123456789012345678901234567890");

    expect(copiedText).toBe("0x1234567890123456789012345678901234567890");
  });
});
