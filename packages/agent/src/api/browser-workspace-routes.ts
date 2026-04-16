import type http from "node:http";
import {
  closeBrowserWorkspaceTab,
  executeBrowserWorkspaceCommand,
  type BrowserWorkspaceCommand,
  evaluateBrowserWorkspaceTab,
  getBrowserWorkspaceSnapshot,
  getBrowserWorkspaceUnavailableMessage,
  hideBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
  navigateBrowserWorkspaceTab,
  openBrowserWorkspaceTab,
  showBrowserWorkspaceTab,
  snapshotBrowserWorkspaceTab,
} from "../services/browser-workspace.js";
import type { RouteRequestContext } from "./route-helpers.js";

type OpenBrowserWorkspaceBody = {
  url?: string;
  title?: string;
  show?: boolean;
  partition?: string;
  width?: number;
  height?: number;
};

type NavigateBrowserWorkspaceBody = {
  url?: string;
};

type EvaluateBrowserWorkspaceBody = {
  script?: string;
};

type BrowserWorkspaceCommandBody = BrowserWorkspaceCommand;

export interface BrowserWorkspaceRouteContext extends RouteRequestContext {}

export async function handleBrowserWorkspaceRoutes(
  ctx: BrowserWorkspaceRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json } = ctx;

  if (
    pathname !== "/api/browser-workspace" &&
    pathname !== "/api/browser-workspace/command" &&
    pathname !== "/api/browser-workspace/proxy" &&
    pathname !== "/api/browser-workspace/tabs" &&
    !pathname.startsWith("/api/browser-workspace/tabs/")
  ) {
    return false;
  }

  try {
    // ── Reverse proxy: fetch external URL server-side, strip framing headers ──
    if (pathname === "/api/browser-workspace/proxy" && method === "GET") {
      const rawUrl = new URL(req.url ?? "/", "http://localhost").searchParams.get("url");
      if (!rawUrl) {
        json(res, { error: "url query parameter is required" }, 400);
        return true;
      }
      await proxyBrowserWorkspaceUrl(res, rawUrl);
      return true;
    }

    if (pathname === "/api/browser-workspace" && method === "GET") {
      json(res, await getBrowserWorkspaceSnapshot());
      return true;
    }

    if (pathname === "/api/browser-workspace/command" && method === "POST") {
      const body =
        (await readJsonBody<BrowserWorkspaceCommandBody>(req, res)) ?? null;
      if (!body?.subaction) {
        json(res, { error: "subaction is required" }, 400);
        return true;
      }
      json(res, await executeBrowserWorkspaceCommand(body));
      return true;
    }

    if (pathname === "/api/browser-workspace/tabs" && method === "GET") {
      json(res, { tabs: await listBrowserWorkspaceTabs() });
      return true;
    }

    if (pathname === "/api/browser-workspace/tabs" && method === "POST") {
      const body =
        (await readJsonBody<OpenBrowserWorkspaceBody>(req, res)) ?? {};
      json(res, { tab: await openBrowserWorkspaceTab(body) });
      return true;
    }

    const match = pathname.match(
      /^\/api\/browser-workspace\/tabs\/([^/]+)(?:\/(navigate|eval|show|hide|snapshot))?$/,
    );
    if (!match) {
      return false;
    }

    const tabId = decodeURIComponent(match[1]).trim();
    const action = match[2] ?? null;

    if (!action && method === "DELETE") {
      const closed = await closeBrowserWorkspaceTab(tabId);
      json(
        res,
        closed ? { closed: true } : { closed: false },
        closed ? 200 : 404,
      );
      return true;
    }

    if (action === "show" && method === "POST") {
      json(res, { tab: await showBrowserWorkspaceTab(tabId) });
      return true;
    }

    if (action === "hide" && method === "POST") {
      json(res, { tab: await hideBrowserWorkspaceTab(tabId) });
      return true;
    }

    if (action === "snapshot" && method === "GET") {
      json(res, await snapshotBrowserWorkspaceTab(tabId));
      return true;
    }

    if (action === "navigate" && method === "POST") {
      const body = await readJsonBody<NavigateBrowserWorkspaceBody>(req, res);
      if (!body?.url?.trim()) {
        json(res, { error: "url is required" }, 400);
        return true;
      }
      json(res, {
        tab: await navigateBrowserWorkspaceTab({
          id: tabId,
          url: body.url,
        }),
      });
      return true;
    }

    if (action === "eval" && method === "POST") {
      const body = await readJsonBody<EvaluateBrowserWorkspaceBody>(req, res);
      if (!body?.script?.trim()) {
        json(res, { error: "script is required" }, 400);
        return true;
      }
      json(res, {
        result: await evaluateBrowserWorkspaceTab({
          id: tabId,
          script: body.script,
        }),
      });
      return true;
    }

    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes(getBrowserWorkspaceUnavailableMessage())
      ? 503
      : message.includes("only available in the desktop app")
        ? 409
        : message.includes("failed (404)")
          ? 404
          : message.includes("failed (409)")
            ? 409
            : 500;
    json(res, { error: message }, status);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Reverse proxy — fetches a URL server-side and strips framing restrictions
// so the content can be rendered inside an iframe on the dashboard.
// ---------------------------------------------------------------------------

/** Headers that prevent iframe embedding — stripped from proxied responses. */
const STRIPPED_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
]);

/** Headers that should not be forwarded from the upstream response. */
const SKIP_HEADERS = new Set([
  ...STRIPPED_HEADERS,
  "transfer-encoding",
  "connection",
  "keep-alive",
  "content-encoding", // we re-encode if needed
  "content-length", // recalculated after rewriting
]);

/**
 * Rewrite absolute and root-relative URLs in HTML so that sub-resources
 * (CSS, JS, images) load through the proxy or directly from the origin.
 */
function rewriteHtml(html: string, baseUrl: string): string {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return html;
  }

  // Inject a <base> tag so relative URLs resolve against the original site.
  // Insert right after <head> (or at the top if no <head>).
  const baseTag = `<base href="${origin}/">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
  }
  return baseTag + html;
}

async function proxyBrowserWorkspaceUrl(
  res: http.ServerResponse,
  targetUrl: string,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid URL" }));
    return;
  }

  // Only allow http(s) schemes
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Only http/https URLs are supported" }));
    return;
  }

  try {
    const upstream = await fetch(url.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") ?? "text/html";
    const isHtml = contentType.includes("text/html");

    // Forward safe headers from upstream
    const outHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
    };
    for (const [key, value] of upstream.headers.entries()) {
      if (!SKIP_HEADERS.has(key.toLowerCase())) {
        outHeaders[key] = value;
      }
    }

    if (isHtml) {
      let body = await upstream.text();
      body = rewriteHtml(body, url.href);
      outHeaders["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
      res.writeHead(upstream.status, outHeaders);
      res.end(body);
    } else {
      // Non-HTML (CSS, JS, images, etc.) — stream through
      const body = await upstream.arrayBuffer();
      outHeaders["Content-Length"] = String(body.byteLength);
      res.writeHead(upstream.status, outHeaders);
      res.end(Buffer.from(body));
    }
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}
