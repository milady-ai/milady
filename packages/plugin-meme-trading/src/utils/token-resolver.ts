/**
 * Token resolver — helps convert name/symbol to contract address.
 *
 * FourMeme has a search API. Flap requires address (no search API).
 */

import { FOUR_API_BASE } from '../config.js';
import { isValidAddress } from './validation.js';

export interface ResolvedToken {
  address: string;
  name: string;
  symbol: string;
  protocol: 'flap' | 'fourmeme';
}

/**
 * Search FourMeme by name or symbol.
 * Returns matching tokens from the API.
 */
export async function searchFourMemeTokens(query: string): Promise<ResolvedToken[]> {
  try {
    const resp = await fetch(`${FOUR_API_BASE}/public/token/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: query,
        pageNo: 1,
        pageSize: 5,
      }),
    });

    if (!resp.ok) return [];

    const data = (await resp.json()) as any;
    const tokens = data?.data?.list ?? data?.data ?? [];

    return tokens.map((t: any) => ({
      address: t.address || t.tokenAddress || '',
      name: t.name || '',
      symbol: t.symbol || '',
      protocol: 'fourmeme' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Try to resolve a user input to a token address.
 *
 * - If it's already an address, validate and return it.
 * - If it's a name/symbol, search the protocol's API.
 * - Returns null if ambiguous or not found (ask user to clarify).
 */
export async function resolveToken(
  input: string,
  protocol: 'flap' | 'fourmeme',
): Promise<ResolvedToken | null> {
  // If it looks like an address, just return it
  if (isValidAddress(input)) {
    return {
      address: input,
      name: '',
      symbol: '',
      protocol,
    };
  }

  // For FourMeme, try the search API
  if (protocol === 'fourmeme') {
    const results = await searchFourMemeTokens(input);

    // Exact match on symbol (case-insensitive)
    const exact = results.find(
      (r) => r.symbol.toLowerCase() === input.toLowerCase(),
    );
    if (exact) return exact;

    // Single result = unambiguous
    if (results.length === 1) return results[0];

    // Multiple or none = can't resolve
    return null;
  }

  // Flap has no search API — require address
  return null;
}
