// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

type SidebarHeaderSearchProps = React.InputHTMLAttributes<HTMLInputElement> & {
  clearLabel?: string;
  loading?: boolean;
  onClear?: () => void;
};

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/ui", () => ({
  ContentLayout: ({
    contentHeader,
    children,
    ...props
  }: Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      contentHeader as React.ReactNode,
      children as React.ReactNode,
    ),
  PageLayout: ({
    sidebar,
    children,
    contentHeader,
    ...props
  }: Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      sidebar as React.ReactNode,
      contentHeader as React.ReactNode,
      children as React.ReactNode,
    ),
  PagePanel: Object.assign(
    (props: Record<string, unknown>) =>
      React.createElement("div", props, props.children as React.ReactNode),
    {
      Empty: (props: Record<string, unknown>) =>
        React.createElement("div", props, props.children as React.ReactNode),
      Notice: (props: Record<string, unknown>) =>
        React.createElement("div", props, props.children as React.ReactNode),
      Frame: (props: Record<string, unknown>) =>
        React.createElement("div", props, props.children as React.ReactNode),
      ContentArea: (props: Record<string, unknown>) =>
        React.createElement("div", props, props.children as React.ReactNode),
    },
  ),
  Sidebar: ({ header, footer, children, ...props }: Record<string, unknown>) =>
    React.createElement(
      "aside",
      props,
      header as React.ReactNode,
      children as React.ReactNode,
      footer as React.ReactNode,
    ),
  SidebarHeader: ({
    search,
    children,
    ...props
  }: {
    search?: SidebarHeaderSearchProps;
    children?: React.ReactNode;
  }) => {
    const { clearLabel, loading, onClear, ...inputProps } = search ?? {};
    void clearLabel;
    void loading;
    void onClear;

    return React.createElement(
      "div",
      props,
      search ? React.createElement("input", inputProps) : null,
      children,
    );
  },
  SidebarHeaderStack: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SidebarPanel: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SidebarScrollRegion: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SidebarFilterBar: ({
    selectValue,
    selectOptions,
    onSelectValueChange,
    onSortDirectionToggle,
    onRefresh,
    selectTestId,
    sortDirectionButtonTestId,
    refreshButtonTestId,
    ...props
  }: Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      React.createElement("mock-select", {
        value: selectValue,
        "data-testid": selectTestId,
        onChange: (event: { target: { value: string } }) =>
          typeof onSelectValueChange === "function" &&
          onSelectValueChange(event.target.value),
      }),
      ...(Array.isArray(selectOptions)
        ? selectOptions.map((option) =>
            React.createElement(
              "mock-option",
              { key: option.value, value: option.value },
              option.label as React.ReactNode,
            ),
          )
        : []),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": sortDirectionButtonTestId,
          onClick: () =>
            typeof onSortDirectionToggle === "function" &&
            onSortDirectionToggle(),
        },
        "sort",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": refreshButtonTestId,
          onClick: () => typeof onRefresh === "function" && onRefresh(),
        },
        "refresh",
      ),
    ),
  TooltipHint: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement("div", props, children as React.ReactNode),
  SidebarSearchBar: (props: Record<string, unknown>) =>
    React.createElement("input", props),
  SegmentedControl: ({
    items,
    onValueChange,
    ...props
  }: Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      ...(Array.isArray(items)
        ? items.map((item) =>
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
              item.label as React.ReactNode,
              item.badge as React.ReactNode,
            ),
          )
        : []),
    ),
  SidebarContent: {
    SectionLabel: (props: Record<string, unknown>) =>
      React.createElement("div", props, props.children as React.ReactNode),
    Toolbar: (props: Record<string, unknown>) =>
      React.createElement("div", props, props.children as React.ReactNode),
    ToolbarPrimary: (props: Record<string, unknown>) =>
      React.createElement("div", props, props.children as React.ReactNode),
    ToolbarActions: (props: Record<string, unknown>) =>
      React.createElement("div", props, props.children as React.ReactNode),
  },
  Button: (props: Record<string, unknown>) =>
    React.createElement(
      "button",
      { type: "button", ...props },
      props.children as React.ReactNode,
    ),
  Dialog: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  DialogContent: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  DialogHeader: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  DialogTitle: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  Spinner: () => React.createElement("span", { "aria-label": "loading" }),
  ConfirmDialog: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  Label: (props: Record<string, unknown>) =>
    React.createElement("label", props, props.children as React.ReactNode),
  Slider: (props: Record<string, unknown>) =>
    React.createElement("input", { type: "range", ...props }),
  Switch: (props: Record<string, unknown>) =>
    React.createElement("button", {
      type: "button",
      role: "switch",
      ...props,
    }),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
  Select: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SelectContent: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SelectItem: (props: Record<string, unknown>) =>
    React.createElement("option", props, props.children as React.ReactNode),
  SelectTrigger: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SelectValue: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
}));

