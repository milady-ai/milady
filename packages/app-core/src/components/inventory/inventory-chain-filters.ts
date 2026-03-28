/**
 * Helpers for per-chain inventory visibility toggles (primary chains only).
 */

import type { InventoryChainFilters } from "@miladyai/app-core/state";
import { PRIMARY_CHAIN_KEYS, resolveChainKey } from "../chainConfig";
import type { ChainKey } from "../chainConfig";

export type PrimaryInventoryChainKey = keyof InventoryChainFilters;

export const DEFAULT_INVENTORY_CHAIN_FILTERS: InventoryChainFilters = {
  ethereum: true,
  base: true,
  bsc: true,
  avax: true,
  solana: true,
};

function isPrimaryInventoryChainKey(
  k: ChainKey,
): k is PrimaryInventoryChainKey {
  return (PRIMARY_CHAIN_KEYS as readonly ChainKey[]).includes(k);
}

export function matchesInventoryChainFilter(
  chainName: string,
  filters: InventoryChainFilters,
): boolean {
  const k = resolveChainKey(chainName);
  if (!k || !isPrimaryInventoryChainKey(k)) return false;
  return filters[k] === true;
}

/** When exactly one chain is enabled, returns that key; otherwise null. */
export function computeSingleChainFocus(
  filters: InventoryChainFilters,
): PrimaryInventoryChainKey | null {
  const enabled = PRIMARY_CHAIN_KEYS.filter(
    (k): k is PrimaryInventoryChainKey =>
      isPrimaryInventoryChainKey(k) && filters[k],
  );
  return enabled.length === 1 ? enabled[0]! : null;
}

export function toggleInventoryChainFilter(
  filters: InventoryChainFilters,
  key: PrimaryInventoryChainKey,
): InventoryChainFilters {
  return { ...filters, [key]: !filters[key] };
}
