/**
 * Anti-hallucination validation utilities.
 * Always verify on-chain before executing trades.
 */

import { ethers } from 'ethers';
import { getBscRpcUrl, BSC_CONTRACTS } from '../config.js';

const ERC20_MINIMAL_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

/** Validate that a string is a valid EVM address */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/** Check if address is a contract (not an EOA) on BSC */
export async function isContract(address: string): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(getBscRpcUrl());
  const code = await provider.getCode(address);
  return code !== '0x';
}

/** Get ERC20 token info from chain */
export async function getErc20Info(
  tokenAddress: string,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    const provider = new ethers.JsonRpcProvider(getBscRpcUrl());
    const contract = new ethers.Contract(tokenAddress, ERC20_MINIMAL_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    return { name, symbol, decimals: Number(decimals) };
  } catch {
    return null;
  }
}

/** Get wallet's token balance */
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(getBscRpcUrl());
  const contract = new ethers.Contract(tokenAddress, ERC20_MINIMAL_ABI, provider);
  return contract.balanceOf(walletAddress);
}

/** Get wallet's native BNB balance */
export async function getBnbBalance(walletAddress: string): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(getBscRpcUrl());
  return provider.getBalance(walletAddress);
}

/**
 * Validate that we can actually trade this token:
 * 1. Address is valid
 * 2. It's a contract
 * 3. It has ERC20 methods
 */
export async function validateTokenForTrade(
  tokenAddress: string,
): Promise<{ valid: true; name: string; symbol: string; decimals: number } | { valid: false; error: string }> {
  if (!isValidAddress(tokenAddress)) {
    return { valid: false, error: 'Invalid address format' };
  }

  const contractExists = await isContract(tokenAddress);
  if (!contractExists) {
    return { valid: false, error: 'Address is not a contract on BSC' };
  }

  const info = await getErc20Info(tokenAddress);
  if (!info) {
    return { valid: false, error: 'Address is not a valid ERC20 token' };
  }

  return { valid: true, ...info };
}