vi.mock("../inventory/BscTradePanel", () => ({
  TradePanel: () =>
    React.createElement("div", { "data-testid": "trade-panel" }),
}));

vi.mock("../inventory/NftGrid", () => ({
  NftGrid: () => React.createElement("div", { "data-testid": "nft-grid" }),
}));

vi.mock("../inventory/TokensTable", () => ({
  TokensTable: () =>
    React.createElement("div", { "data-testid": "tokens-table" }),
}));

vi.mock("../inventory/useInventoryData", () => ({
  useInventoryData: ({
    inventoryChainFilters,
  }: {
    inventoryChainFilters: {
      ethereum: boolean;
      base: boolean;
      bsc: boolean;
      avax: boolean;
      solana: boolean;
    };
  }) => {
    const keys = (
      ["ethereum", "base", "bsc", "avax", "solana"] as const
    ).filter((k) => inventoryChainFilters[k]);
    const singleChainFocus = keys.length === 1 ? keys[0] : null;
    const tokenRowsAllChains = [
      { chain: "ethereum", balanceRaw: 1, valueUsd: 10 },
      { chain: "base", balanceRaw: 1, valueUsd: 5 },
      { chain: "bsc", balanceRaw: 1, valueUsd: 3 },
      { chain: "solana", balanceRaw: 1, valueUsd: 2 },
    ];
    return {
      singleChainFocus,
      tokenRows: tokenRowsAllChains,
      tokenRowsAllChains,
      allNfts: [],
      focusedChainError: null,
      focusedChainName:
        singleChainFocus === null
          ? null
          : ((
              {
                ethereum: "Ethereum",
                base: "Base",
                bsc: "BSC",
                avax: "Avalanche",
                solana: "Solana",
              } as Record<string, string>
            )[singleChainFocus] ?? singleChainFocus),
      visibleRows: [],
      totalUsd: 20,
      visibleChainErrors: [],
      focusedNativeBalance: "1.0",
    };
  },
}));

import { InventoryView } from "../pages/InventoryView";

function t(
  key: string,
  vars?: Record<string, string | number | boolean | null | undefined>,
): string {
  const translations: Record<string, string> = {
    "wallet.tokens": "Tokens",
    "wallet.nfts": "NFTs",
    "wallet.sort": "Sort",
    "wallet.value": "Value",
    "wallet.chain": "Chain",
    "wallet.name": "Name",
    "wallet.overviewTitle": "Wallet Overview",
    "wallet.overviewTitleChain": "{{chain}} Wallet Overview",
    "wallet.overviewSubtitle":
      "Track balances, managed addresses, and trading readiness in one place.",
    "wallet.fundingRouteAvailable": "1 funding route available",
    "wallet.fundingRoutesAvailable": "{{count}} funding routes available",
    "wallet.managedWalletOverview": "Managed wallet overview",
    "wallet.copyEvmAddress": "Copy EVM address",
    "wallet.copySolanaAddress": "Copy Solana address",
    "common.refresh": "Refresh",
    "common.retry": "Retry",
    "inventoryview.ChainShownClickToHide": "{{chain}} — shown (click to hide)",
    "inventoryview.ChainHiddenClickToShow":
      "{{chain}} — hidden (click to show)",
    "inventoryview.ChainNoWalletConfigured": "{{chain}} — no wallet configured",
    "inventoryview.ChainVisible": "{{chain}} — visible",
    "inventoryview.ChainHidden": "{{chain}} — hidden",
    "wallet.sortAscending": "Sort ascending",
    "wallet.sortDescending": "Sort descending",
  };

  const template = translations[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => {
    const value = vars?.[token];
    return value == null ? "" : String(value);
  });
}

