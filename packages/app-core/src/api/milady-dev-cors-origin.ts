/**
 * Loopback-only value for `Access-Control-Allow-Origin` in the Milady dev API.
 *
 * **Why extracted:** unit-test Origin / Referer rules without booting HTTP.
 *
 * **Rules:** Mirror request `Origin` when it is an http(s) URL whose host is
 * localhost, 127.0.0.1, or ::1. If `Origin` is empty, fall back to parsing
 * `Referer` the same way (WKWebView sometimes omits `Origin` on cross-port
 * fetches). If `Origin` is non-empty but not loopback, return `null` — never
 * consult `Referer`, so a page cannot send a forbidden `Origin` and still get
 * ACAO from a loopback `Referer`.
 */
const LOOPBACK_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function firstHeader(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "" ? undefined : s;
}

export function resolveMiladyDevCorsAllowOrigin(
  originHeader: string,
  refererHeader: string | string[] | undefined,
): string | null {
  if (LOOPBACK_ORIGIN_RE.test(originHeader)) {
    return originHeader;
  }
  if (originHeader !== "") {
    return null;
  }
  const ref = firstHeader(refererHeader);
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "[::1]" ||
      h === "::1"
    ) {
      return u.origin;
    }
  } catch {
    return null;
  }
  return null;
}
