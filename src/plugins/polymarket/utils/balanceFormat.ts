/**
 * Format a balance value from the CLOB API.
 * The API returns human-readable decimal strings (not atomic units).
 * We simply parse and format to 6 decimal places.
 */
export function formatBalance(rawBalance: string | number | null | undefined): string {
  if (rawBalance === null || rawBalance === undefined) return "0";
  const numValue = typeof rawBalance === "string" ? parseFloat(rawBalance) : rawBalance;
  if (!Number.isFinite(numValue)) return "0";
  return numValue.toFixed(6);
}
