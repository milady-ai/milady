// @vitest-environment jsdom
import { createTranslator } from "@miladyai/app-core/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryToolbar } from "../InventoryToolbar";

const t = createTranslator("en");

const baseProps = {
  t,
  totalUsd: 0,
  inventoryView: "tokens" as const,
  inventorySort: "value" as const,
  chainFocus: "all",
  walletBalances: null,
  walletNfts: null,
  setState: vi.fn(),
  onChainChange: vi.fn(),
  loadBalances: vi.fn(),
  loadNfts: vi.fn(),
};

describe("InventoryToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
  });

  it("shows address copy row when addresses and onCopyAddress are set", () => {
    const onCopyAddress = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => {
      root.render(
        <InventoryToolbar
          {...baseProps}
          addresses={[
            { label: "EVM", address: "0xabc" },
            { label: "Solana", address: "SoL1" },
          ]}
          onCopyAddress={onCopyAddress}
        />,
      );
    });

    expect(
      host.querySelector('[data-testid="wallet-address-copy-row"]'),
    ).toBeTruthy();

    const evmBtn = host.querySelector(
      '[data-testid="wallet-copy-evm-address"]',
    ) as HTMLButtonElement | null;
    expect(evmBtn).toBeTruthy();

    act(() => {
      evmBtn?.click();
    });
    expect(onCopyAddress).toHaveBeenCalledWith("0xabc");
  });

  it("hides address copy row when onCopyAddress is omitted", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => {
      root.render(
        <InventoryToolbar
          {...baseProps}
          addresses={[{ label: "EVM", address: "0xabc" }]}
        />,
      );
    });

    expect(
      host.querySelector('[data-testid="wallet-address-copy-row"]'),
    ).toBeNull();
  });
});
