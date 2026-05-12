// node:url. URL/URLSearchParams are global in JSC. We add fileURLToPath /
// pathToFileURL and the legacy url.parse / url.format surface (which lots of
// Node-era code still imports even in 2026).

export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export function fileURLToPath(u: string | URL): string {
  const url = typeof u === "string" ? new URL(u) : u;
  if (url.protocol !== "file:") {
    throw new TypeError("expected file: URL");
  }
  let pathname = decodeURIComponent(url.pathname);
  // On posix the URL is file:///abs/path — pathname is /abs/path.
  return pathname;
}

export function pathToFileURL(path: string): URL {
  let resolved = path;
  if (resolved.charCodeAt(0) !== 47) resolved = "/" + resolved;
  return new URL("file://" + encodeURI(resolved));
}

// Legacy parse/format. Lots of older code uses these.
export function parse(urlStr: string, parseQuery = false, slashesDenoteHost = false): {
  protocol: string | null;
  slashes: boolean | null;
  auth: string | null;
  host: string | null;
  port: string | null;
  hostname: string | null;
  hash: string | null;
  search: string | null;
  query: string | URLSearchParams | null;
  pathname: string | null;
  path: string | null;
  href: string;
} {
  try {
    const u = new URL(urlStr);
    const query = parseQuery
      ? Object.fromEntries(u.searchParams.entries())
      : u.search ? u.search.slice(1) : null;
    return {
      protocol: u.protocol || null,
      slashes: urlStr.includes("//"),
      auth: u.username ? (u.password ? `${u.username}:${u.password}` : u.username) : null,
      host: u.host || null,
      port: u.port || null,
      hostname: u.hostname || null,
      hash: u.hash || null,
      search: u.search || null,
      query: query as unknown as string | URLSearchParams | null,
      pathname: u.pathname || null,
      path: (u.pathname || "") + (u.search || ""),
      href: u.href,
    };
  } catch {
    return {
      protocol: null,
      slashes: null,
      auth: null,
      host: null,
      port: null,
      hostname: null,
      hash: null,
      search: null,
      query: null,
      pathname: urlStr,
      path: urlStr,
      href: urlStr,
    };
  }
}

export function format(u: URL | {
  protocol?: string;
  slashes?: boolean;
  auth?: string;
  host?: string;
  hostname?: string;
  port?: string | number;
  pathname?: string;
  search?: string;
  query?: string | Record<string, string>;
  hash?: string;
}): string {
  if (u instanceof URL) return u.toString();
  let out = "";
  if (u.protocol) out += u.protocol + (u.protocol.endsWith(":") ? "" : ":");
  if (u.slashes !== false) out += "//";
  if (u.auth) out += u.auth + "@";
  if (u.host) out += u.host;
  else {
    if (u.hostname) out += u.hostname;
    if (u.port !== undefined && u.port !== null) out += ":" + u.port;
  }
  if (u.pathname) out += u.pathname;
  if (u.search) out += u.search.startsWith("?") ? u.search : "?" + u.search;
  else if (u.query) {
    if (typeof u.query === "string") out += "?" + u.query;
    else out += "?" + new URLSearchParams(u.query).toString();
  }
  if (u.hash) out += u.hash.startsWith("#") ? u.hash : "#" + u.hash;
  return out;
}

export function resolve(from: string, to: string): string {
  try {
    return new URL(to, from).toString();
  } catch {
    return to;
  }
}

export function domainToASCII(domain: string): string {
  return domain.toLowerCase();
}

export function domainToUnicode(domain: string): string {
  return domain;
}

export default {
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
  parse,
  format,
  resolve,
  domainToASCII,
  domainToUnicode,
};
