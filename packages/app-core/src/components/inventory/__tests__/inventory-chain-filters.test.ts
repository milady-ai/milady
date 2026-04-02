import { describe, expect, it } from "vitest";
import {
  computeSingleChainFocus,
  DEFAULT_INVENTORY_CHAIN_FILTERS,
  matchesInventoryChainFilter,
  normalizeInventoryChainFilters,
  toggleInventoryChainFilter,
} from "../inventory-chain-filters";

describe("inventory chain filters", () => {
  it("defaults missing filters to only bsc enabled", () => {
    expect(normalizeInventoryChainFilters(undefined)).toEqual(
      DEFAULT_INVENTORY_CHAIN_FILTERS,
    );
    expect(computeSingleChainFocus(undefined)).toBe("bsc");
    expect(matchesInventoryChainFilter("bsc", undefined)).toBe(true);
    expect(matchesInventoryChainFilter("ethereum", undefined)).toBe(false);
  });

  it("preserves explicit off toggles when normalizing partial state", () => {
    expect(
      normalizeInventoryChainFilters({
        ethereum: true,
        solana: true,
      }),
    ).toEqual({
      bsc: true,
      ethereum: true,
      base: false,
      avax: false,
      solana: true,
    });
  });

  it("computes the focused chain and toggles from normalized state", () => {
    const bscOnly = {
      bsc: true,
      ethereum: false,
      base: false,
      avax: false,
      solana: false,
    } as const;

    expect(computeSingleChainFocus(bscOnly)).toBe("bsc");
    expect(toggleInventoryChainFilter(undefined, "ethereum")).toEqual({
      bsc: true,
      ethereum: true,
      base: false,
      avax: false,
      solana: false,
    });
  });
});
