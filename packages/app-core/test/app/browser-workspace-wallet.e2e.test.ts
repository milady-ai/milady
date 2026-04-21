// @vitest-environment jsdom

import type { StewardPendingApproval } from "@miladyai/shared/contracts/wallet";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BROWSER_WALLET_REQUEST_TYPE,
  BROWSER_WALLET_RESPONSE_TYPE,
} from "../../src/browser-workspace-wallet";
import { createInlineUiMock } from "./mockInlineUi";

const { mockClient, mockOpenExternalUrl, mockSetActionNotice, mockUseApp } =
  vi.hoisted(() => ({
    mockClient: {
      closeBrowserWorkspaceTab: vi.fn(),
      getBrowserWorkspace: vi.fn(),
      getWalletConfig: vi.fn(),
      navigateBrowserWorkspaceTab: vi.fn(),
      openBrowserWorkspaceTab: vi.fn(),
      signBrowserSolanaMessage: vi.fn(),
      signBrowserWalletMessage: vi.fn(),
      sendBrowserWalletTransaction: vi.fn(),
      showBrowserWorkspaceTab: vi.fn(),
    },
    mockOpenExternalUrl: vi.fn(async () => {}),
    mockSetActionNotice: vi.fn(),
    mockUseApp: vi.fn(),
  }));

vi.mock("@miladyai/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");
  const inline = createInlineUiMock(actual);
  return {
    ...inline,
    PageLayout: ({
      children,
      contentHeader,
      contentRef,
      sidebar,
      ...props
    }: React.PropsWithChildren<{
      contentHeader?: React.ReactNode;
      contentRef?: React.Ref<HTMLElement>;
      sidebar?: React.ReactNode;
    }>) =>
      React.createElement(
        "div",
        props,
        sidebar,
        contentHeader,
        React.createElement("main", { ref: contentRef }, children),
      ),
  };
});

vi.mock("../../src/state", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/state")>("../../src/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("../../src/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/api")>("../../src/api");
  return {
    ...actual,
    client: mockClient,
  };
});

vi.mock("../../src/utils", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/utils")>("../../src/utils");
  return {
    ...actual,
    openExternalUrl: mockOpenExternalUrl,
  };
});

import { BrowserWorkspaceView } from "../../src/components/pages/BrowserWorkspaceView";

interface BrowserTabState {
  id: string;
  title: string;
  url: string;
  partition: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  lastFocusedAt: string | null;
}

interface WorkspaceState {
  mode: "web";
  tabs: BrowserTabState[];
}

const FIXED_TIMESTAMP = "2026-04-05T18:45:00.000Z";
const FIXED_WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const FIXED_SOLANA_ADDRESS = "9xQeWvG816bUx9EPjHmaT23yvVMiD58o2fgxMZ4Y7K2N";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTab(id: string, url: string, visible = false): BrowserTabState {
  return {
    id,
    title: new URL(url).hostname,
    url,
    partition: "persist:milady-browser",
    visible,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    lastFocusedAt: visible ? FIXED_TIMESTAMP : null,
  };
}

function createPendingApproval(
  txId: string,
  to: string,
  value: string,
  chainId: number,
): StewardPendingApproval {
  return {
    queueId: `queue:${txId}`,
    requestedAt: FIXED_TIMESTAMP,
    status: "pending",
    transaction: {
      agentId: "agent-browser",
      createdAt: FIXED_TIMESTAMP,
      id: txId,
      policyResults: [],
      request: {
        agentId: "agent-browser",
        tenantId: "tenant-browser",
        to,
        value,
        chainId,
      },
      status: "pending",
    },
  };
}

