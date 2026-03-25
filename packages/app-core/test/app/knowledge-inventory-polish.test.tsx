// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockListKnowledgeDocuments,
  mockSearchKnowledge,
  mockUploadKnowledgeDocumentsBulk,
  mockUploadKnowledgeFromUrl,
  mockDeleteKnowledgeDocument,
  mockGetKnowledgeDocument,
  mockGetKnowledgeFragments,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockListKnowledgeDocuments: vi.fn(),
  mockSearchKnowledge: vi.fn(),
  mockUploadKnowledgeDocumentsBulk: vi.fn(),
  mockUploadKnowledgeFromUrl: vi.fn(),
  mockDeleteKnowledgeDocument: vi.fn(),
  mockGetKnowledgeDocument: vi.fn(),
  mockGetKnowledgeFragments: vi.fn(),
}));

vi.mock("@miladyai/ui", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal();
  return {
    ...actual,
    Select: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
    SelectContent: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
    SelectItem: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("option", props, children),
    SelectTrigger: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
    SelectValue: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
    Button: ({
      children,
      className,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement(
        "button",
        { type: "button", className, ...props },
        children,
      ),
    Checkbox: ({
      checked,
      onCheckedChange,
    }: {
      checked?: boolean;
      onCheckedChange?: (next: boolean) => void;
    }) =>
      React.createElement("button", {
        type: "button",
        "aria-pressed": checked,
        onClick: () => onCheckedChange?.(!checked),
      }),
    Dialog: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogContent: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("div", { className }, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
  };
});

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    listKnowledgeDocuments: mockListKnowledgeDocuments,
    searchKnowledge: mockSearchKnowledge,
    uploadKnowledgeDocumentsBulk: mockUploadKnowledgeDocumentsBulk,
    uploadKnowledgeFromUrl: mockUploadKnowledgeFromUrl,
    deleteKnowledgeDocument: mockDeleteKnowledgeDocument,
    getKnowledgeDocument: mockGetKnowledgeDocument,
    getKnowledgeFragments: mockGetKnowledgeFragments,
  },
}));

vi.mock("@miladyai/app-core/components", async () => {
  const React = await import("react");
  const actual = await vi.importActual<object>("@miladyai/app-core/components");
  return {
    ...actual,
    ConfirmDeleteControl: ({
      triggerClassName,
      onConfirm,
    }: {
      triggerClassName?: string;
      onConfirm: () => void;
    }) =>
      React.createElement(
        "button",
        { type: "button", className: triggerClassName, onClick: onConfirm },
        "delete",
      ),
  };
});

vi.mock("@miladyai/app-core/utils", async () => {
  const actual = await vi.importActual<object>("@miladyai/app-core/utils");
  return {
    ...actual,
    confirmDesktopAction: vi.fn(async () => true),
  };
});

vi.mock("../../src/components/BscTradePanel", async () => {
  const React = await import("react");
  return {
    TradePanel: () => React.createElement("div", null, "TradePanel"),
  };
});

vi.mock("../../src/components/inventory/InventoryToolbar", async () => {
  const React = await import("react");
  return {
    InventoryToolbar: () =>
      React.createElement(
        "div",
        { "data-testid": "inventory-toolbar" },
        "toolbar",
      ),
  };
});

vi.mock("../../src/components/inventory/NftGrid", async () => {
  const React = await import("react");
  return {
    NftGrid: () => React.createElement("div", null, "NftGrid"),
  };
});

vi.mock("../../src/components/inventory/TokensTable", async () => {
  const React = await import("react");
  return {
    TokensTable: () => React.createElement("div", null, "TokensTable"),
  };
});

vi.mock("../../src/components/inventory/useInventoryData", () => ({
  useInventoryData: () => ({
    chainFocus: "all",
    allNfts: [],
    focusedChainError: null,
    focusedChainName: null,
    visibleRows: [],
    totalUsd: 0,
    visibleChainErrors: [],
    focusedNativeBalance: "0",
  }),
}));

import { InventoryView } from "../../src/components/InventoryView";
import { KnowledgeView } from "../../src/components/KnowledgeView";

describe("Knowledge and inventory polish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListKnowledgeDocuments.mockResolvedValue({
      documents: [
        {
          id: "doc-1",
          filename: "README.md",
          contentType: "text/markdown",
          fileSize: 1024,
          createdAt: Date.now(),
          fragmentCount: 4,
          source: "upload",
        },
      ],
    });
    mockSearchKnowledge.mockResolvedValue({ results: [] });
    mockUploadKnowledgeDocumentsBulk.mockResolvedValue({ results: [] });
    mockUploadKnowledgeFromUrl.mockResolvedValue({
      filename: "Imported",
      fragmentCount: 1,
      warnings: [],
      isYouTubeTranscript: false,
    });
    mockDeleteKnowledgeDocument.mockResolvedValue({
      ok: true,
      deletedFragments: 0,
    });
    mockGetKnowledgeDocument.mockResolvedValue({ document: null });
    mockGetKnowledgeFragments.mockResolvedValue({ fragments: [] });
  });

  it("renders knowledge cards and stats using token-driven surfaces", async () => {
    mockUseApp.mockReturnValue({
      t: (key: string) => key,
      setActionNotice: vi.fn(),
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(KnowledgeView));
      await Promise.resolve();
    });

    const tokenPanels = tree.root.findAll(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("rounded-[28px]") &&
        node.props.className.includes("bg-bg/20") &&
        node.props.className.includes("ring-1 ring-border/10"),
    );
    const sidebars = tree.root.findAll(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("backdrop-blur-sm") &&
        node.props.className.includes("border-b border-border/40"),
    );

    expect(tokenPanels.length).toBeGreaterThan(0);
    expect(sidebars.length).toBeGreaterThan(0);
  });

  it("renders the steward badge with token-driven accent styling", async () => {
    mockUseApp.mockReturnValue({
      walletConfig: {
        chains: ["ethereum"],
        selectedChain: "ethereum",
        evmAddress: "0x1234567890123456789012345678901234567890",
      },
      walletAddresses: {
        evmAddress: "0x1234567890123456789012345678901234567890",
      },
      walletBalances: { evm: { chains: [] }, solana: null },
      walletNfts: { evm: [], solana: { nfts: [] } },
      walletLoading: false,
      walletNftsLoading: false,
      inventoryView: "tokens",
      inventorySort: "value",
      inventoryChainFocus: "all",
      walletError: null,
      loadBalances: vi.fn(),
      loadNfts: vi.fn(),
      elizaCloudConnected: false,
      setTab: vi.fn(),
      setState: vi.fn(),
      setActionNotice: vi.fn(),
      executeBscTrade: vi.fn(),
      getBscTradePreflight: vi.fn(),
      getBscTradeQuote: vi.fn(),
      getBscTradeTxStatus: vi.fn(),
      getStewardStatus: vi.fn(async () => ({
        connected: true,
        evmAddress: "0x1234567890123456789012345678901234567890",
      })),
      copyToClipboard: vi.fn(async () => {}),
      t: (key: string) => key,
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
      await Promise.resolve();
    });

    const stewardBadge = tree.root.findByProps({
      "data-testid": "steward-status-badge",
    });
    const sidebar = tree.root.findByType("aside");

    expect(stewardBadge.props.className).toContain("bg-accent/10");
    expect(stewardBadge.props.className).toContain("text-accent-fg");
    expect(String(sidebar.props.className)).toContain("border-b border-border/40");
    expect(String(sidebar.props.className)).toContain("backdrop-blur-sm");
  });
});
