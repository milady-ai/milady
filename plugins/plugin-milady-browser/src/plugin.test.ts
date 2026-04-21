import * as browserWorkspaceService from "@miladyai/agent/services/browser-workspace";
import * as stewardWalletService from "@miladyai/agent/services/steward-wallet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { manageMiladyBrowserWorkspaceAction } from "./action";
import { miladyBrowserWorkspaceProvider } from "./provider";
import {
  approveMiladyWalletRequestAction,
  rejectMiladyWalletRequestAction,
  signWithMiladyWalletAction,
} from "./wallet-action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("@miladyai/plugin-milady-browser", () => {
  it("routes browser subactions through the shared command surface", async () => {
    const executeSpy = vi
      .spyOn(browserWorkspaceService, "executeBrowserWorkspaceCommand")
      .mockResolvedValue({
        mode: "web",
        subaction: "open",
        tab: {
          id: "btab_web_1",
          title: "example.com",
          url: "https://example.com/",
          partition: "persist:milady-browser",
          visible: true,
          createdAt: "2026-04-05T18:45:00.000Z",
          updatedAt: "2026-04-05T18:45:00.000Z",
          lastFocusedAt: "2026-04-05T18:45:00.000Z",
        },
      });
    const callback = vi.fn();

    const result = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: "Open https://example.com in the browser workspace",
        },
      } as never,
      undefined,
      {
        parameters: {
          subaction: "open",
          url: "https://example.com",
          show: true,
        },
      },
      callback,
    );

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subaction: "open",
        show: true,
        url: "https://example.com",
      }),
    );
    expect(result).toMatchObject({ success: true });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Opened visible browser tab"),
      }),
    );
  });

  it("returns desktop-only eval errors instead of rejecting the action", async () => {
    vi.spyOn(
      browserWorkspaceService,
      "executeBrowserWorkspaceCommand",
    ).mockRejectedValue(
      new Error(
        "Milady browser workspace eval is only available in the desktop app.",
      ),
    );
    const callback = vi.fn();

    const result = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: "Run script in btab_web_1",
        },
      } as never,
      undefined,
      {
        parameters: {
          subaction: "eval",
          id: "btab_web_1",
          script: "document.title",
        },
      },
      callback,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("only available in the desktop app"),
    });
  });

  it("supports browser batches through stepsJson on the main action", async () => {
    const executeSpy = vi
      .spyOn(browserWorkspaceService, "executeBrowserWorkspaceCommand")
      .mockResolvedValue({
        mode: "web",
        subaction: "batch",
        steps: [
          {
            mode: "web",
            subaction: "open",
            tab: {
              id: "btab_web_1",
              title: "form",
              url: "http://127.0.0.1:4010/form",
              partition: "persist:milady-browser",
              visible: true,
              createdAt: "2026-04-05T18:45:00.000Z",
              updatedAt: "2026-04-05T18:45:00.000Z",
              lastFocusedAt: "2026-04-05T18:45:00.000Z",
            },
          },
          {
            mode: "web",
            subaction: "get",
            value: "Welcome, Milady",
          },
        ],
        value: "Welcome, Milady",
      });

    const result = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      { content: { text: "Complete the browser task" } } as never,
      undefined,
      {
        parameters: {
          subaction: "batch",
          stepsJson: JSON.stringify([
            {
              subaction: "open",
              url: "http://127.0.0.1:4010/form",
              show: true,
            },
            {
              subaction: "get",
              selector: "h1",
              getMode: "text",
            },
          ]),
        },
      },
      vi.fn(),
    );

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subaction: "batch",
        steps: expect.arrayContaining([
          expect.objectContaining({ subaction: "open" }),
          expect.objectContaining({ subaction: "get" }),
        ]),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Completed 2 browser subactions"),
    });
  });

  it("parses extended browser parity params through the one main browser action", async () => {
    const executeSpy = vi
      .spyOn(browserWorkspaceService, "executeBrowserWorkspaceCommand")
      .mockResolvedValue({
        mode: "web",
        subaction: "network",
        value: [{ pattern: "**/mocked", status: 202 }],
      });

    const result = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      { content: { text: "Route browser requests" } } as never,
      undefined,
      {
        parameters: {
          subaction: "network",
          networkAction: "route",
          url: "**/mocked",
          responseBody: "mocked",
          responseHeaders: { "content-type": "text/plain" },
          responseStatus: 202,
        },
      },
      vi.fn(),
    );

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subaction: "network",
        networkAction: "route",
        responseBody: "mocked",
        responseHeaders: { "content-type": "text/plain" },
        responseStatus: 202,
        url: "**/mocked",
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("queues signing requests and routes approve/reject actions", async () => {
    const signSpy = vi
      .spyOn(stewardWalletService, "signWithStewardWallet")
      .mockResolvedValue({
        approved: false,
        pending: true,
        txId: "tx-1",
      });
    vi.spyOn(
      stewardWalletService,
      "approveStewardWalletRequest",
    ).mockResolvedValue({
      ok: true,
      txHash: "0xapprovedtx1",
    });
    vi.spyOn(
      stewardWalletService,
      "rejectStewardWalletRequest",
    ).mockResolvedValue({
      ok: true,
    });

    const signResult = await signWithMiladyWalletAction.handler(
      {} as never,
      {
        content: {
          text: "Sign a Base transaction",
        },
      } as never,
      undefined,
      {
        parameters: {
          to: "0xabc0000000000000000000000000000000000000",
          value: "1000000000000000",
          chainId: 8453,
          data: "0xdeadbeef",
        },
      },
      vi.fn(),
    );
    const approveResult = await approveMiladyWalletRequestAction.handler(
      {} as never,
      { content: { text: "Approve tx-1" } } as never,
      undefined,
      { parameters: { txId: "tx-1" } },
      vi.fn(),
    );
    const rejectResult = await rejectMiladyWalletRequestAction.handler(
      {} as never,
      { content: { text: "Reject tx-2 because user cancelled" } } as never,
      undefined,
      { parameters: { txId: "tx-2", reason: "user cancelled" } },
      vi.fn(),
    );

    expect(signSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 8453,
        data: "0xdeadbeef",
        to: "0xabc0000000000000000000000000000000000000",
        value: "1000000000000000",
      }),
    );
    expect(signResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Queued the Base transaction for approval"),
    });
    expect(approveResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Approved Steward request tx-1"),
    });
    expect(rejectResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Rejected Steward request tx-2"),
    });
  });

  it("summarizes web tabs and pending wallet approvals in the provider", async () => {
    vi.spyOn(
      browserWorkspaceService,
      "listBrowserWorkspaceTabs",
    ).mockResolvedValue([
      {
        id: "btab_web_1",
        title: "example.com",
        url: "https://example.com/",
        partition: "persist:milady-browser",
        visible: true,
        createdAt: "2026-04-05T18:45:00.000Z",
        updatedAt: "2026-04-05T18:45:00.000Z",
        lastFocusedAt: "2026-04-05T18:45:00.000Z",
      },
    ]);
    vi.spyOn(
      browserWorkspaceService,
      "getBrowserWorkspaceMode",
    ).mockReturnValue("web");
    vi.spyOn(stewardWalletService, "getStewardWalletStatus").mockResolvedValue({
      configured: true,
      available: true,
      connected: true,
      agentId: "agent-browser",
      walletAddresses: {
        evm: "0x1234567890abcdef1234567890abcdef12345678",
        solana: null,
      },
    });
    vi.spyOn(
      stewardWalletService,
      "getStewardPendingApprovals",
    ).mockResolvedValue([
      {
        queueId: "queue:tx-1",
        requestedAt: "2026-04-05T18:45:00.000Z",
        status: "pending",
        transaction: {
          id: "tx-1",
          request: {
            to: "0xabc0000000000000000000000000000000000000",
            value: "1",
            chainId: 8453,
          },
          policyResults: [],
          status: "pending",
          agentId: "agent-browser",
          createdAt: "2026-04-05T18:45:00.000Z",
        },
      },
    ]);

    const result = await miladyBrowserWorkspaceProvider.get?.(
      {} as never,
      {} as never,
      {} as never,
    );

    expect(result?.text).toContain(
      "Milady browser workspace (web): 1 tab open.",
    );
    expect(result?.text).toContain("Steward connected with 1 pending approval");
    expect(result?.data).toMatchObject({
      available: true,
      mode: "web",
      pendingApprovals: 1,
      tabs: [{ id: "btab_web_1" }],
    });
  });
});
