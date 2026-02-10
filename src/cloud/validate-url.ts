/**
 * Cloud base-URL validation — prevents SSRF by enforcing HTTPS and
 * blocking requests to internal/metadata IP addresses.
 *
 * @module cloud/validate-url
 */

import dns from "node:dns";
import { promisify } from "node:util";

const dnsLookupAll = promisify(dns.lookup);

// ---------------------------------------------------------------------------
// IP block-lists (mirrors src/api/database.ts patterns)
// ---------------------------------------------------------------------------

/** Always blocked — cloud metadata & link-local addresses. */
const ALWAYS_BLOCKED_IP_PATTERNS: RegExp[] = [
  /^169\.254\./, // Link-local / AWS/GCP/Azure metadata
  /^0\./, // "This" network
  /^fe80:/i, // IPv6 link-local
];

/** Private/internal ranges — always blocked for cloud URLs. */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./, // IPv4 loopback
  /^10\./, // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 Class B
  /^192\.168\./, // RFC 1918 Class C
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 ULA
];

function isBlockedIp(ip: string): boolean {
  return (
    ALWAYS_BLOCKED_IP_PATTERNS.some((p) => p.test(ip)) ||
    PRIVATE_IP_PATTERNS.some((p) => p.test(ip))
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a cloud base URL before using it in server-side fetch() calls.
 *
 * Checks:
 *  1. URL is well-formed
 *  2. Protocol is HTTPS
 *  3. Hostname does not resolve to a blocked IP (metadata, link-local, private)
 *
 * Returns `null` if the URL is safe, or an error message string if blocked.
 */
export async function validateCloudBaseUrl(
  rawUrl: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return `Invalid cloud base URL: "${rawUrl}"`;
  }

  // Enforce HTTPS
  if (parsed.protocol !== "https:") {
    return `Cloud base URL must use HTTPS, got "${parsed.protocol}" in "${rawUrl}"`;
  }

  const hostname = parsed.hostname;

  // Check the literal hostname (catches raw IPs without DNS lookup)
  if (isBlockedIp(hostname)) {
    return `Cloud base URL "${rawUrl}" points to a blocked address.`;
  }

  // Resolve DNS and check all resulting IPs
  try {
    const results = await dnsLookupAll(hostname, { all: true });
    const addresses = Array.isArray(results) ? results : [results];
    for (const entry of addresses) {
      const ip =
        typeof entry === "string"
          ? entry
          : (entry as { address: string }).address;
      // Strip IPv6-mapped IPv4 prefix (::ffff:169.254.x.y → 169.254.x.y)
      const normalized = ip.replace(/^::ffff:/i, "");
      if (isBlockedIp(normalized)) {
        return (
          `Cloud base URL "${rawUrl}" resolves to ${ip}, ` +
          `which is a blocked internal/metadata address.`
        );
      }
    }
  } catch {
    // DNS resolution failed — block rather than allow (unlike DB connections,
    // cloud URLs should always resolve to public addresses)
    return `Cloud base URL "${rawUrl}" could not be resolved via DNS.`;
  }

  return null;
}
