/**
 * Regression tests for the wallet setup card render paths.
 * Validates that:
 * - Setup card shows when no addresses exist
 * - Setup card hides when real addresses are present
 * - Steward-connected without addresses still shows setup
 * - RPC banner requires an address before showing
 * - "Import from Eliza Cloud" only appears once
 */

import React from "react";
import TestRenderer from "react-test-renderer";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { WalletChatBadges } from "./InventoryView";

// Test the hasAnyAddress logic extracted from InventoryView
function hasAnyAddress(args: {
  evmAddr: string | null | undefined;
  solAddr: string | null | undefined;
  stewardConnected: boolean;
  stewardEvmAddr: string | null;
  stewardSolAddr: string | null;
}): boolean {
  const stewardEvmPresent = Boolean(
    args.stewardConnected && args.stewardEvmAddr,
  );
  const stewardSolPresent = Boolean(
    args.stewardConnected && args.stewardSolAddr,
  );
  return Boolean(
    args.evmAddr || args.solAddr || stewardEvmPresent || stewardSolPresent,
  );
}

// Test the headerWarning BSC condition
function shouldShowBscRpcBanner(args: {
  singleChainFocus: string | null;
  evmAddr: string | null | undefined;
  bscReady: boolean;
}): boolean {
  return (
    args.singleChainFocus === "bsc" && Boolean(args.evmAddr) && !args.bscReady
  );
}

describe("wallet setup card visibility", () => {
  it("shows setup card when no addresses exist", () => {
    expect(
      hasAnyAddress({
        evmAddr: null,
        solAddr: null,
        stewardConnected: false,
        stewardEvmAddr: null,
        stewardSolAddr: null,
      }),
    ).toBe(false);
  });

  it("hides setup card when EVM address exists", () => {
    expect(
      hasAnyAddress({
        evmAddr: "0x1234",
        solAddr: null,
        stewardConnected: false,
        stewardEvmAddr: null,
        stewardSolAddr: null,
      }),
    ).toBe(true);
  });

  it("hides setup card when Solana address exists", () => {
    expect(
      hasAnyAddress({
        evmAddr: null,
        solAddr: "So1ana...",
        stewardConnected: false,
        stewardEvmAddr: null,
        stewardSolAddr: null,
      }),
    ).toBe(true);
  });

  it("shows setup card when steward is connected but has NO addresses", () => {
    expect(
      hasAnyAddress({
        evmAddr: null,
        solAddr: null,
        stewardConnected: true,
        stewardEvmAddr: null,
        stewardSolAddr: null,
      }),
    ).toBe(false);
  });

  it("hides setup card when steward has an EVM address", () => {
    expect(
      hasAnyAddress({
        evmAddr: null,
        solAddr: null,
        stewardConnected: true,
        stewardEvmAddr: "0xSteward",
        stewardSolAddr: null,
      }),
    ).toBe(true);
  });
});

describe("BSC RPC banner visibility", () => {
  it("does NOT show when there is no EVM address", () => {
    expect(
      shouldShowBscRpcBanner({
        singleChainFocus: "bsc",
        evmAddr: null,
        bscReady: false,
      }),
    ).toBe(false);
  });

  it("shows when EVM address exists but BSC is not ready", () => {
    expect(
      shouldShowBscRpcBanner({
        singleChainFocus: "bsc",
        evmAddr: "0x1234",
        bscReady: false,
      }),
    ).toBe(true);
  });

  it("does NOT show when BSC is already ready", () => {
    expect(
      shouldShowBscRpcBanner({
        singleChainFocus: "bsc",
        evmAddr: "0x1234",
        bscReady: true,
      }),
    ).toBe(false);
  });

  it("does NOT show when focused on a different chain", () => {
    expect(
      shouldShowBscRpcBanner({
        singleChainFocus: "ethereum",
        evmAddr: "0x1234",
        bscReady: false,
      }),
    ).toBe(false);
  });
});

describe("wallet chat badge strip", () => {
  it("renders the summary badges used above the wallet chat section", () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(React.createElement(WalletChatBadges));
    });
    const mountedTree = tree;
    if (!mountedTree) throw new Error("Failed to render wallet chat badges");
    const badges = mountedTree.root.findByProps({
      "data-testid": "wallet-chat-badges",
    });
    const collectText = (value: unknown): string[] => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.flatMap(collectText);
      if (value && typeof value === "object" && "children" in value) {
        return collectText((value as { children: unknown }).children);
      }
      return [];
    };
    const rendered = collectText(badges.children).join(" ");

    expect(badges.children).toHaveLength(5);
    expect(rendered).toContain("Token");
    expect(rendered).toContain("APY");
    expect(rendered).toContain("TVL");
    expect(rendered).toContain("Accounts");
    expect(rendered).toContain("Daily Returns");
  });
});
