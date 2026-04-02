/**
 * BSC contract addresses and configuration for Flap.sh + FourMeme.
 */

export const BSC_CHAIN_ID = 56;

export const BSC_CONTRACTS = {
  // Flap Portal (single entrypoint for all Flap operations)
  FLAP_PORTAL: '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0',

  // FourMeme contracts
  FOUR_TOKEN_MANAGER_V2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
  FOUR_HELPER3: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034',
  FOUR_AGENT_IDENTIFIER: '0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13',

  // Shared BSC addresses
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
} as const;

export const FOUR_API_BASE = 'https://four.meme/meme-api/v1';
export const FLAP_GRAPHQL = 'https://api.flap.sh/graphql';

export const BSC_RPC_URLS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
] as const;

/** Default slippage tolerance (5%) */
export const DEFAULT_SLIPPAGE_PCT = 5;

/** Flap BSC buy/sell fee: 1% */
export const FLAP_FEE_PCT = 1;

/** FourMeme labels for token creation */
export const FOURMEME_LABELS = [
  'Meme', 'AI', 'Defi', 'Games', 'Infra',
  'De-Sci', 'Social', 'Depin', 'Charity', 'Others',
] as const;

export type FourMemeLabel = typeof FOURMEME_LABELS[number];

/** Get BSC RPC URL (from env or default) */
export function getBscRpcUrl(): string {
  return process.env.BSC_RPC_URL || BSC_RPC_URLS[0];
}

/** Get EVM private key from env */
export function getPrivateKey(): string {
  const key = process.env.EVM_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'EVM_PRIVATE_KEY is not set. Configure it in your agent environment.',
    );
  }
  return key;
}
