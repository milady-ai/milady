import { describe, expect, it } from "vitest";
import {
  computeSingleChainFocus,
  DEFAULT_INVENTORY_CHAIN_FILTERS,
  matchesInventoryChainFilter,
  normalizeInventoryChainFilters,
  toggleInventoryChainFilter,
} from "../inventory-chain-filters";

describe("inventory chain filters", () => {
  it("defaults missing filters to every primary chain enabled", () => {
    expect(normalizeInventoryChainFilters(undefined)).toEqual(
      DEFAULT_INVENTORY_CHAIN_FILTERS,
    );
    expect(computeSingleChainFocus(undefined)).toBeNull();
    expect(matchesInventoryChainFilter("ethereum", undefined)).toBe(true);
  });

  it("preserves explicit off toggles when normalizing partial state", () => {
    expect(
      normalizeInventoryChainFilters({
        ethereum: false,
        solana: false,
      }),
    ).toEqual({
      ethereum: false,
      base: true,
      bsc: true,
      avax: true,
      solana: false,
    });
  });

  it("computes the focused chain and toggles from normalized state", () => {
    const bscOnly = {
      ethereum: false,
      base: false,
      bsc: true,
      avax: false,
      solana: false,
    } as const;

    expect(computeSingleChainFocus(bscOnly)).toBe("bsc");
    expect(toggleInventoryChainFilter(undefined, "ethereum")).toEqual({
      ethereum: false,
      base: true,
      bsc: true,
      avax: true,
      solana: true,
    });
  });
});