describe("Browser workspace wallet integration", () => {
  let workspace: WorkspaceState;
  let pendingApprovals: StewardPendingApproval[];
  let tabCounter: number;
  let signatureCounter: number;
  let getStewardPending: ReturnType<typeof vi.fn>;
  let getStewardStatus: ReturnType<typeof vi.fn>;
  let walletAddresses: {
    evmAddress: string | null;
    solanaAddress: string | null;
  } | null;
  let walletConfig: {
    evmAddress?: string | null;
    executionReady?: boolean;
    executionBlockedReason?: string | null;
    solanaAddress?: string | null;
    solanaSigningAvailable?: boolean;
  } | null;

  beforeEach(() => {
    cleanup();
    tabCounter = 0;
    signatureCounter = 0;
    workspace = { mode: "web", tabs: [] };
    pendingApprovals = [];

    mockClient.getBrowserWorkspace.mockImplementation(async () =>
      clone(workspace),
    );
    mockClient.openBrowserWorkspaceTab.mockImplementation(
      async ({
        show = true,
        title,
        url = "about:blank",
      }: {
        show?: boolean;
        title?: string;
        url?: string;
      }) => {
        tabCounter += 1;
        const nextTab = {
          ...createTab(`tab-${tabCounter}`, url, show),
          title: title ?? createTab(`tab-${tabCounter}`, url, show).title,
        };
        workspace = {
          mode: "web",
          tabs: [
            ...workspace.tabs.map((tab) => ({
              ...tab,
              visible: false,
            })),
            nextTab,
          ],
        };
        return { tab: clone(nextTab) };
      },
    );
    mockClient.navigateBrowserWorkspaceTab.mockImplementation(
      async (id: string, url: string) => {
        workspace = {
          mode: "web",
          tabs: workspace.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  title: new URL(url).hostname,
                  updatedAt: FIXED_TIMESTAMP,
                  url,
                }
              : tab,
          ),
        };
        const tab = workspace.tabs.find((entry) => entry.id === id);
        if (!tab) {
          throw new Error(`Missing tab ${id}`);
        }
        return { tab: clone(tab) };
      },
    );
    mockClient.showBrowserWorkspaceTab.mockImplementation(
      async (id: string) => {
        workspace = {
          mode: "web",
          tabs: workspace.tabs.map((tab) => ({
            ...tab,
            lastFocusedAt: tab.id === id ? FIXED_TIMESTAMP : tab.lastFocusedAt,
            visible: tab.id === id,
          })),
        };
        const tab = workspace.tabs.find((entry) => entry.id === id);
        if (!tab) {
          throw new Error(`Missing tab ${id}`);
        }
        return { tab: clone(tab) };
      },
    );
    mockClient.closeBrowserWorkspaceTab.mockImplementation(
      async (id: string) => {
        workspace = {
          mode: "web",
          tabs: workspace.tabs.filter((tab) => tab.id !== id),
        };
        return { closed: true };
      },
    );
    mockClient.sendBrowserWalletTransaction.mockImplementation(
      async ({
        chainId,
        to,
        value,
      }: {
        chainId: number;
        to: string;
        value: string;
      }) => {
        signatureCounter += 1;
        const txId = `tx-${signatureCounter}`;
        pendingApprovals = [
          ...pendingApprovals,
          createPendingApproval(txId, to, value, chainId),
        ];
        return {
          approved: false,
          mode: "steward" as const,
          pending: true,
          txId,
        };
      },
    );
    mockClient.signBrowserWalletMessage.mockResolvedValue({
      mode: "local-key",
      signature: "0xlocalsignedmessage",
    });
    mockClient.signBrowserSolanaMessage.mockResolvedValue({
      address: FIXED_SOLANA_ADDRESS,
      mode: "local-key",
      signatureBase64: "c29sYW5hLXNpZw==",
    });

    getStewardStatus = vi.fn(async () => ({
      agentId: "agent-browser",
      available: true,
      configured: true,
      connected: true,
      evmAddress: FIXED_WALLET_ADDRESS,
      walletAddresses: {
        evm: FIXED_WALLET_ADDRESS,
        solana: null,
      },
    }));
    getStewardPending = vi.fn(async () => clone(pendingApprovals));
    walletAddresses = {
      evmAddress: FIXED_WALLET_ADDRESS,
      solanaAddress: FIXED_SOLANA_ADDRESS,
    };
    walletConfig = {
      evmAddress: FIXED_WALLET_ADDRESS,
      executionReady: true,
      executionBlockedReason: null,
      solanaAddress: FIXED_SOLANA_ADDRESS,
      solanaSigningAvailable: true,
    };
    mockClient.getWalletConfig.mockResolvedValue(walletConfig);

    mockUseApp.mockImplementation(() => ({
      getStewardPending,
      getStewardStatus,
      setActionNotice: mockSetActionNotice,
      t: (
        key: string,
        options?: {
          defaultValue?: string;
          [name: string]: unknown;
        },
      ) => options?.defaultValue ?? key,
      walletAddresses,
      walletConfig,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens and switches logical browser tabs in the web workspace without rendering a wallet rail", async () => {
    render(React.createElement(BrowserWorkspaceView));

    await waitFor(() => {
      expect(mockClient.getBrowserWorkspace).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByPlaceholderText("Enter a URL"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(mockClient.openBrowserWorkspaceTab).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "example.com",
          url: "https://example.com/",
        }),
      );
    });

    expect(
      await screen.findByRole("button", { name: "example.com" }),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Enter a URL"), {
      target: { value: "https://milady.ai" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "New tab" })[0]);

    expect(
      await screen.findByRole("button", { name: "milady.ai" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "example.com" }));

    await waitFor(() => {
      expect(mockClient.showBrowserWorkspaceTab).toHaveBeenCalledWith("tab-1");
    });

    expect(screen.getByTitle("example.com")).toBeTruthy();
    expect(screen.queryByTestId("browser-workspace-wallet-panel")).toBeNull();
    expect(await screen.findByText("Wallet connected")).toBeTruthy();
  });

  it("renders a real collapsed rail instead of squeezing the sidebar body", async () => {
    workspace = {
      mode: "web",
      tabs: [createTab("tab-1", "https://example.com/", true)],
    };

    render(React.createElement(BrowserWorkspaceView));

    expect(await screen.findByText("Browser workspace")).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("browser-workspace-sidebar-collapse-toggle"),
    );

    const sidebar = screen.getByTestId("browser-workspace-sidebar");
    expect(sidebar.getAttribute("data-collapsed")).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", { name: "New tab" }),
    ).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", { name: "example.com" }),
    ).toBeTruthy();
    expect(within(sidebar).queryByText("Mode notes")).toBeNull();
  });

  it("bridges wallet state and transaction requests to embedded browser pages", async () => {
    workspace = {
      mode: "web",
      tabs: [createTab("tab-1", "https://swap.example/", true)],
    };

    render(React.createElement(BrowserWorkspaceView));

    const iframe = (await screen.findByTitle(
      "swap.example",
    )) as HTMLIFrameElement;
    const iframeWindow = iframe.contentWindow;
    expect(iframeWindow).toBeTruthy();
    if (!iframeWindow) {
      throw new Error("Missing iframe window");
    }
    const postMessageSpy = vi.spyOn(iframeWindow, "postMessage");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "wallet-state-1",
          method: "getState",
        },
        origin: "https://swap.example",
        source: iframeWindow,
      }),
    );

    await waitFor(() => {
      expect(
        postMessageSpy.mock.calls.some(
          ([payload, origin]) =>
            origin === "https://swap.example" &&
            (payload as { type?: string; requestId?: string }).type ===
              BROWSER_WALLET_RESPONSE_TYPE &&
            (payload as { requestId?: string }).requestId === "wallet-state-1",
        ),
      ).toBe(true);
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "wallet-send-1",
          method: "sendTransaction",
          params: {
            broadcast: true,
            chainId: 8453,
            data: "0xdeadbeef",
            description: "Browser fixture request",
            to: "0xabc0000000000000000000000000000000000000",
            value: "1000000000000000",
          },
        },
        origin: "https://swap.example",
        source: iframeWindow,
      }),
    );

    await waitFor(() => {
      expect(mockClient.sendBrowserWalletTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          broadcast: true,
          chainId: 8453,
          data: "0xdeadbeef",
          description: "Browser fixture request",
          to: "0xabc0000000000000000000000000000000000000",
          value: "1000000000000000",
        }),
      );
    });

    await waitFor(() => {
      expect(
        postMessageSpy.mock.calls.some(
          ([payload, origin]) =>
            origin === "https://swap.example" &&
            (payload as { type?: string; requestId?: string }).type ===
              BROWSER_WALLET_RESPONSE_TYPE &&
            (payload as { requestId?: string }).requestId === "wallet-send-1",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText("1 pending")).toBeTruthy();
  });

  it("supports provider-style browser wallet requests without rendering the wallet UI", async () => {
    workspace = {
      mode: "web",
      tabs: [createTab("tab-1", "https://app.example/", true)],
    };
    pendingApprovals = [];
    getStewardStatus = vi.fn(async () => ({
      available: false,
      configured: false,
      connected: false,
      error: null,
    }));
    walletAddresses = {
      evmAddress: FIXED_WALLET_ADDRESS,
      solanaAddress: FIXED_SOLANA_ADDRESS,
    };
    walletConfig = {
      evmAddress: FIXED_WALLET_ADDRESS,
      executionReady: true,
      executionBlockedReason: null,
      solanaAddress: FIXED_SOLANA_ADDRESS,
      solanaSigningAvailable: true,
    };
    mockClient.getWalletConfig.mockResolvedValue(walletConfig);
    mockClient.signBrowserWalletMessage.mockResolvedValue({
      mode: "local-key",
      signature: "0xproviderlocalsignature",
    });
    mockClient.signBrowserSolanaMessage.mockResolvedValue({
      address: FIXED_SOLANA_ADDRESS,
      mode: "local-key",
      signatureBase64: "cHJvdmlkZXItc29sLXNpZw==",
    });
    mockClient.sendBrowserWalletTransaction.mockResolvedValue({
      approved: true,
      mode: "local-key",
      pending: false,
      txHash: "0xproviderlocaltx",
    });
    mockUseApp.mockImplementation(() => ({
      getStewardPending,
      getStewardStatus,
      setActionNotice: mockSetActionNotice,
      t: (
        key: string,
        options?: {
          defaultValue?: string;
          [name: string]: unknown;
        },
      ) => options?.defaultValue ?? key,
      walletAddresses,
      walletConfig,
    }));

    render(React.createElement(BrowserWorkspaceView));

    const iframe = (await screen.findByTitle(
      "app.example",
    )) as HTMLIFrameElement;
    const iframeWindow = iframe.contentWindow;
    expect(iframeWindow).toBeTruthy();
    if (!iframeWindow) {
      throw new Error("Missing iframe window");
    }

    const postMessageSpy = vi.spyOn(iframeWindow, "postMessage");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-accounts",
          method: "eth_requestAccounts",
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-solana-connect",
          method: "solana_connect",
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-solana-sign",
          method: "solana_signMessage",
          params: {
            messageBase64: "U29sYW5hIHNheXMgaGk=",
          },
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-switch",
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x2105" }],
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-chain",
          method: "eth_chainId",
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-sign",
          method: "personal_sign",
          params: ["Browser says hi", FIXED_WALLET_ADDRESS],
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: BROWSER_WALLET_REQUEST_TYPE,
          requestId: "provider-send",
          method: "eth_sendTransaction",
          params: [
            {
              data: "0xdeadbeef",
              to: "0xabc0000000000000000000000000000000000000",
              value: "1000000000000000",
            },
          ],
        },
        origin: "https://app.example",
        source: iframeWindow,
      }),
    );

    await waitFor(() => {
      expect(mockClient.signBrowserWalletMessage).toHaveBeenCalledWith(
        "Browser says hi",
      );
      expect(mockClient.signBrowserSolanaMessage).toHaveBeenCalledWith({
        messageBase64: "U29sYW5hIHNheXMgaGk=",
      });
      expect(mockClient.sendBrowserWalletTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 8453,
          data: "0xdeadbeef",
          to: "0xabc0000000000000000000000000000000000000",
          value: "1000000000000000",
        }),
      );
    });

    await waitFor(() => {
      const responses = postMessageSpy.mock.calls
        .map(([payload, origin]) => ({ origin, payload }))
        .filter(
          (entry) =>
            entry.origin === "https://app.example" &&
            typeof entry.payload === "object" &&
            entry.payload !== null &&
            (entry.payload as { type?: string }).type ===
              BROWSER_WALLET_RESPONSE_TYPE,
        );

      expect(
        responses.some(
          (entry) =>
            (entry.payload as { requestId?: string; result?: unknown })
              .requestId === "provider-solana-connect" &&
            JSON.stringify((entry.payload as { result?: unknown }).result) ===
              JSON.stringify({ address: FIXED_SOLANA_ADDRESS }),
        ),
      ).toBe(true);
      expect(
        responses.some(
          (entry) =>
            (entry.payload as { requestId?: string; result?: unknown })
              .requestId === "provider-solana-sign" &&
            JSON.stringify((entry.payload as { result?: unknown }).result) ===
              JSON.stringify({
                address: FIXED_SOLANA_ADDRESS,
                mode: "local-key",
                signatureBase64: "cHJvdmlkZXItc29sLXNpZw==",
              }),
        ),
      ).toBe(true);
      expect(
        responses.some(
          (entry) =>
            (entry.payload as { requestId?: string; result?: unknown })
              .requestId === "provider-accounts" &&
            JSON.stringify((entry.payload as { result?: unknown }).result) ===
              JSON.stringify([FIXED_WALLET_ADDRESS]),
        ),
      ).toBe(true);
      expect(
        responses.some(
          (entry) =>
            (entry.payload as { requestId?: string; result?: unknown })
              .requestId === "provider-chain" &&
            (entry.payload as { result?: unknown }).result === "0x2105",
        ),
      ).toBe(true);
      expect(
        responses.some(
          (entry) =>
            (entry.payload as { requestId?: string; result?: unknown })
              .requestId === "provider-sign" &&
            (entry.payload as { result?: unknown }).result ===
              "0xproviderlocalsignature",
        ),
      ).toBe(true);
      expect(
        responses.some(
          (entry) =>
            (entry.payload as { requestId?: string; result?: unknown })
              .requestId === "provider-send" &&
            (entry.payload as { result?: unknown }).result ===
              "0xproviderlocaltx",
        ),
      ).toBe(true);
    });

    expect(screen.queryByTestId("browser-workspace-wallet-panel")).toBeNull();
  });
});