function createContext(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    walletConfig: {
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "So11111111111111111111111111111111111111112",
      managedBscRpcReady: true,
      cloudManagedAccess: true,
      ethereumBalanceReady: true,
      baseBalanceReady: true,
      bscBalanceReady: true,
      avalancheBalanceReady: true,
      solanaBalanceReady: true,
      alchemyKeySet: true,
      ankrKeySet: true,
      heliusKeySet: true,
      legacyCustomChains: [],
    },
    walletAddresses: {
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "So11111111111111111111111111111111111111112",
    },
    walletBalances: {
      evm: {
        chains: [
          { chain: "ethereum", error: null },
          { chain: "base", error: null },
          { chain: "bsc", error: null },
          { chain: "avax", error: null },
        ],
      },
      solana: {},
    },
    walletNfts: { evm: [], solana: null },
    walletLoading: false,
    walletNftsLoading: false,
    inventoryView: "tokens",
    inventorySort: "value",
    inventorySortDirection: "desc",
    inventoryChainFilters: {
      ethereum: true,
      base: true,
      bsc: true,
      avax: true,
      solana: true,
    },
    walletError: null,
    elizaCloudConnected: false,
    elizaCloudCredits: null,
    elizaCloudCreditsLow: false,
    elizaCloudCreditsCritical: false,
    elizaCloudAuthRejected: false,
    elizaCloudTopUpUrl: null,
    loadBalances: vi.fn(async () => {}),
    loadNfts: vi.fn(async () => {}),
    setTab: vi.fn(),
    setActionNotice: vi.fn(),
    executeBscTrade: vi.fn(),
    getBscTradePreflight: vi.fn(),
    getBscTradeQuote: vi.fn(),
    getBscTradeTxStatus: vi.fn(),
    getStewardStatus: vi.fn(async () => null),
    copyToClipboard: vi.fn(async () => {}),
    t,
  };

  Object.assign(ctx, overrides);
  ctx.setState = vi.fn((key: string, value: unknown) => {
    ctx[key] = value;
  });

  return ctx;
}

describe("InventoryView wallet settings", () => {
  it("auto-loads token balances when the wallet view opens on tokens", async () => {
    const loadBalances = vi.fn(async () => {});
    const ctx = createContext({
      walletBalances: null,
      loadBalances,
    });
    mockUseApp.mockImplementation(() => ctx);

    await act(async () => {
      TestRenderer.create(<InventoryView />);
    });

    expect(loadBalances).toHaveBeenCalledTimes(1);
  });

  it("auto-loads NFTs when the wallet view opens on the NFT tab", async () => {
    const loadNfts = vi.fn(async () => {});
    const ctx = createContext({
      inventoryView: "nfts",
      walletNfts: null,
      loadNfts,
    });
    mockUseApp.mockImplementation(() => ctx);

    await act(async () => {
      TestRenderer.create(<InventoryView />);
    });

    expect(loadNfts).toHaveBeenCalledTimes(1);
  });

  it("renders the token sort control and dispatches inventorySort updates", async () => {
    const ctx = createContext();
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    const sidebarSortBlock = tree?.root.find(
      (node) => node.props["data-testid"] === "wallet-sidebar-sort-block",
    );
    expect(sidebarSortBlock).toBeTruthy();

    const sortSelect = sidebarSortBlock?.find(
      (node) =>
        node.type === "mock-select" && node.props.value === ctx.inventorySort,
    );
    expect(sortSelect).toBeTruthy();

    // No overview card, funding route pill, or summary sort pill
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-overview-card",
      ),
    ).toHaveLength(0);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-funding-route-pill",
      ),
    ).toHaveLength(0);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-summary-sort-pill",
      ),
    ).toHaveLength(0);

    await act(async () => {
      sortSelect?.props.onChange({ target: { value: "chain" } });
    });

    expect(ctx.setState).toHaveBeenCalledWith("inventorySort", "chain");
    expect(ctx.setState).toHaveBeenCalledWith("inventorySortDirection", "asc");
  });

  it("renders the shared sort control in NFT view", async () => {
    const ctx = createContext({ inventoryView: "nfts" });
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    const sidebarSortBlock = tree?.root.find(
      (node) => node.props["data-testid"] === "wallet-sidebar-sort-block",
    );
    expect(sidebarSortBlock).toBeTruthy();

    const sortSelect = sidebarSortBlock?.find(
      (node) => node.type === "mock-select" && node.props.value === "symbol",
    );
    expect(sortSelect).toBeTruthy();
  });

  it("keeps the simplified wallet shell and interactive chain icon grid", async () => {
    const ctx = createContext();
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    // Wallet Overview heading is removed
    expect(
      JSON.stringify(tree?.toJSON(), (_key, value) =>
        typeof value === "function" ? "[function]" : value,
      ),
    ).not.toContain("Wallet Overview");
    expect(
      tree?.root.findAll((node) => node.children.includes("WALLET")),
    ).toHaveLength(0);

    const baseButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props["aria-label"] === "string" &&
        node.props["aria-label"].startsWith("Base"),
    );
    expect(baseButton).toBeTruthy();

    await act(async () => {
      baseButton?.props.onClick();
    });

    expect(ctx.setState).toHaveBeenCalledWith("inventoryChainFilters", {
      ethereum: true,
      base: false,
      bsc: true,
      avax: true,
      solana: true,
    });
  });

  it("does not render an overview card for focused wallets", async () => {
    const ctx = createContext({
      inventoryChainFilters: {
        ethereum: false,
        base: true,
        bsc: false,
        avax: false,
        solana: false,
      },
    });
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-overview-card",
      ),
    ).toHaveLength(0);
  });
});
