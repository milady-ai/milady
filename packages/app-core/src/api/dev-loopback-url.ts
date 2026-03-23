/**
 * Loopback URL validation for dev-only HTTP proxies (`MILADY_ELECTROBUN_SCREENSHOT_URL`, etc.).
 *
 * **Why:** Env is attacker-influenced in some threat models (injection, mistaken export).
 * `fetch(upstream)` from the API process must not become SSRF to arbitrary hosts.
 */

/** Hostnames we allow for dev screenshot upstream (must match Electrobun bind + dev-platform defaults). */
function isAllowedLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

/**
 * Parse `raw` as `http:` or `https:` with a loopback hostname only.
 * Rejects embedded userinfo (`user:pass@`) to reduce odd URL forms.
 *
 * @returns normalized `URL` (caller typically uses `.origin` + path), or `null`.
 */
export function parseAllowedLoopbackHttpUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "") return null;
  if (!isAllowedLoopbackHostname(u.hostname)) return null;
  return u;
}
