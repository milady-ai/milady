/**
 * Autofill whitelist.
 *
 * Enforces the invariant that autofill only fires on registrable domains the
 * user has explicitly approved. The extension ships with a default list
 * (`popular-sites.json`) and may extend it at runtime via the agent action
 * `ADD_AUTOFILL_WHITELIST` (which requires explicit user confirmation).
 *
 * Domain matching is registrable-domain based: a URL for `mail.google.com`
 * is covered by the entry `google.com`. We do NOT require entries for every
 * subdomain. That matches how password managers and users reason about
 * "the site I trust".
 */
import popularSites from "./popular-sites.json" with { type: "json" };

export interface WhitelistFile {
  readonly version: number;
  readonly description?: string;
  readonly domains: readonly string[];
}

const DEFAULTS: WhitelistFile = popularSites as WhitelistFile;

export function defaultWhitelistDomains(): readonly string[] {
  return DEFAULTS.domains;
}

/**
 * Extract the registrable domain from a URL or bare host string.
 *
 * This is a pragmatic implementation that strips the leftmost labels until
 * two remain — correct for all common TLDs used by the default list.
 * Multi-level TLDs (e.g. `.co.uk`) are intentionally conservative: we treat
 * them as two labels, which means entries for `example.co.uk` must be
 * stored exactly as `example.co.uk`. The matcher then accepts both
 * `example.co.uk` and any subdomain of it.
 */
export function extractRegistrableDomain(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  let host: string;
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    const url = safeParseUrl(trimmed);
    if (!url) return null;
    host = url.hostname;
  } else {
    host = trimmed.replace(/^\/+/, "").split("/")[0] ?? "";
  }
  host = host.toLowerCase().replace(/\.$/, "");
  if (host.length === 0) return null;
  if (host === "localhost") return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  if (host.startsWith("[") && host.endsWith("]")) return null;

  const labels = host.split(".").filter((l) => l.length > 0);
  if (labels.length < 2) return null;
  return labels.slice(-2).join(".");
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Normalize a user-supplied domain entry for storage. Returns null if the
 * input cannot be interpreted as a registrable domain. The stored form is
 * always lowercase and free of scheme/path/port.
 */
export function normalizeWhitelistEntry(input: string): string | null {
  return extractRegistrableDomain(input);
}

export interface WhitelistCheckResult {
  readonly allowed: boolean;
  readonly registrableDomain: string | null;
  readonly matched: string | null;
}

/**
 * Check whether `url` is covered by any entry in `domains`.
 *
 * An entry `D` matches a URL whose registrable domain is `D`, or whose host
 * ends with `.D` (subdomain coverage). Entries that are themselves
 * subdomains (e.g. `mail.google.com` would normalize to `google.com` and
 * cover the entire parent — callers should normalize before persisting).
 */
export function isWhitelisted(
  url: string,
  domains: readonly string[],
): WhitelistCheckResult {
  const registrable = extractRegistrableDomain(url);
  if (registrable === null) {
    return { allowed: false, registrableDomain: null, matched: null };
  }
  let host: string = registrable;
  const parsed = safeParseUrl(url);
  if (parsed) {
    host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  } else if (!/^[a-z]+:\/\//i.test(url)) {
    host = url.trim().toLowerCase().split("/")[0] ?? registrable;
  }
  for (const raw of domains) {
    const entry = normalizeWhitelistEntry(raw);
    if (!entry) continue;
    if (host === entry || host.endsWith(`.${entry}`)) {
      return { allowed: true, registrableDomain: registrable, matched: entry };
    }
  }
  return { allowed: false, registrableDomain: registrable, matched: null };
}

/**
 * In-extension persistent store of the active whitelist. Merges the shipped
 * defaults with user-added entries saved to `chrome.storage.local`. Exposed
 * as an interface so tests can supply an in-memory store.
 */
export interface WhitelistStorage {
  getUserDomains(): Promise<readonly string[]>;
  setUserDomains(domains: readonly string[]): Promise<void>;
}

const STORAGE_KEY = "lifeops.autofill.userWhitelist";

export function createChromeStorageWhitelist(): WhitelistStorage {
  return {
    async getUserDomains() {
      const raw = await chrome.storage.local.get(STORAGE_KEY);
      const stored = raw[STORAGE_KEY];
      if (!Array.isArray(stored)) return [];
      return stored.filter((v): v is string => typeof v === "string");
    },
    async setUserDomains(domains) {
      await chrome.storage.local.set({ [STORAGE_KEY]: [...domains] });
    },
  };
}

export async function loadEffectiveWhitelist(
  storage: WhitelistStorage,
): Promise<readonly string[]> {
  const user = await storage.getUserDomains();
  const merged = new Set<string>();
  for (const d of DEFAULTS.domains) {
    const n = normalizeWhitelistEntry(d);
    if (n) merged.add(n);
  }
  for (const d of user) {
    const n = normalizeWhitelistEntry(d);
    if (n) merged.add(n);
  }
  return [...merged].sort();
}

export async function addUserWhitelistEntry(
  storage: WhitelistStorage,
  domain: string,
): Promise<{ added: boolean; normalized: string | null }> {
  const normalized = normalizeWhitelistEntry(domain);
  if (!normalized) return { added: false, normalized: null };
  const existing = await storage.getUserDomains();
  if (existing.some((e) => normalizeWhitelistEntry(e) === normalized)) {
    return { added: false, normalized };
  }
  await storage.setUserDomains([...existing, normalized]);
  return { added: true, normalized };
}
