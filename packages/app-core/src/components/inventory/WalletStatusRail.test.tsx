// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("span", props, children),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { WalletStatusRail } from "./WalletStatusRail";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }
      return flattenText(child);
    })
    .join(" ");
}

describe("WalletStatusRail", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      walletLoading: false,
      walletError: null,
      walletAddresses: {
        evm: "0x123",
        solana: null,
      },
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    });
  });

  it("renders structured status cards and the signature alert badge", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(WalletStatusRail, {}));
    });

    const text = flattenText(tree.root)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    expect(text).toContain("agent activity");
    expect(text).toContain("monitor");
    expect(text).toContain("auto-trading");
    expect(text).toContain("routing live crypto entries from the current signal set");
    expect(text).toContain("stop now");
    expect(text).toContain("opening short on btc");
    expect(text).toContain("leverage");
    expect(text).toContain("applying leverage where policy permits");
    expect(text).toContain("20x");
    expect(text).toContain("50x");
    expect(text).toContain("100x");
    expect(text).toContain("edging");
    expect(text).toContain("butterfly");
    expect(text).toContain("capping exposure at 20% of available capital");
    expect(text).toContain("stop trading");
    expect(text).toContain("halting new orders until risk or signature clears");
    expect(text).toContain("needs signature");
    expect(text).toContain("placeholder: one message is waiting to be signed");
    expect(text).toContain("09:12");
    expect(text).toContain("09:14");
    expect(text).toContain("09:16");
    expect(text).toContain("09:18");
    expect(
      tree.root.findByProps({
        "data-testid": "wallet-status-signature-alert-badge",
      }).children,
    ).toContain("6");
  });
});
