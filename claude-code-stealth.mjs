/**
 * Bun preload: routes Anthropic OAuth tokens (sk-ant-oat*) through the
 * Claude Code API so the milady runtime can use Max-plan subscription tokens.
 *
 * Sets ANTHROPIC_API_KEY from ~/.claude/.credentials.json if unset, then
 * patches global fetch to rewrite auth headers and inject the required
 * Claude Code system prefix + anthropic-beta header on requests to
 * api.anthropic.com.
 *
 * Must be synchronous — bun --preload runs before the main entry.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const creds = JSON.parse(
      readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf-8"),
    );
    const token = creds?.claudeAiOauth?.accessToken;
    if (token?.startsWith("sk-ant-oat")) {
      process.env.ANTHROPIC_API_KEY = token;
    }
  } catch {}
}

const STEALTH_GUARD = Symbol.for("eliza.claudeCodeStealthInstalled");
const CLAUDE_CODE_VERSION = "2.1.92";
const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";
const ANTHROPIC_BETA =
  "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24";

if (!globalThis[STEALTH_GUARD]) {
  const originalFetch = globalThis.fetch.bind(globalThis);

  const addSystemPrefix = (body) => {
    if (!body || typeof body !== "object") return body;
    const prefix = { type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX };
    if (Array.isArray(body.system)) {
      if (!body.system.some((b) => b?.text?.startsWith("You are Claude Code"))) {
        body.system.unshift(prefix);
      }
    } else if (typeof body.system === "string") {
      body.system = [prefix, { type: "text", text: body.system }];
    } else {
      body.system = [prefix];
    }
    return body;
  };

  const stealthFetch = async (input, init) => {
    let url;
    try {
      url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
    } catch {
      return originalFetch(input, init);
    }
    if (url.hostname !== "api.anthropic.com") return originalFetch(input, init);

    const request = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? request?.headers ?? undefined);
    const apiKey = headers.get("x-api-key");
    const authHeader = headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const setupToken = [apiKey, bearerToken].find((t) =>
      t?.startsWith("sk-ant-oat"),
    );
    if (!setupToken) return originalFetch(input, init);

    if (!url.searchParams.has("beta")) url.searchParams.set("beta", "true");
    headers.delete("x-api-key");
    headers.set("authorization", `Bearer ${setupToken}`);
    headers.set("anthropic-beta", ANTHROPIC_BETA);
    headers.set(
      "user-agent",
      `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
    );
    headers.set("x-app", "cli");

    let body = init?.body ?? request?.body;
    if (typeof body === "string") {
      try {
        body = JSON.stringify(addSystemPrefix(JSON.parse(body)));
      } catch {}
    }

    if (request && !init) {
      return originalFetch(
        new Request(url.toString(), {
          method: request.method,
          headers,
          body: typeof body === "string" ? body : undefined,
        }),
      );
    }
    return originalFetch(url.toString(), {
      ...init,
      headers,
      body: init ? body : undefined,
    });
  };

  if ("preconnect" in globalThis.fetch) {
    stealthFetch.preconnect = globalThis.fetch.preconnect;
  }
  globalThis.fetch = stealthFetch;
  globalThis[STEALTH_GUARD] = true;
}
